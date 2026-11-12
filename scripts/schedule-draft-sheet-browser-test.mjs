// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Checks the schedule add/edit form: a centered modal on desktop, a full-screen page with back handling on phones.
// Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.SCHEDULE_TEST_URL ?? 'http://127.0.0.1:5191'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.SCHEDULE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set SCHEDULE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-draftsheet-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''; server.stdout.on('data', data => { serverOutput += data }); server.stderr.on('data', data => { serverOutput += data })
for (let i = 0; i < 300; i++) { try { const res = await fetch(base); if (res.ok) break } catch {} await new Promise(r => setTimeout(r, 100)); if (i === 299) throw new Error(serverOutput) }
let targets
for (let i = 0; i < 50; i++) { try { targets = await fetch(browserEndpoint + '/json/list').then(r => r.json()); break } catch {} await new Promise(r => setTimeout(r, 100)); if (i === 49) throw new Error(browserOutput) }
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
  if (message.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null }
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
  const result = await send('Page.navigate', { url })
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(expression, label) { for (let i = 0; i < 300; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error('Timed out: ' + label + '\n' + await evaluate('location.href + "\\n" + document.body.innerText.slice(0, 400)') + '\n' + errors.join('\n')) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }

const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner
const stored = () => evaluate(`JSON.parse(localStorage.getItem(${q(library)})).items`)
const saved = (check, label) => wait(`JSON.parse(localStorage.getItem(${q(library)})).items.some(i => ${check})`, label)
const sheet = '.schedule-draft-panel[open]'
const gone = `!document.querySelector(${q(sheet)})`
const shown = `!!document.querySelector(${q(sheet)})`
const isOpen = () => evaluate(shown)
const inSheet = text => `[...document.querySelectorAll(${q(sheet + ' button')})].find(b => b.textContent.trim() === ${q(text)} || b.getAttribute('aria-label') === ${q(text)})`
const press = text => evaluate(inSheet(text) + '.click()')
const titleInput = `[...document.querySelectorAll(${q(sheet + ' label')})].find(l => l.textContent.trim().startsWith('제목')).querySelector('input')`
const setTitle = value => evaluate(`(()=>{const el=${titleInput};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${q(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
const choose = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${q(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${q(value)});el.dispatchEvent(new Event('change',{bubbles:true}))})()`)
const heading = () => evaluate(`document.querySelector(${q(sheet + ' h2')}).textContent`)
const pickCategory = async name => {
  await click(sheet + ' [aria-haspopup=listbox]')
  await wait(`[...document.querySelectorAll('[role=option]')].some(o => o.textContent.includes(${q(name)}))`, 'category options')
  await evaluate(`[...document.querySelectorAll('[role=option]')].find(o => o.textContent.includes(${q(name)})).click()`)
}
const escape = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
}
const openAdd = async () => {
  await evaluate('[...document.querySelectorAll("main button")].find(b => b.textContent.trim() === "직접 추가").click()')
  await wait(shown, 'sheet open')
}
const draftFlag = () => evaluate('history.state?.usr?.scheduleDraft === true')
const rect = selector => evaluate(`(()=>{const r=document.querySelector(${q(selector)}).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})()`)
const noSideways = selector => evaluate(`(e=>e.scrollWidth<=e.clientWidth+1)(document.querySelector(${q(selector)}))`)
const shot = async name => { const image = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(resolve('.tmp/schedule-draft-sheet', name), Buffer.from(image.data, 'base64')) }
const viewport = async (width, height) => { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }); await pause(250) }

try {
  await mkdir(resolve('.tmp/schedule-draft-sheet'), { recursive: true })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Seoul' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    const now = new Date('2026-11-05T10:30:00+09:00').getTime()
    const NativeDate = Date
    window.Date = class extends NativeDate {
      constructor(...args) { if (args.length) super(...args); else super(now) }
      static now() { return now }
    }
  }).toString() + ')()' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('draftsheet-seed')) return
    const id = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', id)
    const common = { date: '2026-11-05', description: '', priority: 'medium', status: 'todo', dueDate: null, endDate: null, endTime: null, startTime: null, duration: null, allDay: false, repeat: 'none', categoryId: null }
    const items = [
      { id: 'e1', kind: 'event', title: '아침 회의', startTime: '09:00', endTime: '10:00', duration: 60 },
      { id: 'e2', kind: 'event', title: '저녁 약속', startTime: '18:00', endTime: '19:00', duration: 60 },
    ].map(item => ({ ...common, ...item }))
    const categories = [
      { id: 'c1', name: '공부', parentId: null, color: '#86efac', icon: null, kind: 'area' },
      { id: 'c2', name: '운동', parentId: null, color: '#93c5fd', icon: null, kind: 'area' },
    ]
    localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories, items, settings: { dayStartTime: '07:00', dayEndTime: '23:00' } }))
    localStorage.setItem('draftsheet-seed', '1')
  }).toString() + ')()' })

  // ---- Desktop: centered modal ----
  await viewport(1440, 900)
  await navigate(base + '/schedule')
  await wait('!!document.querySelector("[data-timeline-id=e1]")', 'schedule loaded')

  await openAdd()
  assert.equal(await evaluate(`document.querySelector(${q(sheet)}).dataset.scheduleDraft`), 'modal')
  assert.equal(await evaluate(`document.querySelector(${q(sheet)}).matches(':modal')`), true, 'modal with backdrop')
  assert.equal(await heading(), '일정 추가')
  const box = await rect(sheet)
  assert.ok(Math.abs((box.left + box.right) / 2 - 720) < 2 && box.width <= 577, 'centered, bounded width ' + JSON.stringify(box))
  assert.equal(await draftFlag(), false, 'desktop adds no history entry')
  await shot('01-desktop-modal.png')
  await escape()
  await wait(gone, 'Escape closes')

  await openAdd()
  await press('닫기')
  await wait(gone, 'close button closes')

  // Empty title: the same validation as before, and the modal stays.
  await openAdd()
  await press('저장')
  await wait(`document.querySelector(${q(sheet)})?.textContent.includes('제목을 입력해 주세요.')`, 'title required')
  assert.equal(await isOpen(), true)
  assert.equal(await evaluate(`document.activeElement === ${titleInput}`), true, 'title focused on error')

  // Weekly repeat + category + time, saved and shown at once.
  await setTitle('주간 스터디')
  await press('시각')
  await wait(`!!document.querySelector(${q(sheet + ' input[type=time]')})`, 'time fields')
  await pickCategory('공부')
  await choose(sheet + ' select[aria-label="반복"]', 'weekly')
  await wait(`!!document.querySelector(${q(sheet + ' button[aria-label="금요일 반복"]')})`, 'weekday buttons')
  await click(sheet + ' button[aria-label="금요일 반복"]')
  await press('저장')
  await wait(gone, 'closes after save')
  await saved(`i.title === '주간 스터디' && i.repeat === 'weekly' && i.categoryId === 'c1' && i.startTime === '09:00' && i.repeatDays.includes(5)`, 'weekly saved')
  const weekly = (await stored()).find(i => i.title === '주간 스터디')
  await wait(`!!document.querySelector('[data-timeline-id="${weekly.id}"]')`, 'shown on timeline immediately')

  // Editing an existing event uses the same modal.
  await click('[data-timeline-id=e1] .schedule-card-open')
  await wait(shown, 'edit modal')
  assert.equal(await heading(), '일정 수정')
  await setTitle('아침 회의 (수정)')
  await pickCategory('운동')
  await press('저장')
  await wait(gone, 'edit closes')
  await saved(`i.id === 'e1' && i.title === '아침 회의 (수정)' && i.categoryId === 'c2'`, 'edit saved')
  await wait(`document.querySelector('[data-timeline-id=e1]')?.textContent.includes('(수정)')`, 'edit shown')

  // Short windows: the modal stays inside the viewport and scrolls.
  for (const [width, height] of [[1024, 600], [800, 480]]) {
    await viewport(width, height)
    await click('[data-timeline-id=e2] .schedule-card-open')
    await wait(shown, 'modal ' + width)
    const r = await rect(sheet)
    assert.ok(r.top >= 0 && r.bottom <= height + 1 && r.left >= 0 && r.right <= width + 1, `fits ${width}x${height}: ${JSON.stringify(r)}`)
    assert.equal(await evaluate(`(e=>e.scrollHeight>e.clientHeight && getComputedStyle(e).overflowY==='auto')(document.querySelector(${q(sheet)}))`), true, 'scrolls ' + width)
    assert.equal(await noSideways(sheet), true, 'no sideways scroll ' + width)
    await shot(`02-desktop-${width}.png`)
    await escape()
    await wait(gone, 'closed ' + width)
  }

  // ---- Phone: full-screen page ----
  await viewport(390, 844)
  await navigate(base + '/schedule')
  await wait('!!document.querySelector("[data-schedule-mobile]")', 'mobile schedule')
  await openAdd()
  assert.equal(await evaluate(`document.querySelector(${q(sheet)}).dataset.scheduleDraft`), 'page')
  const page = await rect(sheet)
  assert.deepEqual([page.left, page.top, page.width, page.height], [0, 0, 390, 844], 'full screen')
  await wait('history.state?.usr?.scheduleDraft === true', 'page pushed a history entry')
  for (const label of ['뒤로', '저장']) assert.equal(await evaluate(inSheet(label) + ' !== undefined'), true, label + ' in header')
  const head = await rect(sheet + ' .schedule-draft-head')
  assert.ok(head.top === 0 && head.height >= 44, 'header on top')
  assert.equal(await noSideways(sheet + ' .schedule-draft-body'), true, 'no sideways scroll 390')
  assert.ok(await evaluate(`[...document.querySelectorAll(${q(sheet + ' .field')})].every(e => e.getBoundingClientRect().height >= 44)`), 'touch-sized fields')
  await shot('03-mobile-page.png')

  // Back without edits leaves at once and consumes the history entry.
  await press('뒤로')
  await wait(gone, 'clean back closes')
  await wait('history.state?.usr?.scheduleDraft !== true', 'history entry popped')
  assert.equal(await evaluate('!!document.querySelector(".app-confirm-dialog[open]")'), false, 'no confirm when clean')

  // Back with edits asks first; keeping returns to the page.
  await openAdd()
  await setTitle('작성 중')
  await press('뒤로')
  await wait('!!document.querySelector(".app-confirm-dialog[open]")', 'discard confirm')
  await shot('04-mobile-discard.png')
  await evaluate('[...document.querySelectorAll(".app-confirm-dialog[open] button")].find(b => b.textContent.trim() === "취소").click()')
  await wait('!document.querySelector(".app-confirm-dialog[open]")', 'confirm dismissed')
  assert.equal(await isOpen(), true, 'kept editing')
  assert.equal(await evaluate(`${titleInput}.value`), '작성 중')

  // The system back gesture goes through the same question.
  await evaluate('history.back()')
  await wait('!!document.querySelector(".app-confirm-dialog[open]")', 'confirm on system back')
  assert.equal(await isOpen(), true, 'page stays while asking')
  await click('.app-confirm-action')
  await wait(gone, 'discarded')
  await wait('history.state?.usr?.scheduleDraft !== true', 'entry popped after discard')
  assert.equal((await stored()).some(i => i.title === '작성 중'), false, 'nothing saved')
  assert.equal(await evaluate('location.pathname'), '/schedule')

  // A clean system back closes without asking and stays on the schedule.
  await openAdd()
  await wait('history.state?.usr?.scheduleDraft === true', 'entry pushed')
  await evaluate('history.back()')
  await wait(gone, 'system back closes clean page')
  await pause(200)
  assert.equal(await evaluate('location.pathname'), '/schedule', 'stays on schedule')

  // The keyboard shrinks the visible viewport; the page and its save button follow it.
  await openAdd()
  await evaluate(`document.querySelector('.theme-app-layout').style.setProperty('--mobile-viewport-height','420px')`)
  await pause(50)
  const shrunk = await rect(sheet)
  const save = await evaluate(`(()=>{const r=${inSheet('저장')}.getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`)
  assert.ok(shrunk.height === 420 && save.top >= 0 && save.bottom <= 420, 'save visible above keyboard ' + JSON.stringify({ shrunk, save }))
  assert.equal(await evaluate(`(e=>e.scrollHeight>e.clientHeight)(document.querySelector(${q(sheet + ' .schedule-draft-body')}))`), true, 'body scrolls under header')
  await evaluate(`document.querySelector('.theme-app-layout').style.removeProperty('--mobile-viewport-height')`)

  // Header save: a daily task with a category, back on the schedule with it shown.
  await press('할 일')
  await setTitle('매일 스트레칭')
  await pickCategory('운동')
  await choose(sheet + ' select[aria-label="반복"]', 'daily')
  await press('저장')
  await wait(gone, 'mobile save closes')
  await wait('history.state?.usr?.scheduleDraft !== true', 'returned to schedule')
  await saved(`i.title === '매일 스트레칭' && i.kind === 'task' && i.repeat === 'daily' && i.categoryId === 'c2'`, 'daily task saved')
  await wait(`document.querySelector('[data-schedule-mobile]').textContent.includes('매일 스트레칭')`, 'shown after save')

  // Header save with an empty title keeps the page and reports it.
  await openAdd()
  await press('저장')
  await wait(`document.querySelector(${q(sheet)})?.textContent.includes('제목을 입력해 주세요.')`, 'mobile title required')
  await press('뒤로')
  await wait(gone, 'clean back after failed save')

  // Editing uses the same page.
  await click('[data-timeline-id=e2] .schedule-card-open')
  await wait(shown, 'mobile edit page')
  assert.equal(await evaluate(`document.querySelector(${q(sheet)}).dataset.scheduleDraft`), 'page')
  assert.equal(await heading(), '일정 수정')
  await setTitle('저녁 약속 (수정)')
  await press('저장')
  await wait(gone, 'mobile edit closes')
  await saved(`i.id === 'e2' && i.title === '저녁 약속 (수정)'`, 'mobile edit saved')
  await wait(`document.querySelector('[data-timeline-id=e2]')?.textContent.includes('(수정)')`, 'mobile edit shown')

  // Narrow phone.
  await viewport(320, 640)
  await openAdd()
  assert.equal(await noSideways(sheet + ' .schedule-draft-body'), true, 'no sideways scroll 320')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true, 'no page overflow 320')
  await shot('05-mobile-320.png')
  await press('뒤로')
  await wait(gone, 'closed 320')

  // Reload keeps everything and leaves no editor entry behind.
  await navigate(base + '/schedule')
  await wait(`document.querySelector('[data-schedule-mobile]')?.textContent.includes('매일 스트레칭')`, 'reload')
  assert.equal(await draftFlag(), false)
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: desktop modal open/Escape/close/validation/save/edit/weekly repeat/category/short windows; phone page full-screen, back with/without edits, system back, keyboard viewport, header save, edit, 320px, reload.')
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-draftsheet-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
