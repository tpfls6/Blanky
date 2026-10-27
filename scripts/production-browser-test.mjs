// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set AI_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.PRODUCTION_TEST_URL ?? 'http://127.0.0.1:5184'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-production-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server=spawn(process.execPath,['--input-type=module','-e',"import { build,preview } from 'vite';await build({logLevel:'silent',build:{outDir:'.tmp/production-smoke'},define:{'import.meta.env.VITE_SUPABASE_URL':'\"\"','import.meta.env.VITE_SUPABASE_ANON_KEY':'\"\"'}});const server=await preview({build:{outDir:'.tmp/production-smoke'},preview:{host:'127.0.0.1',port:5184,strictPort:true}});server.printUrls();"],{windowsHide:true,stdio:'pipe'});
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
  if (result.exceptionDetails) throw new Error((result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)+' '+serverOutput.slice(-1800))
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
 await send('Page.enable');await send('Runtime.enable');
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
  await wait('document.querySelector("#home-entry")','Home loaded');

 assert.ok(!await evaluate('performance.getEntriesByType("resource").some(row=>row.name.includes("readingIconCatalog"))'),'Reading catalog must stay lazy on Home');
 await navigate(base+'/schedule');await wait('document.body.textContent.includes("Drag task")','built Schedule route');
 await navigate(base+'/settings/planning');await wait('document.querySelector("section[aria-label]")','built settings route');
 await navigate(base+'/diary');await wait('document.querySelector(".diary-page")','built Diary route');
 await navigate(base+'/store');await wait('document.body.textContent.includes("테마 스토어")','built Theme route');
 await navigate(base+'/reading');await wait('document.querySelector("button[aria-label]")','built Reading route');
 await click('button[aria-label="새 책장"]');await button('📚 아이콘 선택').catch(()=>evaluate('[...document.querySelectorAll("button")].find(el=>el.textContent.includes("아이콘 선택")).click()'));
 await button('아이콘');await wait('document.querySelector(".reading-icon-results svg")','full lazy icon catalog');
 assert.ok(await evaluate('document.querySelector(".reading-icon-panel").textContent.includes("1854개")'),'full catalog stays intact');
 assert.equal(errors.length,0,errors.join('\n'));
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*MemoPage*.js']});await navigate(base+'/memo');await wait('document.body.textContent.includes("화면을 불러오지 못했어요")','failed route chunk recovery');await send('Network.setBlockedURLs',{urls:[]});await button('화면 다시 불러오기');await wait('document.querySelector("main")&&!document.querySelector("[role=alert]")','route reload recovery');
 console.log('PASS production chunks: Home, Schedule, settings, Diary, Theme, Reading and 1854 lazy icons; no runtime errors.');
}finally{ws.close();server.kill();const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await stopped;if(resolve(profile).startsWith(resolve(tmpdir())+'\\')&&profile.includes('blanky-production-test-'))await rm(profile,{recursive:true,force:true}).catch(()=>undefined)}
