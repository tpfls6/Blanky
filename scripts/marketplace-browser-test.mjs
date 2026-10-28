import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve('c:/Users/serin/Github/Blanky/.audit/runs/marketplace-store')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.MARKETPLACE_TEST_URL ?? 'http://127.0.0.1:5203'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')
const { mkdtemp } = await import('node:fs/promises')
const profile = await mkdtemp(join(tmpdir(), 'blanky-marketplace-test-'))

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
  throw new Error('Timed out: ' + label)
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(evidenceDir, name + '.png'), Buffer.from(result.data, 'base64'))
  log('screenshot ' + name + '.png')
}
const q = (value) => JSON.stringify(value)
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner

async function finish(ok, extra) {
  const payload = { started, ended: new Date().toISOString(), ok, log: logLines, errors, extra: extra ?? null, serverTail: serverOutput.slice(-1500) }
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify(payload, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + (() => {
      if (!location.hostname || localStorage.getItem('marketplace-test-seeded')) return
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
      localStorage.setItem('marketplace-test-seeded', '1')
    }).toString() + ')()',
  })

  await navigate(base + '/store?tab=templates')
  await wait('localStorage.getItem("blanky.session.v1")==="' + owner + '"', 'seeded session')
  await wait('[...document.querySelectorAll("h2")].some(h => h.textContent.includes("영화 기록"))', 'movie card')
  log('store shows official movie template')
  await shot('01-store-templates')

  await evaluate('[...document.querySelectorAll("a")].find(a => a.textContent.includes("영화 기록"))?.click()')
  await wait('location.pathname.startsWith("/store/templates/")', 'detail')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.includes("내 페이지에 추가"))', 'install button')
  await wait('[...document.querySelectorAll("p,li,td")].some(el => el.textContent.includes("기생충"))', 'sample preview')
  log('detail preview shows sample movie')
  await shot('02-template-detail')

  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("내 페이지에 추가"))?.click()')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).customPages.some(p => p.name==="영화 기록")', 'page stored')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).records.some(r => r.title==="기생충")', 'sample copied')
  const pageId = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).customPages.find(p => p.name==="영화 기록").id')
  log('installed movie page ' + pageId + ' from ' + await evaluate('location.pathname'))
  await navigate(base + '/pages/' + pageId)
  await wait('document.querySelector("[data-tour=save-template]")', 'user page chrome')
  await wait('[...document.querySelectorAll("p,td,h3,button")].some(el => el.textContent.includes("기생충"))', 'sample on page')
  await shot('03-installed-page')

  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="추가")?.click()')
  await wait('document.querySelector("input.text-2xl")', 'record form')
  await evaluate('(() => { const el = document.querySelector("input.text-2xl"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, "인터스텔라"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); })()')
  await evaluate('document.querySelector("form")?.requestSubmit()')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).records.some(r => r.title==="인터스텔라" || Object.values(r.values).includes("인터스텔라"))', 'user record saved')
  log('added installer record')

  await navigate(base + '/pages/' + pageId)
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).records.some(r => r.title==="인터스텔라")', 'record after refresh')
  await wait('[...document.querySelectorAll("td,p,h2,h3,button")].some(el => el.textContent.includes("인터스텔라"))', 'record visible after refresh')
  log('record survived refresh')
  await shot('04-after-refresh')

  await navigate(base + '/store/templates/publish')
  await wait('document.querySelector("h1")?.textContent.includes("스토어에 공유")', 'publish form')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="게시 요청")?.click()')
  await wait('location.pathname.startsWith("/store/templates/") && !location.pathname.includes("publish")', 'published listing')
  const listingId = await evaluate('location.pathname.split("/")[2]')
  log('published listing ' + listingId)
  await shot('05-published')

  const sourceId = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).customPages[0].id')
  await navigate(base + '/pages/' + sourceId)
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).records.some(r => r.title==="인터스텔라")', 'installer data independent after publish')
  log('installed records stayed after publish')

  await finish(true, { pageId, listingId })
  assert.equal(errors.length, 0, errors.join('\n'))
  log('PASS marketplace install preview persist publish')
} catch (error) {
  log('FAIL ' + (error instanceof Error ? error.message : String(error)))
  await finish(false, { error: error instanceof Error ? error.stack : String(error) }).catch(() => undefined)
  throw error
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise((resolvePromise) => browser.once('exit', resolvePromise))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-marketplace-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
