/**
 * npm run test:intent-partial-browser: a multi-intent message where one new item fails to save. The cancel and the
 * other new item must land once, the failed item must stay offered for 실행, and the retry must save only it.
 * Local mode only (no Supabase, no AI); the failure comes from a dev-only hook. Evidence: .audit/runs/intent-partial-retry.
 */
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.PARTIAL_E2E_TEST_URL ?? 'http://127.0.0.1:5192'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-partial-e2e-'))
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
const evidence = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'intent-partial-retry')
await mkdir(evidence, { recursive: true })
const data = () => evaluate('JSON.parse(localStorage.getItem(' + q(library) + ') ?? "{}")')
const SEND = 'button[aria-label="보내기"]'
const RUN = '[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="실행")'
const count = (rows, title) => rows.filter(item => item.title === title).length
async function shot(name) {
  await pause(600)
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(evidence, name), Buffer.from(image.data, 'base64'))
}

const results = []
async function check(name, run) {
  try { await run(); results.push({ name, ok: true }); console.log('ok   ' + name) }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log('FAIL ' + name + '\n     ' + error.message) }
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  // Fixed clock (Mon 2026-11-09 10:00 local) and one saved one-off meeting on Wednesday to cancel.
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
    if (!location.hostname || localStorage.getItem('partial-e2e-seeded')) return
    const ownerId = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: ownerId, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', ownerId)
    const meeting = { id: 'meeting-1', kind: 'event', title: '팀 회의', description: '', date: '2026-11-11', startTime: '14:00', endTime: '15:00', duration: 60, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'none', repeatDays: [], categoryId: null }
    localStorage.setItem('blanky.library.' + ownerId, JSON.stringify({ categories: [], items: [meeting], settings: { onboardingDone: true, onboardingPages: ['memo', 'diary', 'reading'] } }))
    localStorage.setItem('partial-e2e-seeded', '1')
  }).toString() + ')()' })
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home loaded')

  await check('partial failure: the cancel and one new item land, the failed item is kept for 실행', async () => {
    // Any save request containing 테니스 fails, as a server error would.
    await evaluate('window.__blankyFailCreate = title => title.includes("테니스")')
    await fill('#home-entry', '수요일 팀 회의 취소됐어 그리고 금요일 오후 3시 치과 예약 있어 그리고 토요일 오후 2시 테니스 약속 있어')
    await wait('!document.querySelector(' + q(SEND) + ').disabled', 'send enabled')
    await evaluate('document.querySelector(' + q(SEND) + ').click()')
    // A plan that waits for 실행 is run once; an automatic one runs by itself.
    await wait('document.body.textContent.includes("일부만 처리했어요") || ' + RUN + '.length > 0', 'plan shown or run')
    if (!(await evaluate('document.body.textContent.includes("일부만 처리했어요")'))) {
      await evaluate(RUN + '.at(-1).click()')
      await wait('document.body.textContent.includes("일부만 처리했어요")', 'partial result shown')
    }
    const rows = (await data()).items
    assert.equal(count(rows, '팀 회의'), 0, 'meeting cancelled')
    assert.equal(count(rows, '치과 예약'), 1, 'dentist saved once')
    assert.equal(count(rows, '테니스 약속'), 0, 'tennis failed')
    await wait(RUN + '.length > 0', 'retry button offered')
    await shot('01-partial-failure.png')
  })

  await check('retry runs only what failed: no copies, nothing lost', async () => {
    await evaluate('delete window.__blankyFailCreate')
    await evaluate(RUN + '.at(-1).click()')
    await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).items.some(i=>i.title==="테니스 약속")', 'tennis saved on retry')
    await pause(500)
    const rows = (await data()).items
    assert.equal(count(rows, '치과 예약'), 1, 'dentist not saved twice')
    assert.equal(count(rows, '테니스 약속'), 1, 'tennis saved once')
    assert.equal(count(rows, '팀 회의'), 0, 'cancel not repeated or undone')
    assert.equal(rows.length, 2)
    assert.equal(await evaluate(RUN + '.length'), 0, 'nothing left to retry')
    const tennis = rows.find(item => item.title === '테니스 약속')
    assert.deepEqual([tennis.date, tennis.startTime], ['2026-11-14', '14:00'])
    await shot('02-after-retry.png')
  })

  await check('reload keeps the result', async () => {
    await navigate()
    await wait('document.querySelector("#home-entry")', 'home reloaded')
    const rows = (await data()).items
    assert.deepEqual(rows.map(item => item.title).sort(), ['치과 예약', '테니스 약속'])
  })

  const final = await data()
  await writeFile(join(evidence, 'result.json'), JSON.stringify({
    surface: 'home-local', clock: '2026-11-09T10:00 local (pinned)', supabase: 'not-configured', ai: 'not-called',
    fault: 'dev-only window.__blankyFailCreate on titles containing 테니스, removed before retry',
    results, items: final.items.map(item => ({ id: item.id, title: item.title, date: item.date, startTime: item.startTime })), errors,
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
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-partial-e2e-')) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
