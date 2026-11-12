/**
 * npm run test:nl-browser: Home input E2E for colloquial dates, mixed record + schedule, repeat rules, relative and
 * year-less dates. Local mode only (no Supabase, no AI): a throwaway Vite server and headless Chromium. The page
 * clock is pinned to 2026-11-09 10:00 (Monday) so expected dates are fixed. Evidence: .audit/runs/nl-input-e2e.
 */
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.NL_E2E_TEST_URL ?? 'http://127.0.0.1:5191'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-nl-e2e-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolveEndpoint, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolveEndpoint(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', data => { serverOutput += data })
server.stderr.on('data', data => { serverOutput += data })
for (let i = 0; i < 60; i++) {
  try { const res = await fetch(base); if (res.ok) break } catch {}
  await new Promise(r => setTimeout(r, 100))
  if (i === 59) throw new Error(serverOutput)
}
let targets
for (let i = 0; i < 50; i++) {
  try { targets = await fetch(browserEndpoint + '/json/list').then(r => r.json()); break } catch {}
  await new Promise(r => setTimeout(r, 100))
  if (i === 49) throw new Error(browserOutput)
}
const target = targets.find(t => t.type === 'page')
if (!target) throw new Error('No disposable browser test page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolveOpen, reject) => {
  ws.addEventListener('open', resolveOpen, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
let nextId = 0
let loadResolve = null
const pending = new Map()
const errors = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? ''))
  const pair = pending.get(message.id)
  if (pair) { pending.delete(message.id); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
function send(method, params = {}) {
  return new Promise((resolveSend, reject) => {
    const id = ++nextId
    pending.set(id, { resolve: resolveSend, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function navigate(url) {
  const loaded = new Promise(resolveLoad => { loadResolve = resolveLoad })
  const result = await send(url ? 'Page.navigate' : 'Page.reload', url ? { url } : {})
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms))
async function wait(expression, label) {
  for (let i = 0; i < 80; i++) {
    if (await evaluate('Boolean(' + expression + ')')) return
    await pause(100)
  }
  throw new Error('Timed out: ' + label)
}
const q = value => JSON.stringify(value)
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}

const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner
const evidence = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'nl-input-e2e')
await mkdir(evidence, { recursive: true })
const data = () => evaluate('JSON.parse(localStorage.getItem(' + q(library) + ') ?? "{}")')
const items = async () => (await data()).items ?? []
const has = expression => 'JSON.parse(localStorage.getItem(' + q(library) + ')).items?.some(i=>' + expression + ')'
const SEND = 'button[aria-label="보내기"]'

/** Sends one line from the Home composer, then waits for the app to go idle again. */
async function say(text) {
  await fill('#home-entry', text)
  await wait('!document.querySelector(' + q(SEND) + ').disabled', 'send enabled')
  await evaluate('document.querySelector(' + q(SEND) + ').click()')
  await pause(200)
  await wait('document.querySelector("#home-entry").value === "" && document.querySelectorAll("[aria-busy=true]").length === 0', 'sent ' + text)
  await pause(600)
}
async function shot(name, width = 1440) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 800 ? 844 : 1000, deviceScaleFactor: 1, mobile: width < 800 })
  await pause(400)
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(evidence, name), Buffer.from(image.data, 'base64'))
  await send('Emulation.clearDeviceMetricsOverride')
}

const results = []
async function check(name, run) {
  try { await run(); results.push({ name, ok: true }); console.log('ok   ' + name) }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log('FAIL ' + name + '\n     ' + error.message) }
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  // Fixed clock (2026-11-09 10:00 local) and a signed-in local account with onboarding done.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    const RealDate = Date
    const fixed = new RealDate(2026, 10, 9, 10, 0, 0).getTime()
    const started = RealDate.now()
    const now = () => fixed + (RealDate.now() - started)
    class FixedDate extends RealDate {
      constructor(...args) { if (args.length) super(...args); else super(now()) }
      static now() { return now() }
    }
    globalThis.Date = FixedDate
    if (!location.hostname || localStorage.getItem('nl-e2e-seeded')) return
    const ownerId = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: ownerId, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', ownerId)
    localStorage.setItem('blanky.library.' + ownerId, JSON.stringify({ categories: [], items: [], settings: { onboardingDone: true, onboardingPages: ['memo', 'diary', 'reading'] } }))
    localStorage.setItem('nl-e2e-seeded', '1')
  }).toString() + ')()' })
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home loaded')
  assert.equal(await evaluate('new Date().toDateString()'), 'Mon Nov 09 2026')

  await check('mixed: reading record saved with its fields, colloquial schedule saved for tomorrow', async () => {
    await say('데미안 50쪽 읽었고 낼 오후 3시 회의')
    await wait(has('i.title==="회의"'), 'meeting saved')
    const now = await data()
    const meeting = now.items.find(item => item.title === '회의')
    assert.deepEqual([meeting.date, meeting.startTime], ['2026-11-10', '15:00'])
    const book = (now.books ?? []).find(row => row.title === '데미안')
    assert.ok(book, 'book 데미안: ' + JSON.stringify(now.books))
    assert.equal(book.currentPage, 50)
    assert.equal((now.logs ?? []).filter(log => log.bookId === book.id).length, 1)
    assert.equal(now.items.length, 1, 'the reading part is not a schedule')
    await shot('01-mixed-1440.png')
    await shot('02-mixed-390.png', 390)
  })

  await check('colloquial: 담주 월욜 오전 11시 병원 → 2026-11-16 11:00', async () => {
    await say('담주 월욜 오전 11시 병원')
    await wait(has('i.title==="병원"'), 'hospital saved')
    const row = (await items()).find(item => item.title === '병원')
    assert.deepEqual([row.date, row.startTime], ['2026-11-16', '11:00'])
  })

  await check('repeat: 월욜마다 오전 9시 스터디 → weekly on Monday', async () => {
    await say('월욜마다 오전 9시 스터디')
    await wait(has('i.title==="스터디"'), 'study saved')
    const row = (await items()).find(item => item.title === '스터디')
    assert.deepEqual([row.repeat, row.repeatDays, row.date, row.startTime], ['weekly', [1], '2026-11-09', '09:00'])
  })

  await check('relative day: 세미나 발표, 그 전날까지 슬라이드 완성 → event 11-30, task due 11-29', async () => {
    await say('11월 30일 오후 2시 세미나 발표, 그 전날까지 슬라이드 완성')
    await wait(has('i.title==="슬라이드 완성"'), 'slides saved')
    const rows = await items()
    const talk = rows.find(item => item.title === '세미나 발표')
    const slides = rows.find(item => item.title === '슬라이드 완성')
    assert.deepEqual([talk.date, talk.startTime], ['2026-11-30', '14:00'])
    assert.deepEqual([slides.kind, slides.dueDate], ['task', '2026-11-29'])
  })

  await check('year-less: 1월 5일 오후 2시 치과 → 2027-01-05', async () => {
    await say('1월 5일 오후 2시 치과')
    await wait(has('i.title==="치과"'), 'dentist saved')
    assert.equal((await items()).find(item => item.title === '치과').date, '2027-01-05')
  })

  await check('late entry: 11월 3일 오후 2시 회고 waits for review instead of saving', async () => {
    const before = (await items()).length
    await say('11월 3일 오후 2시 회고')
    await wait('document.body.textContent.includes("지난 날짜예요")', 'past-date review shown')
    assert.equal((await items()).length, before)
    await shot('03-late-entry-review.png')
  })

  await check('mixed: diary + task with a colloquial deadline', async () => {
    await say('오늘 영화 봤는데 재밌었다, 금욜까지 감상문 제출')
    await wait(has('i.title.includes("감상문")'), 'task saved')
    const now = await data()
    const task = now.items.find(item => item.title.includes('감상문'))
    assert.deepEqual([task.kind, task.dueDate], ['task', '2026-11-13'])
    assert.ok((now.diaries ?? []).some(entry => JSON.stringify(entry).includes('재밌었다')), 'diary saved')
    assert.ok(!(now.diaries ?? []).some(entry => JSON.stringify(entry).includes('감상문')), 'the task is not in the diary')
  })

  await check('reload keeps everything', async () => {
    const before = await data()
    await navigate()
    await wait('document.querySelector("#home-entry")', 'home reloaded')
    const after = await data()
    assert.equal(after.items.length, before.items.length)
    assert.equal((after.books ?? []).length, (before.books ?? []).length)
    await shot('04-after-reload.png')
  })

  const final = await data()
  await writeFile(join(evidence, 'result.json'), JSON.stringify({
    surface: 'home-local', clock: '2026-11-09T10:00 local (pinned)', supabase: 'not-configured', ai: 'not-called',
    results,
    items: final.items.map(item => ({ title: item.title, kind: item.kind, date: item.date, startTime: item.startTime, dueDate: item.dueDate, repeat: item.repeat, repeatDays: item.repeatDays })),
    books: (final.books ?? []).map(book => ({ title: book.title, currentPage: book.currentPage, status: book.status })),
    errors,
  }, null, 2))
  if (errors.length) console.log('page errors:\n' + errors.join('\n'))
  const failed = results.filter(row => !row.ok).length
  console.log(`${results.length - failed}/${results.length} passed`)
  process.exitCode = failed || errors.length ? 1 : 0
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise(resolveStop => browser.once('exit', resolveStop))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-nl-e2e-')) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
