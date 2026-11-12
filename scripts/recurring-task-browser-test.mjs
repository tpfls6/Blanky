// Recurring tasks in the real app (local mode): per-day completion, scope edits/deletes, natural language and phone layout.
// Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.SCHEDULE_TEST_URL ?? 'http://127.0.0.1:5299'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.SCHEDULE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set SCHEDULE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-recurring-task-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
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
async function wait(expression, label) { for (let i = 0; i < 300; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=' + selector + '; const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
const libraryKey = 'blanky.library.22222222-2222-4222-8222-222222222222'
const items = () => evaluate(`JSON.parse(localStorage.getItem(${q(libraryKey)})).items`)
const pick = async (iso) => { await evaluate(`document.querySelector('[aria-label="${iso}"]').click()`); await pause(200) }
const dayTasks = (iso) => evaluate(`[...document.querySelectorAll('[data-day-tasks="${iso}"] [data-day-task]')].map(e => [e.querySelector('.day-task-title').textContent.trim(), e.querySelector('[role=checkbox]').getAttribute('aria-checked')])`)
const radio = label => `[...document.querySelectorAll('[role=radio]')].find(b => b.textContent.trim() === ${q(label)})`
const openOn = async (iso) => {
  await evaluate(`document.querySelector('[data-day-tasks="${iso}"] [data-day-task] button[title]').click()`)
  await wait('!!document.querySelector("[data-series-scope]")', 'scope picker ' + iso)
}

try {
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Seoul' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    const fixed = new Date('2026-11-05T10:30:00+09:00').getTime()
    const NativeDate = Date
    window.Date = class extends NativeDate { constructor(...args) { if (args.length) super(...args); else super(fixed) } static now() { return fixed } }
  }).toString() + ')()' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('recurring-task-seed')) return
    const id = '22222222-2222-4222-8222-222222222222'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id, name: 'Test', nickname: 'Test', email: 'task@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', id)
    const task = { id: 'vit', kind: 'task', title: '영양제 먹기', description: '', date: '2026-11-02', startTime: null, endTime: null, duration: null, categoryId: null, priority: 'medium', status: 'todo', dueDate: null, dueTime: null, endDate: null, allDay: false, repeat: 'daily', repeatDays: [] }
    localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories: [], items: [task], settings: {} }))
    localStorage.setItem('recurring-task-seed', '1')
  }).toString() + ')()' })

  await navigate(base + '/schedule')
  await wait(`!!document.querySelector('[data-day-tasks="2026-11-05"] [data-day-task]')`, 'recurring task on today')
  for (const day of ['2026-11-03', '2026-11-04', '2026-11-05']) { await pick(day); assert.deepEqual(await dayTasks(day), [['영양제 먹기', 'false']], 'open on ' + day) }

  // 1. Completing one day leaves the other days open; a rapid double click splits once.
  await evaluate(`document.querySelector('[data-day-tasks="2026-11-05"] [role=checkbox]').click()`)
  await wait(`document.querySelector('[data-day-tasks="2026-11-05"] [role=checkbox]')?.getAttribute('aria-checked') === 'true'`, 'today done')
  for (const day of ['2026-11-04', '2026-11-06']) { await pick(day); assert.deepEqual(await dayTasks(day), [['영양제 먹기', 'false']], 'still open on ' + day) }
  await pick('2026-11-06')
  await evaluate(`(() => { const box = document.querySelector('[data-day-tasks="2026-11-06"] [role=checkbox]'); box.click(); box.click() })()`)
  await wait(`document.querySelector('[data-day-tasks="2026-11-06"] [role=checkbox]')?.getAttribute('aria-checked') === 'true'`, '11-06 done')
  await pause(300)
  assert.equal((await items()).filter(row => row.status === 'done').length, 2, 'one done row per completed day')
  for (const day of ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']) { await pick(day); assert.equal((await dayTasks(day)).length, 1, 'no duplicate on ' + day) }
  await pick('2026-11-05')
  await evaluate(`document.querySelector('[data-day-tasks="2026-11-05"] [role=checkbox]').click()`)
  await wait(`document.querySelector('[data-day-tasks="2026-11-05"] [role=checkbox]')?.getAttribute('aria-checked') === 'false'`, 'today reopened')
  assert.equal((await dayTasks('2026-11-05')).length, 1)

  // 2. "이후 전체" edit from 11-09: earlier days keep the old title.
  await pick('2026-11-09')
  await openOn('2026-11-09')
  assert.equal(await evaluate(radio('이번만') + '.getAttribute("aria-checked")'), 'true', 'default scope is this day')
  assert.equal(await evaluate('!!document.querySelector(".schedule-draft-panel [data-repeat-picker]")'), true, 'repeat picker shown for a task')
  await evaluate(radio('이후 전체') + '.click()')
  await fill(`[...document.querySelectorAll('.schedule-draft-panel label')].find(l => l.textContent.trim().startsWith('제목')).querySelector('input')`, '비타민')
  await evaluate(`[...document.querySelectorAll('.schedule-draft-panel button')].find(b => b.textContent.trim() === '저장').click()`)
  await wait('!document.querySelector(".schedule-draft-panel")', 'draft closed')
  await pick('2026-11-10'); assert.deepEqual((await dayTasks('2026-11-10')).map(r => r[0]), ['비타민'])
  await pick('2026-11-08'); assert.deepEqual((await dayTasks('2026-11-08')).map(r => r[0]), ['영양제 먹기'])

  // 3. "이번만" delete on 11-12: that day only.
  await pick('2026-11-12')
  await openOn('2026-11-12')
  await evaluate(`[...document.querySelectorAll('.schedule-draft-panel button')].find(b => b.textContent.trim() === '삭제').click()`)
  await wait(`!!document.querySelector('.app-confirm-dialog[open]')`, 'confirm')
  assert.match(await evaluate(`document.querySelector('.app-confirm-dialog[open]').textContent`), /하루만/)
  await evaluate(`[...document.querySelectorAll('.app-confirm-dialog[open] button')].find(b => b.textContent.trim() === '삭제').click()`)
  await wait('!document.querySelector(".schedule-draft-panel")', 'draft closed after delete')
  await pick('2026-11-12'); assert.equal(await evaluate(`!!document.querySelector('[data-day-tasks="2026-11-12"] [data-day-task]')`), false, 'deleted day')
  await pick('2026-11-13'); assert.deepEqual((await dayTasks('2026-11-13')).map(r => r[0]), ['비타민'], 'next day kept')

  // 4. Natural language: "격주 화요일 분리수거" becomes a task every other Tuesday.
  await pick('2026-11-05')
  await fill('document.getElementById("schedule-entry")', '격주 화요일 분리수거')
  await evaluate(`document.getElementById('schedule-entry').form.requestSubmit()`)
  await wait('!!document.querySelector("[data-analysis-review] [data-repeat-picker]")', 'analysis review')
  assert.equal(await evaluate('document.querySelector("[data-analysis-review] select[aria-label=반복]").value'), 'custom')
  assert.equal(await evaluate(`document.querySelector("[data-analysis-review] input[aria-label='반복 간격']").value`), '2')
  await evaluate(`[...document.querySelectorAll('[data-analysis-review] button')].find(b => b.textContent.trim() === '확인 후 저장').click()`)
  await wait(`JSON.parse(localStorage.getItem(${q(libraryKey)})).items.some(row => row.title === '분리수거')`, 'saved recycling')
  const recycling = (await items()).find(row => row.title === '분리수거')
  assert.deepEqual([recycling.kind, recycling.repeat, recycling.repeatDays, recycling.repeatInterval, recycling.date], ['task', 'weekly', [2], 2, '2026-11-10'])
  await wait('!document.querySelector("[data-analysis-review]")', 'review closed')
  for (const [day, expected] of [['2026-11-10', true], ['2026-11-17', false], ['2026-11-24', true]]) {
    await pick(day)
    assert.equal((await dayTasks(day)).some(r => r[0] === '분리수거'), expected, 'recycling on ' + day)
  }

  // 5. Phone width: editor with scope + repeat fits without horizontal scroll.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true })
  await navigate(base + '/schedule')
  await wait(`!!document.querySelector('[aria-label="2026-11-13"]')`, 'phone calendar')
  await pick('2026-11-13')
  await wait(`!!document.querySelector('[data-day-tasks="2026-11-13"] [data-day-task] button[title]')`, 'phone day tasks')
  await openOn('2026-11-13')
  await pause(400)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true, 'no horizontal scroll on phone')
  assert.equal(await evaluate('(() => { const r = document.querySelector("[data-series-scope]").getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1 })()'), true, 'scope picker inside the screen')
  await mkdir(resolve('.tmp/recurring-task'), { recursive: true })
  await evaluate('document.querySelector("[data-series-scope]").scrollIntoView({ block: "center" })'); await pause(200)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve('.tmp/recurring-task/editor-390.png'), Buffer.from(shot.data, 'base64'))

  assert.deepEqual(errors, [], 'no uncaught page errors')
  console.log('PASS: recurring task per-day completion (no duplicates on double click), this/future scope edit and delete, natural-language every-other-week task, phone editor layout')
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(r => browser.once('exit', r)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-recurring-task-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
