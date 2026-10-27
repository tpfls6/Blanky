// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set AI_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.AI_TEST_URL ?? 'http://127.0.0.1:5178'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-ai-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
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
async function wait(expression, label) { for (let i = 0; i < 80; i++) { if (await evaluate('Boolean('+expression+')')) return; await pause(100) } throw new Error('Timed out: ' + label) }
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
    if (!location.hostname || localStorage.getItem('schedule-test-seeded')) return;
    const owner = '11111111-1111-4111-8111-111111111111';
    const date = new Date();
    const today = [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{id:owner,name:'Test',nickname:'Test',email:'test@example.test',password:'test-only',avatar:null}]));
    localStorage.setItem('blanky.session.v1', owner);
    const common = {description:'',date:today,priority:'medium',status:'todo',dueDate:null,endDate:null,allDay:false,repeat:'none',categoryId:'test-category'};
    localStorage.setItem('blanky.library.'+owner, JSON.stringify({categories:[{id:'test-category',name:'Test category',parentId:null,color:'#7157db'}],items:[
      {...common,id:'task',kind:'task',title:'Drag task',startTime:'11:00',endTime:'12:00',duration:60},
      {...common,id:'event',kind:'event',title:'Drag event',startTime:'09:00',endTime:'10:30',duration:90},
      {...common,id:'plain',kind:'event',title:'Plain event',categoryId:null,startTime:'15:00',endTime:'16:00',duration:60}
    ],settings:{}}));
    localStorage.setItem('schedule-test-seeded','1');
  }).toString() + ')()' });
  await navigate(base + '/');
  await wait('document.querySelector("#home-entry")', 'home loaded');
  const initial = await evaluate('JSON.parse(localStorage.getItem('+q(library)+')).items.length');
  assert.ok(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="자동 분류"&&b.getAttribute("aria-pressed")==="true")'));
  for (const [text, collection, field] of [
    ['오늘 회의 때문에 힘들었다', 'diaries', 'body'],
    ['블로그에 쓸 아이디어: 새로운 기록 방식', 'memos', 'body'],
    ['데미안 30페이지 읽었다', 'logs', 'note'],
    ['미역국 레시피 미역 고기 간장 등등 오후5시', 'memos', 'body'],
  ]) {
    await fill('#home-entry', text);
    await click('button[aria-label="보내기"]');
    await wait('JSON.parse(localStorage.getItem('+q(library)+'))['+q(collection)+']?.some(row=>row['+q(field)+']==='+q(text)+')', 'auto '+collection);
    assert.equal(await evaluate('JSON.parse(localStorage.getItem('+q(library)+')).items.length'), initial, 'records must not become schedules');
    assert.equal(await evaluate('document.querySelectorAll("[data-analysis-item]").length'), 0);
  }
  await fill('#home-entry', '조용한 하루');
  await click('button[aria-label="보내기"]');
  await wait('JSON.parse(localStorage.getItem('+q(library)+')).memos.some(row=>row.body==="조용한 하루")','ambiguous record saved as memo');
  console.log('PASS: automatic records, recipe with time, ambiguous memo fallback');
  await fill('#home-entry', '오늘 오후 3시 검증회의');
  await click('button[aria-label="보내기"]');
  await wait('document.querySelector("[data-analysis-item]")', 'analysis review');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem('+q(library)+')).items.length'), initial, 'analysis must not auto-save');
  await evaluate(`(()=>{const select=document.querySelector('[data-analysis-item] select[aria-label="반복"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'weekly');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`document.querySelectorAll(${q('[aria-label="반복 요일"] button')}).length===7`,'weekday choices');
  await click('button[aria-label="일요일 반복"]');
  await button('확인 후 저장');
  await wait('JSON.parse(localStorage.getItem('+q(library)+')).items.some(i=>i.title==="검증회의")', 'review saved');
  const saved = await evaluate('JSON.parse(localStorage.getItem('+q(library)+')).items.find(i=>i.title==="검증회의")');
  assert.equal(saved.endTime, null, 'AI review must not invent one hour duration');
  assert.equal(saved.duration, null);
  assert.equal(saved.repeat, 'weekly');
  assert.ok(saved.repeatDays.includes(7),'Sunday selection persisted');
  await navigate(base + '/schedule');
  const nextOccurrence = new Date(Date.parse(saved.date+'T00:00:00Z')+7*86400000).toISOString().slice(0,10);
  await wait(`document.querySelector(${q('button[aria-label="'+nextOccurrence+'"]')})`,'future calendar date');
  assert.equal(await evaluate(`document.querySelector(${q('button[aria-label="'+nextOccurrence+'"]')}).dataset.hasEvent`),'true');
  await click('button[aria-label="'+nextOccurrence+'"]');
  await wait('document.body.textContent.includes("검증회의")', 'Calendar/Today includes repeated event');
  await button('직접 추가');
  await wait('document.querySelector("form.max-h-80")','manual schedule editor');
  await fill('form.max-h-80 input:not([type])','수동 반복 검증');
  await fill('form.max-h-80 input[type=time]','09:00');
  await evaluate(`(()=>{const input=document.querySelectorAll('form.max-h-80 input[type=time]')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'18:00');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate(`(()=>{const select=document.querySelector('form.max-h-80 select[aria-label="반복"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'weekly');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`document.querySelectorAll(${q('form.max-h-80 [aria-label="반복 요일"] button')}).length===7`,'manual weekly weekdays');
  await click('form.max-h-80 button[aria-label="월요일 반복"]');
  await click('form.max-h-80 button[aria-label="일요일 반복"]');
  await button('확인');
  await wait('JSON.parse(localStorage.getItem('+q(library)+')).items.some(i=>i.title==="수동 반복 검증")','manual recurrence saved');
  const manual = await evaluate('JSON.parse(localStorage.getItem('+q(library)+')).items.find(i=>i.title==="수동 반복 검증")');
  assert.equal(manual.repeat,'weekly'); assert.equal(manual.duration,540); assert.ok(manual.repeatDays.includes(1)&&manual.repeatDays.includes(7));
  await navigate(base + '/');
  await wait('document.querySelector("#home-entry")', 'home reloaded');
  await fill('#home-entry', '오후 3시 날짜없는회의');
  await click('button[aria-label="보내기"]');
  await wait('document.querySelector("[data-analysis-item]")', 'event without a date opens review');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem('+q(library)+')).memos.some(row=>row.body==="오후 3시 날짜없는회의")'), false, 'undated event is not a memo');
  await button('닫기');
  const before = await evaluate('JSON.parse(localStorage.getItem('+q(library)+')).items');
  await fill('#home-entry', '이번 주 공부 계획 세워줘');
  await click('button[aria-label="보내기"]');
  await wait('JSON.parse(localStorage.getItem('+q(library)+')).memos.some(row=>row.body==="이번 주 공부 계획 세워줘")', 'Planner failure memo fallback');
  await fill('#home-entry', '내일 오후 3시 회의하고 5시 운동');
  await click('button[aria-label="보내기"]');
  await wait('JSON.parse(localStorage.getItem('+q(library)+')).memos.some(row=>row.body==="내일 오후 3시 회의하고 5시 운동")', 'analysis failure memo fallback');
  assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem('+q(library)+')).items'), before, 'failed analysis must not change schedules');
  for (const path of ['/diary','/reading','/schedule']) {
    await navigate(base + path);
    await wait('document.querySelector("main")', path+' route');
  }
  await mkdir(resolve('.tmp/ai-tests'), { recursive: true });
  await writeFile(resolve('.tmp/ai-tests/review-harness.jsx'), `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { AnalysisReview } from '../../src/components/schedule/AnalysisReview.tsx';
    export function mount(result) {
      const node=document.createElement('div'); node.id='ai-harness'; node.style='position:fixed;inset:0;overflow:auto;background:white;z-index:9999;padding:16px'; document.body.append(node);
      window.aiSaved=[];
      createRoot(node).render(React.createElement(AnalysisReview,{analysis:result,categories:[],onClose:()=>{},onSave:async input=>{window.aiSaved.push(input);await new Promise(r=>setTimeout(r,80));return {...input,id:crypto.randomUUID()}}}));
    }
  `);
  const empty = {date:null,startTime:null,endTime:null,dueDate:null,endDate:null,categoryId:null};
  const mock = {version:1,route:'ai',items:[
    {id:'a',type:'event',source:'ai',confidence:0.9,draft:{...empty,title:'분리된 회의',date:'2026-10-14',startTime:'09:00',endTime:'18:00'},evidence:{},categoryReason:null,uncertainties:[{field:'endTime',reason:'오후 6시로 추정했어요.'}]},
    {id:'b',type:'task',source:'ai',confidence:0.8,draft:{...empty,title:'분리된 할 일'},evidence:{},categoryReason:null,uncertainties:[{field:'date',reason:'날짜 확인 필요'}]}
  ],relations:[{fromId:'a',toId:'b',type:'before',reason:'회의 후 작업'}],warnings:[]};
  await evaluate('(async()=>{const harness=await import("/.tmp/ai-tests/review-harness.jsx");harness.mount('+q(mock)+')})()');
  await wait('document.querySelectorAll("#ai-harness [data-analysis-item]").length===2','multi-item review');
  assert.ok(await evaluate('document.querySelector("#ai-harness").textContent.includes("회의 후 작업")'));
  await evaluate('(()=>{const btn=document.querySelector("#ai-harness [data-analysis-item=a] button");btn.click();btn.click()})()');
  await wait('document.querySelector("#ai-harness [role=alert]")?.textContent.includes("추정")','estimated time requires confirmation');
  assert.equal(await evaluate('window.aiSaved.length'),0);
  await click('#ai-harness [data-analysis-item=a] input[type=checkbox]');
  await evaluate('(()=>{const btn=document.querySelector("#ai-harness [data-analysis-item=a] button");btn.click();btn.click()})()');
  await wait('window.aiSaved.length===1','first item saved once');
  await pause(120);
  await click('#ai-harness [data-analysis-item=b] button');
  await wait('document.querySelector("#ai-harness [role=alert]")?.textContent.includes("날짜")','second item requires date');
  assert.equal(await evaluate('window.aiSaved.length'),1);
  await fill('#ai-harness [data-analysis-item=b] input[type=date]','2026-10-16');
  await click('#ai-harness [data-analysis-item=b] button');
  await wait('window.aiSaved.length===2','second item saved after date confirmation');
  assert.equal(await evaluate('window.aiSaved[1].kind'),'task');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await pause(150);
  assert.ok(await evaluate('document.querySelector("#ai-harness").scrollWidth<=window.innerWidth'),'mobile review width');
  assert.equal(errors.length,0,errors.join('\n'));
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve('.tmp/ai-tests/regression.png'), Buffer.from(screenshot.data,'base64'));
  console.log('PASS: manual and AI weekday selection/persistence, repeated Calendar/Today occurrence, duration arithmetic, estimated-time confirmation, unknown dates, offline/Planner non-mutation, Diary/Reading navigation, duplicate-click guard, mobile layout; no browser errors.');
} finally {
  ws.close(); server.kill();
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped;
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-ai-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
