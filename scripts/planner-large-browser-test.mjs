// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set AI_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.PLANNER_LARGE_TEST_URL ?? 'http://127.0.0.1:5186'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-planner-large-test-'))
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
    import React from 'react';import{createRoot}from'react-dom/client';
    import{PlannerPreview}from'../../src/components/schedule/PlannerPreview.tsx';
    import{approvalFixture}from'../../tests/fixtures/planner.ts';
    import{recommendUnits,unitsFromPlan}from'../../packages/scheduling/src/replanning.ts';
    import{editsFromRecommendation}from'../../packages/scheduling/src/approval.ts';
    export function mount(){
     const original=approvalFixture(new Date(Date.now()+86400000).toISOString()),one=unitsFromPlan(original)[0];
     const units=Array.from({length:200},(_,index)=>({...one,id:'unit-'+index,taskId:'task-'+index,title:'작업 '+index,duration:25,dependencies:[],deadline:original.result.settings.endDate}));
     const settings={...original.result.settings,endDate:new Date(Date.parse(original.result.settings.now)+14*86400000).toISOString().slice(0,10),maxDailyMinutes:720,breakMinutes:0};units.forEach(unit=>unit.deadline=settings.endDate);
     const plan=recommendUnits(units,[],settings);plan.approval={token:'test-only',previewId:crypto.randomUUID(),expiresAt:new Date(Date.now()+7200000).toISOString()};
     const node=document.createElement('div');node.id='planner-harness';node.style='position:fixed;inset:0;overflow:auto;background:white;z-index:9999;padding:16px';document.body.append(node);window.plannerWrites=[];
     createRoot(node).render(<PlannerPreview input="200개 작업 재계획" plan={plan} initialDraft={{edits:editsFromRecommendation(plan).map(edit=>({...edit,confirmed:true})),saved:[]}} existing={[]} onApply={async blocks=>{window.plannerWrites.push(blocks);return {schedules:[],applied:blocks.map(block=>({blockId:block.id,scheduleId:'saved-'+block.id}))}}} onRegenerate={async()=>{}} onCancel={()=>{}}/>);
    }
  `);
  await evaluate('(async()=>{const module=await import("/.tmp/ai-tests/planner-harness.jsx");module.mount()})()');
  await wait('document.querySelectorAll("#planner-harness [data-planner-block]").length===20','first page of 200 blocks');
  await fill('#planner-harness [data-planner-block] input:not([type])','첫 페이지 수정');
  await evaluate('document.querySelectorAll("#planner-harness [data-planner-block]")[19].querySelector("input[type=checkbox]").click()');
  await button('다음');await wait('document.querySelector("#planner-harness nav[aria-label]")?.textContent.includes("2 / 10")','second page');
  await fill('#planner-harness [data-planner-block] input:not([type])','두 번째 페이지 수정');
  await button('이전');await wait('document.querySelector("#planner-harness [data-planner-block] input:not([type])")?.value==="첫 페이지 수정"','edits preserved across pages');
  assert.equal(await evaluate('window.plannerWrites.length'),0);
  await evaluate('[...document.querySelectorAll("#planner-harness button")].find(button=>button.textContent.includes("전체 적용")).click()');
  await wait('window.plannerWrites.length===1','one atomic approval across pages');
  assert.equal(await evaluate('window.plannerWrites[0].length'),199);assert.ok(await evaluate('window.plannerWrites[0].some(row=>row.title==="두 번째 페이지 수정")'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS 200-block Planner UI: pagination, persisted edits/exclusion, no pre-approval writes, all-page atomic apply.');
} finally {
  ws.close();server.kill();const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await stopped;
  if(resolve(profile).startsWith(resolve(tmpdir())+'\\')&&profile.includes('blanky-planner-large-test-'))await rm(profile,{recursive:true,force:true}).catch(()=>undefined);
}
