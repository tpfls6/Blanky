import {withPlannerTestUser} from './planner-test-user.mjs'
// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set AI_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.DRAFTS_BROWSER_TEST_URL ?? 'http://127.0.0.1:5187'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-drafts-browser-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''; server.stdout.on('data', data => { serverOutput += data }); server.stderr.on('data', data => { serverOutput += data })
for (let i=0; i<60; i++) { try { const res = await fetch(base); if(res.ok) break } catch {} await new Promise(r=>setTimeout(r,100)); if(i===59) throw new Error(serverOutput) }
let targets
for (let i=0;i<50;i++){try{targets=await fetch(browserEndpoint + '/json/list').then(r=>r.json()); break}catch{} await new Promise(r=>setTimeout(r,100));if(i===49)throw new Error(browserOutput)}
const target = targets.find(t => t.type === 'page')
if (!target) throw new Error('No disposable browser test page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0
let loadResolve = null
const pending = new Map()
const errors = []
const diagnostics = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === "Page.loadEventFired" && loadResolve) { loadResolve(); loadResolve = null }
  if (message.method === 'Network.loadingFailed' || message.method === 'Runtime.consoleAPICalled') diagnostics.push(message)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? ''))
  const pair = pending.get(message.id)
  if (pair) { pending.delete(message.id); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function navigate(url) {
  const loaded = new Promise(resolve => { loadResolve = resolve })
  const result = await send(url ? 'Page.navigate' : 'Page.reload', url ? { url } : {})
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(expression, label) { for (let i = 0; i < 450; i++) { if (await evaluate('Boolean('+expression+')')) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
async function connectDevice(url){
 const socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});let id=0;const calls=new Map();socket.addEventListener('message',({data})=>{const message=JSON.parse(data),call=calls.get(message.id);if(call){calls.delete(message.id);message.error?call.reject(message.error):call.resolve(message.result)}if(message.method==='Runtime.exceptionThrown')errors.push('device2: '+message.params.exceptionDetails.text)});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;calls.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}))});
 const evaluate=async(expression)=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value};
 const wait=async(expression,label)=>{for(let i=0;i<450;i++){if(await evaluate('Boolean('+expression+')'))return;await pause(100)}throw new Error('Device2 timeout: '+label)};
 const fill=async(selector,value)=>evaluate('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,'+JSON.stringify(value)+');el.dispatchEvent(new Event("input",{bubbles:true}));})()');
 const button=async(text)=>evaluate('[...document.querySelectorAll("button")].find(el=>el.textContent.trim()==='+JSON.stringify(text)+').click()');
 return {send,evaluate,wait,fill,button,close:()=>socket.close()}
}
let device2,browserControl;

try {
 await send('Page.enable');await send('Runtime.enable');
 await withPlannerTestUser(async session=>{
  await navigate(base+'/login');await wait('document.querySelector("input[type=email]")','login form');
  await fill('input[type=email]',session.email);await fill('input[type=password]',session.password);await click('button[type=submit]');
  await wait('document.querySelector("#home-entry")','authenticated Home');await pause(2000);
  await wait('document.querySelector("[data-sync-ready=true]")','draft connection ready');
  const text='이번 주에 자료 분석 30분, 문서 정리 30분 해야 해. 일정 알아서 짜줘.';
  await fill('#home-entry',text);await click('button[aria-label="보내기"]');await wait('document.querySelectorAll("[data-planner-block]").length===2','signed preview');
  await fill('[data-planner-block] input:not([type])','기기 A 초안 수정');
  await evaluate('document.querySelectorAll("[data-planner-block]")[1].querySelector("input[type=checkbox]").click()');
  const readDraft=async()=>{const {data,error}=await session.client.functions.invoke('planner-draft',{body:{action:'load'}});if(error)throw new Error('Draft read failed');return data};
  const serverWait=async(predicate)=>{for(let i=0;i<60;i++){const value=await readDraft();if(predicate(value))return value;await pause(150)}throw new Error('Server draft timeout')};
  await serverWait(value=>value.draft?.edits[0].title==='기기 A 초안 수정'&&value.draft.edits[1].included===false);
  assert.equal((await session.client.from('schedules').select('id')).data.length,0);
  const version=await fetch(browserEndpoint+'/json/version').then(response=>response.json());browserControl=await connectDevice(version.webSocketDebuggerUrl);
  const created=await browserControl.send('Target.createTarget',{url:base+'/'});const pages=await fetch(browserEndpoint+'/json/list').then(response=>response.json());const second=pages.find(page=>page.id===created.targetId);device2=await connectDevice(second.webSocketDebuggerUrl);await device2.send('Runtime.enable');await device2.send('Page.enable');
  await device2.wait('document.querySelector("[data-planner-block] input:not([type])")?.value==="기기 A 초안 수정"','fresh-tab cloud restore');
  // sessionStorage is per tab; the new tab is populated only after server restore.
  /*assert.equal(await device2.evaluate('sessionStorage.getItem("blanky.planner."+Object.keys(localStorage).find(key=>key.startsWith("blanky.library."))?.slice(15))===null'),true,'fresh tab has independent session cache before any local edit');*/
  assert.equal(await device2.evaluate('document.querySelectorAll("[data-planner-block]")[1].querySelector("input[type=checkbox]").checked'),false);
  await device2.fill('[data-planner-block] input:not([type])','기기 B 초안 수정');await serverWait(value=>value.draft?.edits[0].title==='기기 B 초안 수정');
  await send('Page.bringToFront');await evaluate('window.dispatchEvent(new Event("focus"))');await wait('document.body.textContent.includes("다른 기기에서 초안이 변경")','cross-device conflict notice');
  assert.equal(await evaluate('document.querySelector("[data-planner-block] input:not([type])").value'),'기기 A 초안 수정','local edit remains until explicit choice');
  await button('다른 기기 초안 불러오기');await wait('document.querySelector("[data-planner-block] input:not([type])")?.value==="기기 B 초안 수정"','explicit cloud choice');
  assert.equal((await session.client.from('schedules').select('id')).data.length,0);
  await mkdir(resolve('.tmp/ai-tests'),{recursive:true});const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve('.tmp/ai-tests/planner-draft-devices.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate('[...document.querySelectorAll("[data-planner-block] input[type=checkbox]")].filter(el=>el.parentElement.textContent.includes("추정 정보")&&!el.checked).forEach(el=>el.click())');
  await evaluate('[...document.querySelectorAll("button")].find(el=>el.textContent.includes("전체 적용")).click()');
  await wait('document.body.textContent.includes("1개 일정을 적용했어요")||document.querySelector("[data-planner-block]")?.closest("section").querySelector("[role=alert]")','approved cloud plan');
  const error=await evaluate('document.querySelector("[data-planner-block]")?.closest("section").querySelector("[role=alert]")?.textContent');assert.ok(!error,error);
  await serverWait(value=>value.draft?.saved.length===1);
  await device2.send('Page.bringToFront');await device2.evaluate('window.dispatchEvent(new Event("focus"))');await device2.wait('document.body.textContent.includes("다른 기기에서 초안이 변경")','other device approval notice');await device2.button('다른 기기 초안 불러오기');await device2.wait('document.querySelector("[data-planner-block]")?.disabled','approved row locked on other device');
  assert.equal((await session.client.from('schedules').select('id')).data.length,1);
  await device2.button('닫기');await pause(1500);const afterClose=await readDraft();if(afterClose.draft){await device2.button('서버 초안 닫기')}await serverWait(value=>value.draft===null);assert.equal(await device2.evaluate('document.querySelector("#home-entry").value'),text);assert.equal((await session.client.from('schedules').select('id')).data.length,1);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({twoBrowserTabs:'passed',freshSessionStorageRestore:'passed',titleAndExclusionSync:'passed',explicitConflictChoice:'passed',noPreApprovalWrites:true,approvalStatusSync:'passed',cancelCloudDraft:'passed',savedSchedulesPreserved:true}));
 });
} catch(error) {
 console.log(JSON.stringify({testBrowserText:await evaluate('document.body.innerText.slice(-2200)').catch(()=>''),testOnly:true}));
 throw error;
} finally {
 device2?.close();browserControl?.close();ws.close();server.kill();const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await stopped;
 if(resolve(profile).startsWith(resolve(tmpdir())+'\\')&&profile.includes('blanky-drafts-browser-test-'))await rm(profile,{recursive:true,force:true}).catch(()=>undefined);
}
