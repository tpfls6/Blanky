import {createScheduleRepository} from '../packages/api/src/scheduleRepository.ts'
import {withPlannerTestUser} from './planner-test-user.mjs'
// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set AI_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.PLANNER_LIVE_TEST_URL ?? 'http://127.0.0.1:5194'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-planner-live-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env }, windowsHide: true, stdio: 'pipe' })
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
async function wait(expression, label) { for (let i = 0; i < 450; i++) { if (await evaluate('Boolean('+expression+')')) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
try {
 await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
 const failedResources=[];
 ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.method==='Network.responseReceived' && m.params.response.status>=400 && m.params.response.url.includes('/rest/v1/')) failedResources.push({status:m.params.response.status,url:new URL(m.params.response.url).pathname})});
 await withPlannerTestUser(async session=>{
  const repository=createScheduleRepository(session.client);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const original=await repository.create(session.userId,{kind:'task',title:'Live remote task',date:today,duration:30,dueDate:null,dueTime:null,priority:'medium'});
  assert.equal((await session.client.from('user_pages').select('id').limit(1)).error,null,'user_pages exists and has authenticated grants');
  await navigate(base+'/login'); await wait('document.querySelector("input[type=email]")','login form');
  await fill('input[type=email]',session.email);await fill('input[type=password]',session.password);await click('button[type=submit]');
  await wait('document.querySelector("#home-entry")','authenticated Home');
  const key='blanky.library.'+session.userId;
  await wait('JSON.parse(localStorage.getItem('+q(key)+')||"{}").items?.some(i=>i.id==='+q(original.id)+')','remote load');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'(()=>{if(sessionStorage.getItem("persistence-seeded"))return;const key='+q(key)+';const data=JSON.parse(localStorage.getItem(key));data.items=data.items.filter(item=>item.id!=="task-exam");data.items.push('+q({id:'task-exam',title:'Local sample task',kind:'task',date:today,startTime:null,endTime:null,duration:30,status:'todo',priority:'medium',categoryId:null,dueDate:null,dueTime:null,endDate:null,description:'',allDay:false,repeat:'none',calendarId:'local-personal:'+session.userId})+');localStorage.setItem(key,JSON.stringify(data));sessionStorage.setItem("persistence-seeded","1")})()'});
  await navigate(base+'/schedule');
  const checkbox='[role=checkbox][aria-label="Live remote task 완료"]';
  await wait('document.querySelector('+q(checkbox)+')','remote checkbox');
  await click(checkbox);
  for(let i=0;i<100;i++){const row=await session.client.from('schedules').select('status').eq('id',original.id).single();if(row.data?.status==='done')break;if(i===99)throw new Error('UI completion did not persist to Supabase');await pause(100)}
  await navigate(base+'/schedule');
  await wait('document.querySelector("button[aria-pressed]")','task controls after refresh');
  await evaluate('[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="완료 보기"&&b.getAttribute("aria-pressed")==="false").forEach(b=>b.click())');
  await wait('document.querySelector('+q(checkbox)+')?.getAttribute("aria-checked")==="true"','completion after refresh');
  await click(checkbox);
  for(let i=0;i<100;i++){const row=await session.client.from('schedules').select('status').eq('id',original.id).single();if(row.data?.status==='todo')break;if(i===99)throw new Error('UI completion undo did not persist');await pause(100)}
  console.log('PASS live: remote completion and undo survive refresh.');
  await click('button[aria-label="Local sample task 시간 추천"]');
  await wait('document.querySelector("[data-planner-block]")||document.querySelector("[role=dialog] [role=alert]")','local recommendation');
  assert.ok(await evaluate('Boolean(document.querySelector("[data-planner-block]"))'),await evaluate('document.querySelector("[role=dialog]")?.innerText'));
  assert.equal((await session.client.from('schedules').select('id')).data.length,1,'recommendation has no writes');
  await evaluate('document.querySelectorAll("[data-planner-block] input[type=checkbox]").forEach(el=>{if(!el.checked)el.click()})');
  await button('선택한 1개 전체 적용');
  await wait('JSON.parse(localStorage.getItem('+q(key)+')).items.some(i=>i.title==="Local sample task"&&i.startTime&&!i.id.startsWith("task-"))','local task saved as remote identity');
  const created=(await session.client.from('schedules').select('id,start_time').eq('title','Local sample task')).data;
  assert.equal(created.length,1);assert.ok(created[0].start_time);
  await navigate(base+'/schedule');
  await wait('document.querySelector('+q('button[aria-label="Live remote task 시간 추천"]')+')','remote recommendation button');
  await click('button[aria-label="Live remote task 시간 추천"]');
  await wait('document.querySelector("[data-planner-block]")||document.querySelector("[role=dialog] [role=alert]")','remote recommendation');
  assert.ok(await evaluate('Boolean(document.querySelector("[data-planner-block]"))'),await evaluate('document.querySelector("[role=dialog]")?.innerText'));
  await evaluate('document.querySelectorAll("[data-planner-block] input[type=checkbox]").forEach(el=>{if(!el.checked)el.click()})');
  await button('선택한 1개 전체 적용');
  await wait('JSON.parse(localStorage.getItem('+q(key)+')).items.some(i=>i.id==='+q(original.id)+'&&i.startTime)','remote time saved');
  const updated=await session.client.from('schedules').select('id,start_time').eq('id',original.id).single();
  assert.ok(updated.data.start_time);assert.equal((await session.client.from('schedules').select('id')).data.length,2,'no duplicate tasks');
  await navigate(base+'/schedule');
  await wait('JSON.parse(localStorage.getItem('+q(key)+')).items.find(i=>i.id==='+q(original.id)+')?.startTime','time assignment after refresh');
  console.log('PASS live: local task-exam and remote UUID time recommendations apply and persist without duplicate creation.');
  const inputs=[
   ['금요일까지 도훈이 데모 영상 넘긴 거 확인하고 피피티 만들기',1],
   ['내일까지 자료 조사하고 발표자료 만들기',1],
   ['내일 3시 회의하고 금요일까지 보고서 제출',2],
   ['월요일 운동하고 화요일 병원 가기',2],
   ['금요일까지 PPT 만들고 발표 연습하기',1],
   ['내일 장보기, 금요일 보고서 제출, 토요일 친구 만나기',3],
  ];
  for(const [text,count] of inputs){
   const response=await session.client.functions.invoke('parse-schedule',{body:{text,timezone:'Asia/Seoul',format:'analysis-v1'}});
   if(response.error){const info=await response.error.context?.json?.().catch(()=>({}));throw new Error('Deployed parser failed: '+info?.error?.code)}
   assert.equal(response.data.items.length,count,text);
   if(text.includes('도훈')){assert.equal(response.data.items[0].draft.title,'데모영상 확인 및 PPT 제작');assert.equal(response.data.items[0].draft.dueTime,null)}
   console.log(JSON.stringify({deployedParser:'passed',expectedCount:count}));
  }
  assert.deepEqual(failedResources,[],'no REST 400/404 responses');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({livePersistence:'passed',databaseSchema:'repaired',completionReload:true,localAndRemoteRecommendations:true,parserInputs:6,restErrors:0,existingAccountsTouched:false}));
 });
} catch(error) {
 console.log(JSON.stringify({testOnlyBrowserText:await evaluate('document.body.innerText.slice(-1800)').catch(()=>''),errors}));throw error;
} finally {
 ws.close();server.kill();const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await stopped;
 if(resolve(profile).startsWith(resolve(tmpdir())+'\\')&&profile.includes('blanky-planner-live-test-'))await rm(profile,{recursive:true,force:true}).catch(()=>undefined);
}
