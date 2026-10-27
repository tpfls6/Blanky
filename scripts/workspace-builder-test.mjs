import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve('c:/Users/serin/Github/Blanky/.audit/runs/workspace-builder')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:5198'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtempSafe()
async function mkdtempSafe() {
  const { mkdtemp } = await import('node:fs/promises')
  return mkdtemp(join(tmpdir(), 'blanky-workspace-test-'))
}

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
  const payload = {
    started,
    ended: new Date().toISOString(),
    ok,
    log: logLines,
    errors,
    extra: extra ?? null,
    serverTail: serverOutput.slice(-1500),
  }
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify(payload, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
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
  await wait('localStorage.getItem("blanky.session.v1")==="' + owner + '"', 'seeded session')
  log('logged in as seeded local user')
  await wait('document.querySelector("h1")?.textContent.includes("커스텀 템플릿")', 'custom hub')
  log('custom hub')
  await wait('document.querySelector("[data-tour=starters]")', 'starters')
  await evaluate('[...document.querySelector("[data-tour=starters]").querySelectorAll("button")].find(b => b.textContent.includes("운동 관리"))?.click()')
  await wait('location.pathname.startsWith("/pages/")', 'workout page')
  log('opened workout starter ' + await evaluate('location.pathname'))
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim()==="추가")', 'collection add')
  await wait('document.body.innerText.includes("날짜")', 'workout date field')
  await shot('01-workout-starter')

  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="추가")?.click()')
  await wait('document.querySelector("input.text-2xl")', 'title field')
  await evaluate('(() => { const set = (el, value) => { if (!el) return; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }; set(document.querySelector("input.text-2xl"), "스쿼트"); const date = document.querySelector("input[type=date]"); set(date, "2026-10-27"); const numbers = [...document.querySelectorAll("input[type=number]")]; if (numbers[0]) set(numbers[0], "40"); if (numbers[1]) set(numbers[1], "8"); })()')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="저장")?.click()')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).records.some(r => r.title==="스쿼트")', 'record saved')
  const saved = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).records.find(r => r.title==="스쿼트")')
  assert.equal(saved.title, '스쿼트')
  assert.ok(Object.values(saved.values).includes('2026-10-27') || Object.values(saved.values).some((value) => String(value).startsWith('2026-10-27')))
  log('saved squat ' + JSON.stringify(saved.values))
  await shot('02-after-save')

  const pageId = await evaluate('location.pathname.split("/")[2]')
  await navigate()
  await wait('document.querySelector(".builder-canvas")', 'reload builder')
  await wait('document.body.innerText.includes("스쿼트")', 'squat after reload')
  log('reload kept squat')

  await navigate(base + '/custom')
  await wait('document.querySelector("h1")', 'hub reopen')
  await evaluate('(() => { const heading = [...document.querySelectorAll("h2")].find(h => h.textContent.includes("내가 만든 페이지")); heading?.parentElement?.querySelector("a")?.click(); })()')
  await wait('location.pathname==="/pages/' + pageId + '"', 'reopened same page')
  await wait('document.body.innerText.includes("스쿼트")', 'squat on reopen')
  log('reopened page ' + pageId)

  await evaluate('(() => { const set = (el, value) => { const proto = HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }; const title = document.querySelector("input.text-xl"); set(title, "운동 관리 수정"); })()')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).customPages.find(p => p.id==="' + pageId + '").name==="운동 관리 수정"', 'renamed page')
  await navigate()
  await wait('document.querySelector("input.text-xl")?.value==="운동 관리 수정"', 'rename persisted')
  log('rename persisted')
  await shot('03-renamed')

  await evaluate('[...document.querySelectorAll("[role=tab]")].find(b => b.textContent.includes("캘린더"))?.click()')
  await wait('document.querySelector("[data-date=\\"2026-10-27\\"]")', 'calendar cell')
  assert.equal(await evaluate('document.querySelector("[data-date=\\"2026-10-27\\"]")?.innerText.includes("스쿼트")'), true)
  log('calendar shows squat on 2026-10-27')

  await evaluate('localStorage.removeItem("blanky.session.v1")')
  await navigate(base + '/login')
  await wait('document.querySelector("input[type=email]")', 'login form')
  await evaluate('(() => { const set = (el, value) => { const proto = HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }; set(document.querySelector("input[type=email]"), "test@example.test"); set(document.querySelector("input[type=password]"), "test-only"); document.querySelector("form")?.requestSubmit(); })()')
  await wait('location.pathname==="/"', 'home after login')
  await navigate(base + '/pages/' + pageId)
  await wait('document.querySelector("input.text-xl")?.value==="운동 관리 수정"', 'name after relogin')
  await wait('document.body.innerText.includes("스쿼트")', 'squat after relogin')
  log('relogin kept page and record')
  await shot('04-after-relogin')

  await navigate(base + '/')
  await wait('document.querySelector("textarea, [data-theme-slot=composer], h1")', 'home ui')
  await navigate(base + '/schedule')
  await wait('document.querySelector("[data-theme-slot], h1, form") && document.body.innerText.includes("일정")', 'schedule ui')
  await navigate(base + '/diary')
  await wait('document.querySelector(".diary-calendar, h1") || document.body.innerText.includes("일기")', 'diary ui')
  await navigate(base + '/reading')
  await wait('document.body.innerText.includes("독서")', 'reading ui')
  await navigate(base + '/memo')
  await wait('document.body.innerText.includes("메모")', 'memo ui')
  log('core tabs have labeled ui')
  assert.equal(errors.length, 0, errors.join('\n'))
  await finish(true, { pageId, record: saved })
  log('PASS workout starter save reload reopen relogin calendar')
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
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-workspace-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
