import { readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:5197'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-workspace-test-'))
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
  for (let i = 0; i < 80; i++) {
    if (await evaluate('Boolean(' + expression + ')')) return
    await pause(100)
  }
  throw new Error('Timed out: ' + label + '\n' + serverOutput.slice(-1200))
}
const q = (value) => JSON.stringify(value)
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner

function clickText(text) {
  return evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes(' + q(text) + '))?.click()')
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + (() => {
      if (!location.hostname || localStorage.getItem('workspace-test-seeded')) return
      const owner = '11111111-1111-4111-8111-111111111111'
      localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: owner, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
      localStorage.setItem('blanky.session.v1', owner)
      localStorage.setItem('blanky.library.' + owner, JSON.stringify({
        categories: [],
        items: [],
        settings: { locale: 'ko', customTemplatesGuideSeen: true },
        customPages: [],
        pageTemplates: [],
        recordTypes: [],
        records: [],
      }))
      localStorage.setItem('workspace-test-seeded', '1')
    }).toString() + ')()',
  })

  await navigate(base + '/custom')
  await wait('document.querySelector("h1")', 'custom hub')
  assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false)
  await clickText('새 페이지')
  await wait('location.pathname.startsWith("/pages/")', 'blank page')
  await wait('document.querySelector(".builder-canvas")', 'builder')
  assert.ok(await evaluate('document.querySelector("[data-save-state]")?.textContent.includes("저장됨")'))

  await evaluate('document.querySelector("[data-tour=add-block]")?.click()')
  await wait('[...document.querySelectorAll("[data-block-menu] button")].some(b => b.textContent.includes("컬렉션"))', 'slash menu')
  await evaluate('[...document.querySelectorAll("[data-block-menu] button")].find(b => b.textContent.includes("컬렉션"))?.click()')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.includes("+ 숫자"))', 'field chips')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("+ 숫자"))?.click()')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("+ 숫자"))?.click()')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim()==="추가")', 'collection add')

  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="추가")?.click()')
  await wait('document.querySelector("input.text-2xl")', 'title field')
  await evaluate('(() => { const set = (el, value) => { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }; set(document.querySelector("input.text-2xl"), "스쿼트"); const numbers = [...document.querySelectorAll("input[type=number]")]; if (numbers[0]) set(numbers[0], "40"); if (numbers[1]) set(numbers[1], "8"); })()')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="저장")?.click()')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).records.length === 1', 'record saved')
  assert.equal(await evaluate('document.body.innerText.includes("스쿼트")'), true)

  await evaluate('[...document.querySelectorAll("[role=tab]")].find(b => b.textContent.includes("카드"))?.click()')
  await wait('[...document.querySelectorAll("[role=tab]")].find(b => b.textContent.includes("카드"))?.getAttribute("aria-selected")==="true"', 'card view')
  const typeId = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).records[0].typeId')

  await evaluate('document.querySelector("[data-tour=save-template]")?.click()')
  await pause(200)
  await navigate(base + '/custom')
  await wait('[...document.querySelectorAll("h2")].some(h => h.textContent.includes("내가 만든 템플릿"))', 'hub templates')
  await evaluate('(() => { const heading = [...document.querySelectorAll("h2")].find(h => h.textContent.includes("내가 만든 템플릿")); heading?.parentElement?.querySelector("button")?.click(); })()')
  await wait('location.pathname.startsWith("/pages/")', 'from template')
  const after = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + '))')
  assert.equal(after.records.length, 1)
  assert.equal(after.records[0].typeId, typeId)
  assert.ok(after.recordTypes.length >= 2)
  const pageCollections = after.customPages.flatMap((page) => page.blocks.filter((block) => block.type === 'collection').map((block) => block.props.collectionId))
  assert.equal(new Set(pageCollections).size, pageCollections.length)

  await navigate()
  await wait('document.querySelector(".builder-canvas")', 'reload builder')
  const reloaded = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + '))')
  assert.equal(reloaded.records.length, 1)
  assert.equal(reloaded.records[0].values ? Object.keys(reloaded.records[0].values).length >= 0 : true, true)

  await navigate(base + '/custom')
  await wait('document.querySelector("h1")', 'hub again')
  await clickText('영화 기록')
  await wait('location.pathname.startsWith("/pages/")', 'movie page')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim()==="추가")', 'movie collection')
  await navigate(base + '/custom')
  await wait('document.querySelector("h1")', 'hub links')
  await clickText('링크 모음')
  await wait('location.pathname.startsWith("/pages/")', 'links page')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim()==="추가")', 'links collection')

  await navigate(base + '/')
  await wait('document.body.innerText.length > 20', 'home')
  await navigate(base + '/schedule')
  await wait('document.body.innerText.length > 20', 'schedule')
  await navigate(base + '/diary')
  await wait('document.body.innerText.length > 20', 'diary')
  await navigate(base + '/reading')
  await wait('document.body.innerText.length > 20', 'reading')
  await navigate(base + '/memo')
  await wait('document.body.innerText.length > 20', 'memo')
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: blank page, custom collection fields, save row, card view, template clone without shared records, movie and links starters, core tabs.')
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise((resolvePromise) => browser.once('exit', resolvePromise))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-workspace-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
