// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.SCHEDULE_TEST_URL ?? 'http://127.0.0.1:5183'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.SCHEDULE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set SCHEDULE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-schedule-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''; server.stdout.on('data', data => { serverOutput += data }); server.stderr.on('data', data => { serverOutput += data })
for (let i=0; i<300; i++) { try { const res = await fetch(base); if(res.ok) break } catch {} await new Promise(r=>setTimeout(r,100)); if(i===299) throw new Error(serverOutput) }
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
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('deadline-test-seeded')) return;
    const owner='11111111-1111-4111-8111-111111111111';
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=k=>parts.find(p=>p.type===k).value;
    const today=get('year')+'-'+get('month')+'-'+get('day');
    localStorage.setItem('blanky.accounts.v1',JSON.stringify([{id:owner,name:'Test',nickname:'Test',email:'test@example.test',password:'test-only',avatar:null}]));
    localStorage.setItem('blanky.session.v1',owner);
    const common={kind:'task',description:'',date:today,startTime:null,endTime:null,duration:null,categoryId:null,priority:'medium',status:'todo',dueDate:null,endDate:null,allDay:false,repeat:'none'};
    localStorage.setItem('blanky.library.'+owner,JSON.stringify({categories:[],items:[{...common,id:'deadline',title:'Deadline test',dueDate:'2026-01-01'},{...common,id:'plain',title:'No deadline'}],settings:{}}));
    localStorage.setItem('deadline-test-seeded','1');
  }).toString()+')()' });
  await navigate(base+'/schedule');
  await wait('document.body?.innerText.includes("Deadline test")','tasks loaded');
  const stored=()=>evaluate('JSON.parse(localStorage.getItem('+q(library)+')).items');
  const choose=async(selector,value)=>evaluate('(()=>{const el=document.querySelector('+q(selector)+');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(el,'+q(value)+');el.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Deadline test")).click()');
  await wait('!!document.querySelector("form select")','editor loaded');
  await choose('form select','high');await button('확인');
  await wait('JSON.parse(localStorage.getItem('+q(library)+')).items.find(i=>i.id==="deadline").priority==="high"','priority saved');
  await navigate(base+'/schedule');await wait('document.body?.innerText.includes("Deadline test")','reloaded');
  assert.equal((await stored()).find(i=>i.id==='deadline').priority,'high');
  await choose('label select','high');
  assert.equal(await evaluate('[...document.querySelectorAll("li")].some(el=>el.innerText.includes("No deadline"))'),false);
  await choose('label select','all');await button('우선순위 정렬');
  await fill('input[aria-label="일정 또는 할 일"]','내일까지 중요한 보고서 제출');
  await button('전송');
  const review='section[aria-label="AI 분석 결과"]';
  await wait('!!document.querySelector('+q(review)+')','AI review');
  assert.equal(await evaluate('document.querySelector('+q(review)+').innerText.includes("AI 추천")'),true);
  assert.equal(await evaluate('[...document.querySelector('+q(review)+').querySelectorAll("label")].find(l=>l.textContent.startsWith("우선순위")).querySelector("select").value'),'high');
  await evaluate('(()=>{const el=[...document.querySelector('+q(review)+').querySelectorAll("label")].find(l=>l.textContent.startsWith("우선순위")).querySelector("select");el.value="low";el.dispatchEvent(new Event("change",{bubbles:true}))})()');
  await button('확인 후 저장');
  await wait('JSON.parse(localStorage.getItem('+q(library)+')).items.some(i=>i.title.includes("보고서")&&i.priority==="low")','AI priority override saved');
  await button('닫기');
  const before=await stored();
  await click('button[aria-label="No deadline \uC2DC\uAC04 \uCD94\uCC9C"]');
  await wait('!!document.querySelector("[data-planner-block]")','recommendation');
  assert.deepEqual(await stored(),before,'recommendation must not write');
  const block='[data-planner-block]';
  await fill(block+' input[type="number"]','30');
  await choose(block+' select','low');
  await evaluate('(()=>{const inputs=[...document.querySelectorAll("[data-planner-block] input[type=checkbox]")];inputs.at(-1).click()})()');
  const time=await evaluate('document.querySelector("[data-planner-block] input[type=time]").value');
  await button('추천 다시 생성');
  await wait('document.querySelector("[data-planner-block] select")?.value==="low"','regenerated priority');
  assert.equal(await evaluate('document.querySelector("[data-planner-block] input[type=time]").value'),time);
  assert.equal(await evaluate('document.querySelector("[data-planner-block] input[type=number]").value'),'30');
  await click('[data-planner-block] input[type="checkbox"]');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("선택한 0개 전체 적용")).disabled'),true);
  assert.deepEqual(await stored(),before,'excluding a recommendation must not write');
  await click('[data-planner-block] input[type="checkbox"]');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),true);
  await mkdir('.audit/runs/task-priority',{recursive:true});
  await writeFile('.audit/runs/task-priority/mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await writeFile('.audit/runs/task-priority/desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await button('선택한 1개 전체 적용');
  await wait('JSON.parse(localStorage.getItem('+q(library)+')).items.find(i=>i.id==="plain").startTime','existing task applied');
  const after=await stored();assert.equal(after.length,before.length);
  assert.equal(after.find(i=>i.id==='plain').priority,'low');
  assert.equal(after.find(i=>i.id==='plain').duration,30);
  assert.equal(after.find(i=>i.id==='deadline').dueDate,'2026-01-01');

  await navigate(base+'/schedule');await wait('document.body?.innerText.includes("No deadline")','applied reload');
  assert.equal((await stored()).find(i=>i.id==='plain').startTime,time);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: priority save/reload/filter/sort, recommendation read-only, estimate edits, confirmed regeneration, original-ID apply, duplicate protection, desktop/mobile overflow.');

} catch (error) { console.error(errors); console.error(await evaluate("document.body?.innerText")); throw error; } finally {
  ws.close(); server.kill();
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped;
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-schedule-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
