import { readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.CUSTOM_TEST_URL ?? 'http://127.0.0.1:5196'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.CUSTOM_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set CUSTOM_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-custom-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolvePromise, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', (data) => {
    browserOutput += data
    const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/)
    if (match) resolvePromise(match[0].replace('ws:', 'http:'))
  })
  browser.on('exit', (code) => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', (data) => { serverOutput += data })
server.stderr.on('data', (data) => { serverOutput += data })
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(base)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 100))
  if (i === 79) throw new Error(serverOutput)
}
let targets
for (let i = 0; i < 50; i++) {
  try { targets = await fetch(browserEndpoint + '/json/list').then((r) => r.json()); break } catch {}
  await new Promise((r) => setTimeout(r, 100))
  if (i === 49) throw new Error(browserOutput)
}
const target = targets.find((item) => item.type === 'page')
if (!target) throw new Error('No disposable browser test page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolvePromise, reject) => {
  ws.addEventListener('open', resolvePromise, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
let nextId = 0
let loadResolve = null
const pending = new Map()
const errors = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  const pair = pending.get(message.id)
  if (pair) { pending.delete(message.id); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
function send(method, params = {}) {
  return new Promise((resolvePromise, reject) => {
    const id = ++nextId
    pending.set(id, { resolve: resolvePromise, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function navigate(url) {
  const loaded = new Promise((resolvePromise) => { loadResolve = resolvePromise })
  const result = await send(url ? 'Page.navigate' : 'Page.reload', url ? { url } : {})
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
async function wait(expression, label) {
  for (let i = 0; i < 150; i++) {
    if (await evaluate('Boolean(' + expression + ')')) return
    await pause(100)
  }
  const page = await evaluate('location.href + "\\n" + document.body.innerText.slice(0, 400)')
  throw new Error('Timed out: ' + label + '\n' + page + '\n' + serverOutput.slice(-1200))
}
const q = (value) => JSON.stringify(value)
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + (() => {
      if (!location.hostname || localStorage.getItem('custom-test-seeded')) return
      const owner = '11111111-1111-4111-8111-111111111111'
      localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: owner, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
      localStorage.setItem('blanky.session.v1', owner)
      localStorage.setItem('blanky.library.' + owner, JSON.stringify({
        categories: [],
        items: [],
        settings: { locale: 'ko', customTemplatesGuideSeen: false, nav: [{ id: 'home', visible: true }, { id: 'schedule', visible: true }, { id: 'activity', visible: true }, { id: 'diary', visible: true }, { id: 'reading', visible: true }, { id: 'memo', visible: true }, { id: 'workout-record', visible: true }] },
        recordTypes: [{ id: 'workout-record', name: '운동 기록', icon: 'Dumbbell', color: '#3C8664', description: '', schemaVersion: 1, version: 1, blocks: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }],
        customPages: [{ id: 'page-1', name: '기존 페이지', icon: 'StickyNote', description: '', sort: 0, schemaVersion: 1, blocks: [{ id: 'b1', type: 'text', props: { text: '안녕' } }], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }],
        pageTemplates: [],
      }))
      localStorage.setItem('custom-test-seeded', '1')
    }).toString() + ')()',
  })
  await navigate(base + '/custom')
  await wait('document.querySelector("[role=dialog]")', 'guide on first visit')
  assert.equal(await evaluate('document.querySelector("h1")?.textContent'), '커스텀 템플릿')
  assert.match(await evaluate('getComputedStyle(document.getElementById("app-sidebar")).transform'), /matrix\(|translate/)
  const closedX = await evaluate('document.getElementById("app-sidebar").getBoundingClientRect().right')
  assert.ok(closedX < 8, 'sidebar starts off canvas, right=' + closedX)
  assert.match(await evaluate('getComputedStyle(document.getElementById("app-sidebar-toggle")).borderTopColor'), /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 200 })
  await pause(360)
  const openX = await evaluate('document.getElementById("app-sidebar").getBoundingClientRect().right')
  assert.ok(openX > 100, 'hover opens sidebar, right=' + openX)
  const sideText = await evaluate('document.getElementById("app-sidebar").innerText')
  assert.match(sideText, /기존 페이지/)
  assert.equal(sideText.includes('운동 기록'), false)
  assert.equal(sideText.includes('새 페이지'), false)
  assert.equal(await evaluate('document.querySelectorAll("#app-sidebar button").length'), 0)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 200 })
  await pause(900)
  const hiddenX = await evaluate('document.getElementById("app-sidebar").getBoundingClientRect().right')
  assert.ok(hiddenX < 8, 'leave closes sidebar, right=' + hiddenX)
  await evaluate('document.getElementById("app-sidebar-toggle").click()')
  await pause(360)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 200 })
  await pause(900)
  assert.ok((await evaluate('document.getElementById("app-sidebar").getBoundingClientRect().right')) > 100, 'pin keeps sidebar open')
  await evaluate('document.getElementById("app-sidebar-toggle").click()')
  await pause(360)
  assert.ok((await evaluate('document.getElementById("app-sidebar").getBoundingClientRect().right')) < 8, 'unpin closes sidebar')
  const before = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).customPages.length')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("건너뛰기"))?.click()')
  await wait('!document.querySelector("[role=dialog]")', 'guide skipped')
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).customPages.length'), before)
  await navigate(base + '/custom')
  await wait('document.querySelector("h1")', 'custom reloaded')
  assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false)
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("사용 가이드"))?.click()')
  await wait('document.querySelector("[role=dialog]")', 'guide replay')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("건너뛰기"))?.click()')
  await wait('!document.querySelector("[role=dialog]")', 'guide closed again')
  await evaluate('document.querySelector("[data-tour=new-page]").click()')
  await wait('location.pathname.startsWith("/pages/")', 'new page opened')
  await wait('document.querySelector(".builder-canvas")', 'builder canvas')
  await evaluate('document.querySelector(".builder-canvas textarea, .builder-canvas input")?.focus()')
  const outline = await evaluate('getComputedStyle(document.querySelector(".builder-canvas textarea, .builder-canvas input")).outlineStyle')
  assert.equal(outline, 'none')
  await navigate(base + '/')
  await wait('document.body.innerText.includes("Blanky") || document.querySelector("textarea, input")', 'home')
  const homeSidebar = await evaluate('document.getElementById("app-sidebar").getBoundingClientRect().right')
  assert.ok(homeSidebar > 100, 'home sidebar restored, right=' + homeSidebar)
  await navigate(base + '/schedule')
  await wait('document.body.innerText.length > 20', 'schedule')
  await navigate(base + '/diary')
  await wait('document.body.innerText.length > 20', 'diary')
  await navigate(base + '/reading')
  await wait('document.body.innerText.length > 20', 'reading')
  await navigate(base + '/memo')
  await wait('document.body.innerText.length > 20', 'memo')
  await navigate(base + '/settings/general')
  await wait('[...document.querySelectorAll("select")].some(s => [...s.options].some(o => o.value === "en"))', 'language select')
  await evaluate('(() => { const el = [...document.querySelectorAll("select")].find(s => [...s.options].some(o => o.value === "en")); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, "en"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); const data = JSON.parse(localStorage.getItem(' + q(library) + ')); data.settings = { ...data.settings, locale: "en" }; localStorage.setItem(' + q(library) + ', JSON.stringify(data)); })()')
  await navigate(base + '/custom')
  await wait('document.querySelector("h1")', 'custom en')
  assert.equal(await evaluate('document.querySelector("h1")?.textContent'), 'Custom Templates')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("Guide"))?.click()')
  await wait('document.querySelector("[role=dialog]")', 'english guide')
  assert.match(await evaluate('document.querySelector("[role=dialog] h2")?.textContent || ""'), /page/i)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await pause(200)
  assert.equal(await evaluate('getComputedStyle(document.getElementById("app-sidebar")).display'), 'none')
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: overlay peek, guide first-visit/replay, no data mutation, builder outline none, core tabs, locale, mobile.')
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise((resolvePromise) => browser.once('exit', resolvePromise))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-custom-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
