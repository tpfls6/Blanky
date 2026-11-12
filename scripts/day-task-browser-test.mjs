// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Checks date-only tasks in the schedule day view. Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.SCHEDULE_TEST_URL ?? 'http://127.0.0.1:5187'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.SCHEDULE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set SCHEDULE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-daytask-test-'))
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
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === "Page.loadEventFired" && loadResolve) { loadResolve(); loadResolve = null }
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
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner
const today = '2026-10-29'
const saved = (id, check) => wait(`(i=>i && (${check}))(JSON.parse(localStorage.getItem(${q(library)})).items.find(i=>i.id===${q(id)}))`, id + ' saved: ' + check)
const dayTasks = () => evaluate('[...document.querySelectorAll("[data-day-task]")].map(e=>e.dataset.dayTask)')
const timelineIds = () => evaluate('[...document.querySelectorAll("[data-timeline-id]")].map(e=>e.dataset.timelineId).sort()')
const tinted = id => evaluate(`document.querySelector('[data-task-row="${id}"]').classList.contains('task-tint-card')`)
const pick = async iso => { await click(`button[aria-label="${iso}"]`); await pause(150) }

try {
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Seoul' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    window.__timelineNow = new Date('2026-10-29T10:30:00+09:00').getTime()
    const NativeDate = Date
    window.Date = class extends NativeDate {
      constructor(...args) { if (args.length) super(...args); else super(window.__timelineNow) }
      static now() { return window.__timelineNow }
    }
  }).toString() + ')()' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('daytask-seed')) return
    const id = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', id)
    const common = { date: '2026-10-29', description: '', priority: 'medium', status: 'todo', dueDate: null, endDate: null, endTime: null, startTime: null, duration: null, allDay: false, repeat: 'none', categoryId: null }
    const items = [
      { id: 'd1', kind: 'task', title: '보고서 초안 쓰기', priority: 'high', categoryId: 'c1' },
      { id: 'd2', kind: 'task', title: '이미 끝낸 할 일', status: 'done' },
      { id: 'w1', kind: 'task', title: '주간 회고', date: '2026-10-22', repeat: 'weekly' },
      { id: 't1', kind: 'task', title: '시간 지정 할 일', startTime: '14:00', endTime: '15:00', duration: 60 },
      { id: 'a1', kind: 'event', title: '종일 워크숍', allDay: true },
      { id: 'e1', kind: 'event', title: '아침 회의', startTime: '09:00', endTime: '10:00', duration: 60 },
      { id: 'n1', kind: 'task', title: '내일 할 일', date: '2026-10-30' },
    ].map(item => ({ ...common, ...item }))
    localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories: [{ id: 'c1', name: '공부', parentId: null, color: '#86efac', icon: null, kind: 'area' }], items, settings: { dayStartTime: '07:00', dayEndTime: '23:00' } }))
    localStorage.setItem('daytask-seed', '1')
  }).toString() + ')()' })
  await navigate(base + '/schedule')
  await wait('document.querySelectorAll("[data-day-task]").length===3', 'day tasks')

  // Date-only tasks above all-day events and the timeline; timed items on their hours.
  assert.deepEqual(await dayTasks(), ['d1', 'w1', 'd2'], 'open by priority, done last, recurring included')
  assert.deepEqual(await timelineIds(), ['e1', 't1'])
  const top = selector => evaluate(`document.querySelector(${q(selector)}).getBoundingClientRect().top`)
  const allDayTop = await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("종일 워크숍")).getBoundingClientRect().top')
  assert.ok(await top('[data-day-tasks]') < allDayTop, 'date-only tasks above all-day events')
  assert.ok(allDayTop < await top('.schedule-time-grid'), 'all-day events above timeline')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-day-task=d1]")).borderLeftColor'), 'rgb(134, 239, 172)', 'category color')
  assert.notEqual(await evaluate('getComputedStyle(document.querySelector("[data-day-task=d1]")).backgroundColor'), 'rgba(0, 0, 0, 0)', 'light tint')
  assert.equal(await evaluate('document.querySelector("[data-day-task=d2]").classList.contains("day-task-done")'), true)

  // Checkbox completes in place and persists.
  await click('[data-day-task=d1] [role=checkbox]')
  await wait('document.querySelector("[data-day-task=d1]").classList.contains("day-task-done")', 'done class')
  await saved('d1', 'i.status==="done"')
  assert.deepEqual(await dayTasks(), ['w1', 'd1', 'd2'], 'done tasks move after open ones')
  await click('[data-day-task=d1] [role=checkbox]')
  await saved('d1', 'i.status==="todo"')

  // A calendar date click shows only that day's items; a recurring task shows on its next occurrence.
  assert.equal(await tinted('d1'), true, 'task tab tints the selected day')
  assert.equal(await tinted('n1'), false, 'task tab leaves other days plain')
  await pick('2026-10-30')
  assert.deepEqual(await dayTasks(), ['n1'])
  assert.equal(await tinted('d1'), false)
  assert.equal(await tinted('n1'), true)
  assert.deepEqual(await timelineIds(), [])
  await pick('2026-11-05')
  assert.deepEqual(await dayTasks(), ['w1'])
  await pick('2026-11-04')
  assert.deepEqual(await dayTasks(), [])
  await pick(today)
  assert.deepEqual(await dayTasks(), ['d1', 'w1', 'd2'])

  // Responsive bounds.
  await mkdir(resolve('.tmp/day-tasks'), { recursive: true })
  for (const width of [390, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 }); await pause(200)
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'), true, 'no page overflow ' + width)
    assert.ok(await evaluate('(()=>{const list=document.querySelector(".day-task-list").getBoundingClientRect();return [...document.querySelectorAll("[data-day-task]")].every(e=>{const r=e.getBoundingClientRect();return r.left>=list.left-1&&r.right<=list.right+1&&r.width>100})})()'), 'cards fit ' + width)
    const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(resolve(`.tmp/day-tasks/${width}.png`), Buffer.from(shot.data, 'base64'))
  }
  await send('Emulation.clearDeviceMetricsOverride'); await pause(200)

  // Opening a card edits it; moving the date updates the day view at once without adding a time.
  await click('[data-day-task=d1] button[title]')
  await wait('document.querySelector("fieldset input[type=date]")?.value==="2026-10-29"', 'editor open')
  await fill('fieldset input[type=date]', '2026-10-31')
  await button('저장')
  await saved('d1', 'i.date==="2026-10-31" && i.startTime===null')
  await wait('!document.querySelector("[data-day-task=d1]")', 'left old day')
  await pick('2026-10-31')
  assert.deepEqual(await dayTasks(), ['d1'])

  // A task added without a time lands in the date-only list; deleting removes it.
  await button('직접 추가')
  await wait('!!document.querySelector("fieldset")', 'draft open')
  await button('할 일')
  await fill('fieldset input:not([type])', '새 날짜 할 일')
  await button('저장')
  await wait('[...document.querySelectorAll("[data-day-task]")].some(e=>e.textContent.includes("새 날짜 할 일"))', 'added task shown')
  const added = await evaluate(`JSON.parse(localStorage.getItem(${q(library)})).items.find(i=>i.title==='새 날짜 할 일')`)
  assert.equal(added.date, '2026-10-31'); assert.equal(added.startTime, null)
  await click(`[data-day-task="${added.id}"] button[title]`)
  await wait('!!document.querySelector("fieldset")', 'editor reopen')
  await evaluate('[...document.querySelectorAll("fieldset button")].find(b=>b.textContent.trim()==="삭제").click()')
  await wait('!!document.querySelector(".app-confirm-action")', 'confirm')
  await click('.app-confirm-action')
  await wait(`!document.querySelector('[data-day-task="${added.id}"]')`, 'deleted')

  // Dragging a date-only card onto an hour gives it that time.
  await pick(today)
  await evaluate(`(()=>{const grid=document.querySelector('.schedule-time-grid'),r=grid.getBoundingClientRect(),dt=new DataTransfer();dt.setData('text/plain','w1');grid.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,clientY:r.top+4*44+10,dataTransfer:dt}));grid.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,clientY:r.top+4*44+10,dataTransfer:dt}));})()`)
  await saved('w1', 'i.startTime==="11:00"')
  await wait('!!document.querySelector("[data-timeline-id=w1]") && !document.querySelector("[data-day-task=w1]")', 'moved to timeline')

  await navigate(base + '/schedule')
  await wait('document.querySelectorAll("[data-timeline-id]").length===3', 'reload')
  assert.deepEqual(await dayTasks(), ['d2'])
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: date-only cards above all-day/timed items, category tint, checkbox, date click filtering, recurring, edit date move, add/delete, drag to hour, 390/768/1440 bounds, reload.')
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-daytask-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
