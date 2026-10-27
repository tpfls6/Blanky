// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = 'http://127.0.0.1:5178'
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
 await send('Page.addScriptToEvaluateOnNewDocument',{source:  "localStorage.setItem('blanky.accounts.v1',JSON.stringify([{id:'11111111-1111-4111-8111-111111111111',name:'Test',nickname:'Test',email:'test@example.test',password:'test-only',avatar:null}]));localStorage.setItem('blanky.session.v1','11111111-1111-4111-8111-111111111111');localStorage.setItem('blanky.library.11111111-1111-4111-8111-111111111111',JSON.stringify({memos:[{id:'memo',title:'Test',body:'',tags:[],categoryId:null,createdAt:'2026-10-15',updatedAt:'2026-10-15'}],categories:[],items:[],settings:{}}));"});
 await navigate(base+'/memo');
 await wait('!!document.querySelector(".memo-rich-content")','editor');
 await pause(100);
 await evaluate(`(() => {
   const editor = document.querySelector('.memo-rich-content').editor;
   const setOptions = editor.setOptions.bind(editor);
   window.memoOptionUpdates = 0;
   editor.setOptions = options => { window.memoOptionUpdates++; return setOptions(options); };
 })()`);
 const point=await evaluate('(()=>{const r=document.querySelector(".memo-rich-scroll").getBoundingClientRect();return {x:r.x+50,y:r.y+r.height/2}})()');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
 await send('Input.insertText',{text:'hello'});await pause(100);
 assert.equal(await evaluate('document.querySelector(".memo-rich-content").innerText'),'hello');
 for (const text of ['ㅎ', '하', '한']) {
   await send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
   await pause(100);
   assert.equal(await evaluate('document.querySelector(".memo-rich-content").innerText'), 'hello' + text);
 }
 await send('Input.insertText',{text:'한글 입력'});await pause(100);
 assert.equal(await evaluate('document.querySelector(".memo-rich-content").innerText'),'hello한글 입력');
 await fill('.memo-title', '수정한 제목');await pause(100);
 assert.equal(await evaluate('window.memoOptionUpdates'), 0, 'Typing must not reapply editor initialization options');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS',modifiers:2});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS',modifiers:2});await pause(100);
 assert.ok((await evaluate('localStorage.getItem("blanky.library.11111111-1111-4111-8111-111111111111")')).includes('한글 입력'));
 console.log('PASS: blank-area click, text input, Korean composition, Ctrl+S storage');
 // Wrapping/splitting are the operations that fail with duplicate model copies.
 await click('button[aria-label="굵게"]');
 await send('Input.insertText', { text: ' 강조' });
 await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
 await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
 await click('button[aria-label="글머리 목록"]');
 await send('Input.insertText', { text: '목록 항목' });await pause(100);
 assert.ok(await evaluate('!!document.querySelector(".memo-rich-content ul li")'));
 assert.ok((await evaluate('document.querySelector(".memo-rich-content").innerText')).includes('목록 항목'));
 const duplicateWarnings = diagnostics.filter(message => message.method === 'Runtime.consoleAPICalled' && JSON.stringify(message.params.args).includes('loaded more than once'));
 assert.equal(duplicateWarnings.length, 0, 'ProseMirror must be loaded once');
 console.log('PASS: formatting, paragraph splitting, list wrapping, no duplicate-module warnings');
 assert.equal(errors.length,0,errors.join("\n"));
} finally {
  ws.close(); server.kill();
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped;
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-schedule-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}

