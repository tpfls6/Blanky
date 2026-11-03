import { createReadingRepository } from '../packages/api/src/readingRepository.ts'
import { SWATCHES } from '../src/constants/swatches.ts'
import { withPlannerTestUser } from './planner-test-user.mjs'
// Live check: shelf icon colors save to Supabase for every swatch, a custom HEX, and legacy tokens.
// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set AI_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.PLANNER_LIVE_TEST_URL ?? 'http://127.0.0.1:5197'
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
 await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
 await withPlannerTestUser(async session => {
  const db = () => session.client.from('reading_shelves').select('name,color').eq('user_id', session.userId).order('sort_order')
  const shown = name => evaluate('(()=>{const b=[...document.querySelectorAll(".reading-nav")].find(b=>b.textContent.includes(' + q(name) + '));return b?getComputedStyle(b.querySelector("span")).color:null})()')
  const rgb = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')'
  const pickColor = async label => { await click('.reading-icon-picker > button'); await wait('document.querySelector(".reading-icon-colors")', 'color picker'); await click('.reading-icon-colors button[aria-label=' + q(label) + ']') }
  await navigate(base + '/login'); await wait('document.querySelector("input[type=email]")', 'login')
  await fill('input[type=email]', session.email); await fill('input[type=password]', session.password); await click('button[type=submit]')
  await wait('document.querySelector("#home-entry")', 'authenticated Home')
  await navigate(base + '/reading'); await wait('document.querySelector("[aria-label=\'새 책장\']")', 'reading page')
  // Create one shelf per swatch, then edit each to the next swatch.
  for (const [i, s] of SWATCHES.entries()) {
   await click('[aria-label="새 책장"]'); await wait('document.querySelector(".reading-form")', 'shelf modal')
   await fill('.reading-form input.field', 'Swatch ' + s.name); await pickColor(s.name); await button('만들기')
   await wait('!document.querySelector(".reading-form")', 'create ' + s.name)
   assert.equal(await shown('Swatch ' + s.name), rgb(s.hex), 'created color shown for ' + s.name)
  }
  assert.deepEqual((await db()).data.map(r => r.color), SWATCHES.map(s => s.hex), 'create stores swatch HEX')
  for (const [i, s] of SWATCHES.entries()) {
   const next = SWATCHES[(i + 1) % SWATCHES.length]
   await click('[aria-label=' + q('Swatch ' + s.name + ' 책장 편집') + ']'); await wait('document.querySelector(".reading-form")', 'edit modal')
   await pickColor(next.name); await button('저장'); await wait('!document.querySelector(".reading-form")', 'update ' + s.name)
  }
  const edited = SWATCHES.map((_, i) => SWATCHES[(i + 1) % SWATCHES.length].hex)
  assert.deepEqual((await db()).data.map(r => r.color), edited, 'update stores swatch HEX')
  // Custom color from the native color input, persisted across reload.
  await click('[aria-label="새 책장"]'); await wait('document.querySelector(".reading-form")', 'custom modal')
  await fill('.reading-form input.field', 'Custom color'); await click('.reading-icon-picker > button'); await wait('document.querySelector("input[type=color]")', 'color input')
  await fill('input[type=color]', '#00ff7f'); await button('만들기'); await wait('!document.querySelector(".reading-form")', 'create custom')
  await navigate(); await wait('document.querySelector(".reading-nav")', 'reload')
  assert.equal(await shown('Custom color'), rgb('#00ff7f'), 'custom color survives reload')
  assert.equal((await db()).data.at(-1).color, '#00ff7f')
  // Invalid colors: rejected by app validation and by the DB constraint.
  const repo = createReadingRepository(session.client, session.userId)
  for (const color of ['blue', '#fff', '#12345g', 'rgb(0,0,0)']) {
   await assert.rejects(repo.createShelf({ name: 'bad', description: '', icon: '📚', color, sort_order: 99 }), /#RRGGBB/)
   const raw = await session.client.from('reading_shelves').insert({ user_id: session.userId, name: 'bad', color })
   assert.equal(raw.error?.code, '23514', 'DB rejects ' + color)
  }
  // Legacy theme-token rows still load and render.
  const legacy = await session.client.from('reading_shelves').insert({ user_id: session.userId, name: 'Legacy accent', color: 'accent', sort_order: 50 })
  assert.equal(legacy.error, null)
  await navigate(); await wait('document.body.innerText.includes("Legacy accent")', 'legacy shelf')
  assert.ok(await shown('Legacy accent'), 'legacy token shelf renders')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ swatchCreate: SWATCHES.length, swatchUpdate: SWATCHES.length, customReload: 'passed', invalidRejected: 4, legacyToken: 'passed' }))
  const cleanup = await session.admin.from('reading_shelves').delete().eq('user_id', session.userId); assert.equal(cleanup.error, null)
 })
} catch (error) { console.log(JSON.stringify({ testOnlyBrowserText: await evaluate('document.body.innerText.slice(-1500)').catch(() => ''), errors, server: serverOutput.slice(-2000) })); throw error
} finally {
 ws.close(); server.kill(); const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
 if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-planner-live-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
