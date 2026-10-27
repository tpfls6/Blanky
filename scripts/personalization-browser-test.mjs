import {withPlannerTestUser} from './planner-test-user.mjs'
// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set AI_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.PERSONALIZATION_BROWSER_TEST_URL ?? 'http://127.0.0.1:5183'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-personalization-live-test-'))
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
try {
 await send('Page.enable');await send('Runtime.enable');
 await withPlannerTestUser(async session=>{
  await navigate(base+'/login');await wait('document.querySelector("input[type=email]")','login form');
  await fill('input[type=email]',session.email);await fill('input[type=password]',session.password);await click('button[type=submit]');
  await wait('document.querySelector("#home-entry")','authenticated Home');await pause(2000);
  await navigate(base+'/settings/planning');await wait('document.querySelector("section[aria-label]")','planning settings');
  await fill('section[aria-label] input[type=time]','09:00');
  await evaluate('document.querySelector("details").open=true');
  await evaluate('(()=>{const inputs=document.querySelectorAll("section[aria-label] input[type=time]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(inputs[1],"21:00");inputs[1].dispatchEvent(new Event("input",{bubbles:true}));})()');
  await fill('section[aria-label] input[type=number]','120');
  await evaluate('(()=>{const inputs=document.querySelectorAll("section[aria-label] input[type=time]");["14:00","16:00"].forEach((value,index)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(inputs[index+2],value);inputs[index+2].dispatchEvent(new Event("input",{bubbles:true}));});const select=document.querySelectorAll("section[aria-label] select")[1];Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,"focus");select.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await button('개인화 설정 저장');await wait('document.body.textContent.includes("개인화 설정을 저장했어요")','settings server save');
  await navigate(base+'/settings/planning');await wait('document.querySelectorAll("section[aria-label] input[type=time]")[2]?.value==="14:00"','settings reload persistence');
  const pref=await session.client.from('user_preferences').select('settings').eq('user_id',session.userId).single();assert.equal(pref.data.settings.scheduling.placementMode,'focus');
  await navigate(base+'/');await wait('document.querySelector("#home-entry")','Home');
  const text='이번 주에 데이터 분석 30분, 문서 작성 30분 해야 해. 일정 알아서 짜줘.';
  await fill('#home-entry',text);await click('button[aria-label="보내기"]');
  await wait('document.querySelectorAll("[data-planner-block]").length===2','real personalized preview');
  assert.equal((await session.client.from('schedules').select('id')).data.length,0);
  await fill('[data-planner-block] input:not([type])','개인화 승인 작업');
  const confirm=async()=>evaluate('[...document.querySelectorAll("[data-planner-block] input[type=checkbox]")].filter(el=>el.parentElement.textContent.includes("추정 정보")&&!el.checked).forEach(el=>el.click())');
  await confirm();await button('개별 적용');
  await wait('document.querySelector("section[aria-label]")?.textContent.includes("1개 일정을 적용했어요")','partial save');
  assert.equal((await session.client.from('schedules').select('id')).data.length,1);
  await button('남은 작업 다시 계획하기');await wait('document.querySelectorAll("[data-planner-block]").length===1','remaining-only preview');
  assert.equal((await session.client.from('schedules').select('id')).data.length,1);
  await confirm();await evaluate('[...document.querySelectorAll("button")].find(button=>button.textContent.includes("전체 적용")).click()');
  await wait('document.querySelector("section[aria-label]")?.textContent.includes("1개 일정을 적용했어요")','remaining save');
  const ai=(await session.client.from('schedules').select('*').eq('title','개인화 승인 작업').single()).data;assert.ok(ai);
  await button('닫기');assert.equal(await evaluate('document.querySelector("#home-entry").value'),text);
  const fixed=await session.client.from('schedules').insert({user_id:session.userId,title:'UI 고정 충돌 테스트',kind:'event',date:ai.date,start_time:ai.start_time,end_time:ai.end_time,duration_minutes:30}).select('*').single();assert.equal(fixed.error,null);
  await navigate(base+'/');await wait('document.body.textContent.includes("다른 일정과 겹쳐요")','automatic conflict notice');
  await button('재배치 추천 보기');await wait('document.body.textContent.includes("재배치 전후 비교")','reschedule comparison');
  const before=(await session.client.from('schedules').select('*').order('id')).data;assert.equal(before.length,3);
  await mkdir(resolve('.tmp/ai-tests'),{recursive:true});const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve('.tmp/ai-tests/personalization-reschedule.png'),Buffer.from(screenshot.data,'base64'));
  await confirm();await evaluate('[...document.querySelectorAll("button")].find(button=>button.textContent.includes("전체 적용")).click()');
  await wait('document.querySelector("section[aria-label]")?.textContent.includes("1개 일정을 적용했어요")||document.querySelector("section[aria-label] [role=alert]")','reschedule save');
  const error=await evaluate('document.querySelector("section[aria-label] [role=alert]")?.textContent');assert.ok(!error,error);
  const after=(await session.client.from('schedules').select('*').order('id')).data;assert.equal(after.length,3);assert.deepEqual(after.find(row=>row.id===fixed.data.id),fixed.data);assert.notEqual(after.find(row=>row.id===ai.id).start_time,ai.start_time);
  await navigate(base+'/schedule');await wait('document.body.textContent.includes("개인화 승인 작업")','Calendar/Today updated');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({authenticatedPersonalizationUI:'passed',settingsSaveReload:'passed',partialRemainingUI:'passed',conflictNotice:'passed',beforeAfterPreview:'passed',approvalUpdatesSameId:'passed',fixedProtected:'passed',CalendarToday:'passed',preApprovalWrites:0}));
 });
} catch(error) {
 console.log(JSON.stringify({testBrowserText:await evaluate('document.body.innerText.slice(-2200)').catch(()=>''),testOnly:true,browserErrors:errors,diagnostics:diagnostics.slice(-3)}));
 throw error;
} finally {
 ws.close();server.kill();const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await stopped;
 if(resolve(profile).startsWith(resolve(tmpdir())+'\\')&&profile.includes('blanky-personalization-live-test-'))await rm(profile,{recursive:true,force:true}).catch(()=>undefined);
}
