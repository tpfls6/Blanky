// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set THEME_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.THEME_TEST_URL ?? 'http://127.0.0.1:5186'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.THEME_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set THEME_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-theme-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: null } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
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
async function wait(expression, label) { for (let i = 0; i < 300; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}

const owner='22222222-2222-4222-8222-222222222222',bob='33333333-3333-4333-8333-333333333333'
const outDir=resolve('.tmp/icon-alignment')
await mkdir(outDir,{recursive:true})
const checks=[];
async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(outDir,name+'.png'),Buffer.from(result.data,'base64'))}
try {
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.origin === '+q(base)+' && !localStorage.getItem("blanky.theme.test.seeded")){localStorage.setItem("blanky.accounts.v1",JSON.stringify([{id:'+q(owner)+',name:"Theme Test",nickname:"테마 테스트",email:"theme-test@example.test",password:"test-only",avatar:null},{id:'+q(bob)+',name:"Bob",nickname:"Bob",email:"theme-bob@example.test",password:"test-only",avatar:null}]));localStorage.setItem("blanky.session.v1",'+q(owner)+');localStorage.setItem("blanky.library.'+owner+'",JSON.stringify({items:[{id:"theme-event",kind:"event",title:"패키지 테스트 일정",description:"",date:"2026-10-08",startTime:"10:00",endTime:"11:00",status:"todo",priority:"normal",categoryId:null,allDay:false,repeatRule:"none",createdAt:"2026-10-08T00:00:00Z",updatedAt:"2026-10-08T00:00:00Z"}],categories:[],settings:{},diaries:[]}));localStorage.setItem("blanky.theme.test.seeded","1");}'})


 for(const width of [1440,390]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
 await navigate(base+'/store');await wait('!!document.querySelector(".theme-grid article a")','store');
 const path=await evaluate('document.querySelector(".theme-grid article a").getAttribute("href")');
 for(const route of [path,'/']) {
 await navigate(base+route);await wait('!!document.querySelector("a svg.lucide-arrow-left, a svg.lucide-arrow-up-right")','icon link');
 const result=await evaluate(`(()=>{const icon=document.querySelector('a svg.lucide-arrow-left, a svg.lucide-arrow-up-right');const link=icon.closest('a');const text=[...link.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());const range=document.createRange();range.selectNode(text);const a=icon.getBoundingClientRect(),b=range.getBoundingClientRect();return {display:getComputedStyle(link).display,align:getComputedStyle(link).alignItems,centerDifference:Math.abs(a.y+a.height/2-b.y-b.height/2),overflow:document.documentElement.scrollWidth>innerWidth}})()`);
 assert.equal(result.align,'center');assert.ok(result.centerDifference<=3,JSON.stringify(result));assert.equal(result.overflow,false);checks.push({width,route,...result});await screenshot(width+(route==='/'?'-home':'-detail'));
 }
 }
 console.log(JSON.stringify(checks,null,2));await writeFile(join(outDir,'results.json'),JSON.stringify(checks,null,2));
}finally{ws.close();server.kill();browser.kill()}
