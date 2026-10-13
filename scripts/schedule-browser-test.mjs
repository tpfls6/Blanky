// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.SCHEDULE_TEST_URL ?? 'http://127.0.0.1:5174'
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
async function wait(expression, label) { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error('Timed out: ' + label) }
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
  await navigate(base + '/schedule');
  await wait('document.querySelectorAll(".theme-plan").length === 2', 'schedule loaded');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("div.theme-task")).borderLeftWidth'), '0px');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".theme-plan")).borderLeftWidth'), '3px');
  assert.equal(await evaluate('[...document.querySelectorAll(".theme-plan")].every(el=>el.draggable)'), true);
  assert.equal(await evaluate('[...document.querySelectorAll(".theme-task")].every(el=>el.draggable)'), true);
  async function move(title, hour, id, end) {
    const points = await evaluate('('+((title,hour)=>{
      const row=[...document.querySelectorAll('div.theme-task,div.theme-plan')].find(el=>el.textContent.includes(title));
      const target=[...document.querySelectorAll('li')].find(el=>el.querySelector(':scope > time')?.textContent===hour);
      row.scrollIntoView({block:'center'});
      target.scrollIntoView({block:'nearest'});
      const a=row.querySelector('button[data-theme-slot="button"]').getBoundingClientRect();
      const b=target.getBoundingClientRect();
      return {sx:a.left+Math.min(60,a.width/2),sy:a.top+a.height/2,tx:b.left+b.width/2,ty:b.top+b.height/2};
    }).toString()+')('+q(title)+','+q(hour)+')');
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.sx,y:points.sy});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:points.sx,y:points.sy,button:'left',clickCount:1});
    for(let step=1;step<=12;step++) {
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.sx+(points.tx-points.sx)*step/12,y:points.sy+(points.ty-points.sy)*step/12,button:'left',buttons:1});
      await pause(30);
    }
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:points.tx,y:points.ty,button:'left',clickCount:1});
    await wait('JSON.parse(localStorage.getItem('+q(library)+')).items.find(i=>i.id==='+q(id)+').startTime==='+q(hour), 'time persisted');
    const item = await evaluate('JSON.parse(localStorage.getItem('+q(library)+')).items.find(i=>i.id==='+q(id)+')');
    assert.equal(item.endTime,end);
  }
  await move('Drag task','14:00','task','15:00');
  await move('Drag event','12:00','event','13:30');
  await navigate(base + '/schedule');
  await wait('document.querySelector("div.theme-task")?.textContent.includes("14:00")', 'saved time after reload');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: task has no line; events have lines; assigned tasks and events drag to another hour, preserve duration, and persist after reload.');
} finally {
  ws.close(); server.kill();
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped;
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-schedule-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
