// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.SCHEDULE_TEST_URL ?? 'http://127.0.0.1:5182'
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
    if (!location.hostname || localStorage.getItem('timeline-seed')) return;
    const id = '11111111-1111-4111-8111-111111111111';
    const now = new Date();
    const date = [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{id,name:'Test',nickname:'Test',email:'test@example.test',password:'test-only',avatar:null}]));
    localStorage.setItem('blanky.session.v1',id);
    const common = {date,description:'',priority:'medium',status:'todo',dueDate:null,endDate:null,allDay:false,repeat:'none',categoryId:null};
    const rows = [
      ['long','event','근로','09:00','18:00'],
      ['short1','event','수업 제목이 매우 길어지는 경우에도 단어를 읽을 수 있어야 합니다','09:00','10:00'],
      ['short2','event','Overlapping meeting','09:00','10:00'],
      ['short3','event','Another meeting','09:00','10:00'],
      ['later','event','Later event','11:00','12:00'],
      ['task1','task','First task','13:00','14:00'],
      ['task2','task','Second task','14:00','15:00'],
      ['alone','event','Standalone','19:00','20:00'],
    ];
    localStorage.setItem('blanky.library.'+id,JSON.stringify({categories:[],items:rows.map(([id,kind,title,startTime,endTime])=>({...common,id,kind,title,startTime,endTime,duration:(Number(endTime.slice(0,2))-Number(startTime.slice(0,2)))*60})),settings:{dayStartTime:'07:00',dayEndTime:'23:00'}}));
    localStorage.setItem('timeline-seed','1');
  }).toString()+')()' });
  await navigate(base+'/schedule');
  await wait('document.querySelectorAll("[data-timeline-id]").length===8','timeline');
  const rect = id => evaluate(`(()=>{const r=document.querySelector('[data-timeline-id="${id}"]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()`);
  const long = await rect('long'), short = await rect('short1'), later = await rect('later'), alone = await rect('alone');
  assert.ok(later.width > short.width*2.5,'later event expands into free columns');
  assert.ok(alone.width > long.width*3,'independent group uses full width');
  assert.ok(Math.abs(long.height/short.height-9)<.01,'actual duration determines height');
  assert.ok((await rect('task1')).x >= long.right,'task stays beside long event');
  assert.equal((await rect('task1')).x,(await rect('task2')).x,'non-overlapping tasks reuse column');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".schedule-card-title")).wordBreak'),'keep-all');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-timeline-id=short1] .schedule-card-title")).webkitLineClamp'),'1');
  const checkNoCollisions = async () => assert.equal(await evaluate(`(()=>{const rows=[...document.querySelectorAll('[data-timeline-id]')].map(e=>({id:e.dataset.timelineId,r:e.getBoundingClientRect()}));return rows.every((a,i)=>rows.slice(i+1).every(b=>a.r.bottom<=b.r.top+.5||b.r.bottom<=a.r.top+.5||a.r.right<=b.r.left+.5||b.r.right<=a.r.left+.5))})()`),true);
  await checkNoCollisions();
  for (const width of [390,768,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await pause(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),true,'no page overflow '+width);
    assert.ok(await evaluate('Math.min(...[...document.querySelectorAll("[data-timeline-id]")].map(e=>e.getBoundingClientRect().width))>=130'),'readable card width');
    await checkNoCollisions();
    if (width === 390) {
      await mkdir(resolve('.tmp/timeline-layout'),{recursive:true});
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(resolve('.tmp/timeline-layout/mobile.png'),Buffer.from(shot.data,'base64'));
    }
  }
  await mkdir(resolve('.tmp/timeline-layout'),{recursive:true});
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(resolve('.tmp/timeline-layout/desktop.png'),Buffer.from(shot.data,'base64'));
  // Drop onto an existing card, keeping the original drag/drop behavior.
  await evaluate(`(()=>{const grid=document.querySelector('.schedule-time-grid'),target=document.querySelector('[data-timeline-id=long] .schedule-card-title'),r=grid.getBoundingClientRect(),dt=new DataTransfer();dt.setData('text/plain','task1');target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,clientY:r.top+5*44+10,dataTransfer:dt}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,clientY:r.top+5*44+10,dataTransfer:dt}));})()`);
  await wait(`JSON.parse(localStorage.getItem(${q(library)})).items.find(i=>i.id==='task1').startTime==='12:00'`,'drag saved');
  await checkNoCollisions();
  await evaluate(`document.querySelector('[data-timeline-id=short1] [role=slider]').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown'});
  await wait(`JSON.parse(localStorage.getItem(${q(library)})).items.find(i=>i.id==='short1').endTime==='10:15'`,'resize saved');
  assert.ok(Math.abs((await rect('short1')).height-55)<1);
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-timeline-id=short1] .schedule-card-title")).webkitLineClamp'),'2');
  await checkNoCollisions();
  await evaluate(`document.querySelector('[data-timeline-id=task1] [role=checkbox]').click()`);
  await wait(`JSON.parse(localStorage.getItem(${q(library)})).items.find(i=>i.id==='task1').status==='done'`,'checkbox saved');
  await navigate(base+'/schedule');
  await wait('document.querySelectorAll("[data-timeline-id]").length===8','reload');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: overlap groups, width expansion, long titles, checkbox rows, mobile/tablet/desktop bounds, drag and resize recalculate and persist.');

} finally {
  ws.close(); server.kill();
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped;
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-schedule-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
