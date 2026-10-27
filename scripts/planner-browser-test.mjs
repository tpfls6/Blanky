// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set AI_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.PLANNER_TEST_URL ?? 'http://127.0.0.1:5181'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-planner-test-'))
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
  await wait('document.querySelector("#home-entry")','Home loaded');
  await mkdir(resolve('.tmp/ai-tests'),{recursive:true});
  await writeFile(resolve('.tmp/ai-tests/planner-harness.jsx'),`
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{PlannerPreview}from'../../src/components/schedule/PlannerPreview.tsx';
    import{approvalFixture}from'../../tests/fixtures/planner.ts';
    import{scheduleTasks}from'../../packages/scheduling/src/engine.ts';
    export function mount(){
      const plan=approvalFixture(new Date(Date.now()+86400000).toISOString());plan.approval={token:'test-only',previewId:'mock-'+crypto.randomUUID(),expiresAt:new Date(Date.now()+7200000).toISOString()};
      const pending=structuredClone(plan.result.tasks[0].task);pending.id='unplaced';pending.title='미배치 작업';pending.deadline='2020-01-01';pending.deadlineIsEstimate=true;pending.sourceItem.id='unplaced';pending.sourceItem.draft.title='미배치 작업';
      plan.analysis.analysis.items.push(pending.sourceItem);plan.analysis.tasks.push({...plan.analysis.tasks[0],sourceTaskId:'unplaced',deadline:'2020-01-01',deadlineIsEstimate:true});
      plan.result=scheduleTasks([...plan.result.tasks.map(row=>row.task),pending],[],plan.result.settings);
      const node=document.createElement('div');node.id='planner-harness';node.style='position:fixed;inset:0;overflow:auto;background:white;z-index:9999;padding:16px';document.body.append(node);
      window.plannerWrites=[];window.plannerCancelled=false;window.plannerRegens=0;
      function Harness(){const[existing,setExisting]=useState([]);window.plannerConflict=(enabled)=>setExisting(enabled?[{id:'fixed',kind:'event',date:plan.result.blocks[0].startAt.slice(0,10),startTime:plan.result.blocks[0].startAt.slice(11,16),endTime:plan.result.blocks[0].endAt.slice(11,16),duration:60,status:'todo'}]:[]);
        return <PlannerPreview input="이번 주 공부 계획 세워줘" plan={plan} existing={existing} onApply={async blocks=>{if(window.plannerSaveError)throw new Error('로그인이 만료되었어요.');window.plannerWrites.push(blocks);await new Promise(resolve=>setTimeout(resolve,100));return{schedules:[],applied:blocks.map(block=>({blockId:block.id,scheduleId:'saved-'+block.id}))}}} onRegenerate={async()=>{window.plannerRegens++;throw new Error('OpenAI 분석 실패')}} onCancel={()=>{window.plannerCancelled=true}}/>}
      createRoot(node).render(<Harness/>);
    }
  `);
  await evaluate('(async()=>{const module=await import("/.tmp/ai-tests/planner-harness.jsx");module.mount()})()');
  await wait('document.querySelectorAll("#planner-harness [data-planner-block]").length===2','Planner preview');
  assert.equal(await evaluate('window.plannerWrites.length'),0,'preview must not save');
  assert.ok(await evaluate('document.querySelector("#planner-harness").textContent.includes("미배치")'));
  assert.ok(await evaluate('[...document.querySelectorAll("#planner-harness button")].find(button=>button.textContent.includes("전체 적용")).disabled'),'estimates require confirmation');
  await evaluate('[...document.querySelectorAll("#planner-harness [data-planner-block] input[type=checkbox]")].filter((el,index)=>index%2===1).forEach(el=>el.click())');
  await fill('#planner-harness [data-planner-block] input:not([type])','사용자가 수정한 제목');
  await evaluate('(()=>{const select=document.querySelector("#planner-harness [data-planner-block] select");select.value="high";select.dispatchEvent(new Event("change",{bubbles:true}))})()');
  await evaluate('window.plannerConflict(true)');
  await wait('document.querySelector("#planner-harness").textContent.includes("겹쳐요")','live conflict validation');
  assert.equal(await evaluate('window.plannerWrites.length'),0);
  await evaluate('window.plannerConflict(false)');
  await evaluate('document.querySelectorAll("#planner-harness [data-planner-block]")[1].querySelector("input[type=checkbox]").click()');
  await wait('[...document.querySelectorAll("#planner-harness button")].some(button=>button.textContent.includes("선택한 1개 전체 적용")&&!button.disabled)','partial selection');
  await button('추천 다시 생성');
  await wait('document.querySelector("#planner-harness [role=alert]")?.textContent.includes("OpenAI")','AI failure visible');
  assert.equal(await evaluate('document.querySelector("#planner-harness [data-planner-block] input:not([type])").value'),'사용자가 수정한 제목','regeneration failure retains edits');
  await evaluate('window.plannerSaveError=true');
  await evaluate('[...document.querySelectorAll("#planner-harness button")].find(button=>button.textContent.includes("전체 적용")).click()');
  await wait('document.querySelector("#planner-harness [role=alert]")?.textContent.includes("로그인")','login expiry visible');
  assert.equal(await evaluate('window.plannerWrites.length'),0);
  await evaluate('window.plannerSaveError=false');
  await evaluate('(()=>{const button=[...document.querySelectorAll("#planner-harness button")].find(button=>button.textContent.includes("전체 적용"));button.click();button.click()})()');
  await wait('document.querySelector("#planner-harness").textContent.includes("적용 완료")','approval result');
  assert.equal(await evaluate('window.plannerWrites.length'),1,'double clicks must not duplicate');
  assert.equal(await evaluate('window.plannerWrites[0].length'),1);
  assert.equal(await evaluate('window.plannerWrites[0][0].title'),'사용자가 수정한 제목');
  assert.equal(await evaluate('window.plannerWrites[0][0].priority'),'high');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(150);
  assert.ok(await evaluate('document.querySelector("#planner-harness").scrollWidth<=window.innerWidth'),'mobile width');
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve('.tmp/ai-tests/planner-mobile.png'),Buffer.from(screenshot.data,'base64'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS Mock Planner UI: preview without writes, edits, exclusion, estimates, unplaced tasks, live conflict, API/login errors preserve draft, approval, double-click guard, mobile.');
} finally {
  ws.close();server.kill();const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await stopped;
  if(resolve(profile).startsWith(resolve(tmpdir())+'\\')&&profile.includes('blanky-planner-test-'))await rm(profile,{recursive:true,force:true}).catch(()=>undefined);
}
