import {createTemplateRepository} from '../packages/api/src/templateRepository.ts'
import {forkSnapshot} from '../src/features/marketplace/install.ts'
import {officialListings} from '../src/features/marketplace/official.ts'
import {withPlannerTestUser} from './planner-test-user.mjs'
// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set AI_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.PLANNER_LIVE_TEST_URL ?? 'http://127.0.0.1:5196'
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
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { preview } from "vite"; await preview({ preview: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true } });'], { env: { ...process.env }, windowsHide: true, stdio: 'pipe' })
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
async function wait(expression, label) { for (let i = 0; i < 1200; i++) { if (await evaluate('Boolean('+expression+')')) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
try {
 await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
 await navigate(base+'/login');
 const failed=[];
 ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.method==='Network.responseReceived'&&m.params.response.status>=400&&m.params.response.url.includes('/rest/v1/'))failed.push({status:m.params.response.status,path:new URL(m.params.response.url).pathname})});
 await withPlannerTestUser(async session=>{
  const repo=createTemplateRepository(session.client);
  const listings=await repo.list();assert.ok(listings.length>=4);
  assert.equal(await repo.isAdmin(),false);
  assert.deepEqual(await repo.myInstalls(),[]);assert.deepEqual(await repo.myFavorites(),[]);
  const source=forkSnapshot(officialListings()[0].snapshot);
  const inserted=await session.client.from('user_pages').insert({id:source.page.id,user_id:session.userId,name:'Marketplace verification',icon:source.page.icon,kind:'page',blocks:source.page.blocks,collections:source.collections});
  assert.equal(inserted.error,null);
  try {
   const listingId=await repo.publish({sourcePageId:source.page.id,name:'Marketplace verification',description:'Temporary test template',category:'fitness',tags:[],thumbnailUrl:'',gallery:[],language:'ko',guide:'',sampleIds:[]});
   const own=await repo.get(listingId);assert.ok(own?.snapshot);assert.equal(own.status,'pending_review');
   const installed=forkSnapshot(own.snapshot);
   const requestId=crypto.randomUUID();
   const first=await repo.install(listingId,requestId,installed);
   const retry=await repo.install(listingId,requestId,installed);
   assert.equal(first.pageId,installed.page.id);assert.equal(retry.pageId,first.pageId);assert.equal(retry.replayed,true);
   const pages=await session.client.from('user_pages').select('id').eq('id',first.pageId);assert.equal(pages.error,null);assert.equal(pages.data.length,1);
   const collections=await session.client.from('custom_record_types').select('id').in('id',installed.collections.map(row=>row.id));assert.equal(collections.error,null);assert.equal(collections.data.length,installed.collections.length);
   await repo.setFavorite(session.userId,listingId,true);assert.equal((await repo.myFavorites()).length,1);
   await repo.setFavorite(session.userId,listingId,false);assert.equal((await repo.myFavorites()).length,0);
   console.log('PASS live: template listing, private publish/version, install, duplicate-request replay, collections, favorites.');
   await navigate(base+'/login');await wait('document.querySelector("input[type=email]")','login');
   await fill('input[type=email]',session.email);await fill('input[type=password]',session.password);await click('button[type=submit]');
   await wait('document.querySelector("#home-entry")','authenticated Home');
   await navigate(base+'/store?tab=templates');
   await wait('document.body.innerText.includes("가계부")','live store');
   await pause(1200);
   assert.equal(await evaluate('document.body.innerText.includes("필요한 테이블이 없습니다")'),false);
   assert.equal(await evaluate('document.body.innerText.includes("Supabase DB 구조가 이전")'),false);
   await navigate(base+'/schedule');await wait('document.querySelector(".priority-filter-select")','priority filter');
   for(const width of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
    const layout=await evaluate('(()=>{const s=document.querySelector(".priority-filter-select");const l=s.closest("label");const range=document.createRange();range.selectNodeContents(l.firstChild);const t=range.getBoundingClientRect(),r=s.getBoundingClientRect();return {delta:Math.abs(t.top+t.height/2-r.top-r.height/2),height:r.height,font:getComputedStyle(s).fontSize,display:getComputedStyle(l).display}})()');
    assert.ok(['flex','inline-flex'].includes(layout.display));assert.equal(layout.height,28);assert.equal(layout.font,'12px');assert.ok(layout.delta<=2,JSON.stringify(layout));
   }
   await mkdir('.tmp/marketplace-live',{recursive:true});
   await writeFile('.tmp/marketplace-live/filter-alignment.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
   assert.deepEqual(failed,[],'no REST 400/404');assert.deepEqual(errors,[]);
   console.log(JSON.stringify({liveStore:'passed',filterAlignment:'passed desktop/mobile',restErrors:0,existingAccountsTouched:false}));
  } finally {
   // Only this marked test account's rows; leave public listings and counters untouched.
   const installs=await session.admin.from('template_installs').delete().eq('user_id',session.userId);assert.equal(installs.error,null);
   const owned=await session.admin.from('template_listings').delete().eq('creator_id',session.userId);assert.equal(owned.error,null);
  }
 });
} catch(error) {console.log(JSON.stringify({testOnlyBrowserText:await evaluate('document.body.innerText.slice(-1500)').catch(()=>''),errors,server:serverOutput.slice(-2000),loadErrors:diagnostics.filter(item=>item.method==='Network.loadingFailed').map(item=>item.params.errorText)}));throw error;
} finally {
 ws.close();server.kill();const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await stopped;
 if(resolve(profile).startsWith(resolve(tmpdir())+'\\')&&profile.includes('blanky-planner-live-test-'))await rm(profile,{recursive:true,force:true}).catch(()=>undefined);
}
