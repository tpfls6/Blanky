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
  await mkdir(resolve('.tmp/ai-tests'), { recursive: true });
  await writeFile(resolve('.tmp/ai-tests/step-harness.jsx'), `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { AnalysisReview } from '../../src/components/schedule/AnalysisReview.tsx';
    let root;
    export function mount(analysis, { failSave = false } = {}) {
      root?.unmount();
      document.body.innerHTML='<div id="ai-harness"></div><div style="height:3000px">filler</div>';
      window.aiSaved=[]; window.batchCalls=0; window.reviewClosed=0; window.failSave=failSave;
      root=createRoot(document.getElementById('ai-harness'));
      const render=()=>root.render(React.createElement(React.StrictMode,null,window.reviewClosed?null:React.createElement(AnalysisReview, {
        analysis, categories: [], onClose:()=>{window.reviewClosed++;render()},
        onSave:async x=>{await new Promise(r=>setTimeout(r,80)); if(window.failSave) throw new Error('서버 저장 실패'); window.aiSaved.push(x); return {...x,id:crypto.randomUUID()}},
        onSaveAll: async inputs=>{window.batchCalls++; await new Promise(r=>setTimeout(r,80)); if(window.failSave) throw new Error('서버 저장 실패'); window.aiSaved=inputs}
      })));
      render();
    }
  `);
  await navigate(base + '/');
  const mount = (analysis, options = {}) => evaluate('(async()=>{const h=await import("/.tmp/ai-tests/step-harness.jsx");h.mount('+q(analysis)+','+q(options)+')})()');
  const open = 'document.querySelector("dialog[data-analysis-review]")?.open';
  const draft = {date:'2026-10-30', startTime:null,endTime:null,dueDate:'2026-10-30',dueTime:null,endDate:null,categoryId:null};
  const task = id => ({id,type:'task',source:'ai',confidence:0.9,draft:{...draft,title:id},evidence:{},categoryReason:null,uncertainties:[]});
  const mock = {version:1, route:'ai',items:['a','b','c'].map(task),relations:[],warnings:[]};
  const single = {version:1, route:'ai',items:[{...task('solo'),type:'event',draft:{...draft,title:'단일 회의',startTime:'10:00',endTime:'11:00'}}],relations:[],warnings:[]};

  // Single result: centered modal, background scroll locked, footer save closes on success.
  await mount(single);
  await wait(open,'single dialog');
  assert.equal(await evaluate('document.body.style.overflow'),'hidden','background scroll locked');
  const box = await evaluate('(()=>{const r=document.querySelector("dialog[data-analysis-review]").getBoundingClientRect();return {l:r.left,r:innerWidth-r.right,t:r.top,b:innerHeight-r.bottom,w:r.width}})()');
  assert.ok(Math.abs(box.l-box.r)<=1 && Math.abs(box.t-box.b)<=1,'centered '+JSON.stringify(box));
  assert.ok(box.w<=576+1,'desktop width capped');
  await fill('[data-analysis-item=solo] input:not([type])','수정한 회의');
  await evaluate('(()=>{const b=[...document.querySelectorAll("dialog footer button")].find(b=>b.textContent==="확인 후 저장");b.click();b.click()})()');
  await wait('window.reviewClosed===1','closed after single save');
  assert.equal(await evaluate('window.aiSaved.length'),1,'saved once');
  assert.equal(await evaluate('window.aiSaved[0].title'),'수정한 회의');
  assert.equal(await evaluate('document.body.style.overflow'),'','scroll restored');

  // Failed save keeps the modal open with the error.
  await mount(single,{failSave:true});
  await wait(open,'failing dialog');
  await button('확인 후 저장');
  await wait('document.querySelector("dialog [role=alert]")?.textContent.includes("서버 저장 실패")','failure shown');
  assert.equal(await evaluate('window.reviewClosed'),0); assert.ok(await evaluate(open),'modal stays after failure');

  // ESC, X button and backdrop all go through the unsaved-changes confirm.
  await evaluate('window.confirm=()=>false');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await pause(100);
  assert.equal(await evaluate('window.reviewClosed'),0,'cancelled confirm keeps modal');
  await evaluate('window.confirm=()=>true');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await wait('window.reviewClosed===1','ESC closes');
  await mount(single); await wait(open,'reopen');
  await click('dialog button[aria-label="닫기"]');
  await wait('window.reviewClosed===1','X closes');
  await mount(single); await wait(open,'reopen');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:5,y:5,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:5,y:5,button:'left',clickCount:1});
  await wait('window.reviewClosed===1','backdrop closes');
  await mount(single); await wait(open,'reopen');
  const inside = await evaluate('(()=>{const r=document.querySelector("dialog header").getBoundingClientRect();return {x:r.left+20,y:r.top+20}})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...inside,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...inside,button:'left',clickCount:1});
  await pause(100);
  assert.equal(await evaluate('window.reviewClosed'),0,'click inside keeps modal');
  await evaluate('window.confirm=()=>false');

  // Multiple results: tabs and prev/next switch items; edits survive switching.
  await mount(mock);
  await wait(open,'multi dialog');
  const visible = '[...document.querySelectorAll("[data-analysis-item]")].filter(n=>n.getClientRects().length).length';
  assert.equal(await evaluate(visible),1);
  assert.equal(await evaluate('document.querySelectorAll("dialog [role=tab]").length'),3,'item tabs');
  await fill('[data-analysis-item=a] input:not([type])','edited first');
  await button('다음'); await fill('[data-analysis-item=b] input:not([type])','edited second');
  await button('이전');
  assert.equal(await evaluate('document.querySelector("[data-analysis-item=a] input:not([type])").value'),'edited first');
  await click('dialog [role=tab]:nth-child(3)');
  assert.ok(await evaluate('document.querySelector("[data-analysis-item=c]").getClientRects().length>0'),'tab switches item');
  await button('하나로 합치기');
  await wait('document.querySelector("[data-analysis-item=combined]")','merged preview');
  assert.ok(await evaluate('document.querySelector("[data-analysis-item=combined] input:not([type])").value.includes("edited second")'));
  await fill('[data-analysis-item=combined] input:not([type])','edited merged');
  await button('각각 저장하기'); await button('하나로 합치기');
  assert.equal(await evaluate('document.querySelector("[data-analysis-item=combined] input:not([type])").value'),'edited merged');
  await button('각각 저장하기'); await click('dialog [role=tab]:nth-child(3)');
  await fill('[data-analysis-item=c] input:not([type])','');
  await button('전체 저장');
  await wait('document.querySelector("dialog [role=alert]")','validation');
  assert.equal(await evaluate('window.batchCalls'),0);
  await click('[data-analysis-item=c] ~ label input');
  // Batch failure keeps the modal; retry succeeds and closes it.
  await evaluate('window.failSave=true');
  await button('전체 저장');
  await wait('document.querySelector("dialog [role=alert]")?.textContent.includes("서버 저장 실패")','batch failure shown');
  assert.equal(await evaluate('window.reviewClosed'),0);
  await evaluate('window.failSave=false');
  await evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent==="전체 저장");b.click();b.click()})()');
  await wait('window.reviewClosed===1','closed after batch save');
  assert.equal(await evaluate('window.batchCalls'),2,'one call per click run');
  assert.equal(await evaluate('window.aiSaved.length'),2);
  assert.equal(await evaluate('window.aiSaved[1].title'),'edited second');

  // Mobile: modal fits the viewport, only its body scrolls.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:640,deviceScaleFactor:1,mobile:true});
  await mount(mock);
  await wait(open,'mobile dialog');
  const mobile = await evaluate('(()=>{const d=document.querySelector("dialog[data-analysis-review]");const r=d.getBoundingClientRect();const body=d.querySelector("header + div");return {w:r.width,h:r.height,top:r.top,bottom:r.bottom,scrolls:body.scrollHeight>body.clientHeight,footer:d.querySelector("footer").getBoundingClientRect().bottom<=r.bottom+1,overflowX:document.documentElement.scrollWidth<=innerWidth}})()');
  assert.ok(mobile.w<=390-12 && mobile.top>=0 && mobile.bottom<=640,'mobile fits '+JSON.stringify(mobile));
  assert.ok(mobile.scrolls,'long form scrolls inside the modal body');
  assert.ok(mobile.footer && mobile.overflowX,'footer visible, no horizontal overflow');
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve('.tmp/ai-tests/step-review-mobile.png'),Buffer.from(screenshot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await pause(100);
  const desktop=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve('.tmp/ai-tests/step-review-desktop.png'),Buffer.from(desktop.data,'base64'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: single and multi modal, centered/capped width, scroll lock, ESC/X/backdrop close, auto-close on save, failure keeps modal, tabs and navigation edits, merge/separate, validation, double-click guard, mobile fit and inner scroll.');
} finally {
  ws.close(); server.kill();
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped;
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-ai-test-')) await rm(profile,{recursive:true,force:true}).catch(()=>undefined);
}
