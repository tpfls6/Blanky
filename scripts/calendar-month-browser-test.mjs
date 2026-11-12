// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.SCHEDULE_TEST_URL ?? 'http://127.0.0.1:5183'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.SCHEDULE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set SCHEDULE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-calendar-test-'))
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
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner
const shots = resolve('.tmp/calendar-month')

try {
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Seoul' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    const fixed = new Date('2026-10-29T10:30:00+09:00').getTime()
    const NativeDate = Date
    window.Date = class extends NativeDate {
      constructor(...args) { if (args.length) super(...args); else super(fixed) }
      static now() { return fixed }
    }
  }).toString() + ')()' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('calendar-seed')) return
    const id = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', id)
    const common = { description: '', priority: 'medium', status: 'todo', dueDate: null, dueTime: null, endDate: null, allDay: false, repeat: 'none', categoryId: null, startTime: null, endTime: null, duration: null, kind: 'event' }
    const items = [
      { id: 'allday', title: 'All day offsite', date: '2026-10-29', allDay: true },
      { id: 'late', title: 'Late review', date: '2026-10-29', startTime: '18:00', endTime: '19:00' },
      { id: 'standup', title: 'Morning standup', date: '2026-10-29', startTime: '09:00', endTime: '09:15', categoryId: 'work' },
      { id: 'standup-copy', title: 'Morning standup', date: '2026-10-29', startTime: '09:00', endTime: '09:15', categoryId: 'work' },
      { id: 'long', title: '아주 긴 일정 제목이 칸을 넘어가더라도 가로 스크롤 없이 말줄임표로 표시되어야 합니다', date: '2026-10-29', startTime: '11:00', endTime: '12:00' },
      { id: 'weekly', title: 'Weekly sync', date: '2026-10-22', startTime: '14:00', endTime: '15:00', repeat: 'weekly', repeatDays: [4], categoryId: 'home' },
      { id: 'dentist', title: 'Dentist', date: '2026-10-15', startTime: '10:00', endTime: '11:00' },
      { id: 'report', kind: 'task', title: 'Submit report', date: '2026-10-20', dueDate: '2026-10-20', dueTime: '17:00' },
      { id: 'holiday-copy', title: '개천절', date: '2026-10-03', allDay: true },
      { id: 'family', title: '개천절 가족 모임', date: '2026-10-03', allDay: true },
      { id: 'trip', title: 'Busan trip', date: '2026-10-06', endDate: '2026-10-08', allDay: true, categoryId: 'home' },
      { id: 'conf', title: 'Design conference', date: '2026-10-07', endDate: '2026-10-08', allDay: true, categoryId: 'work' },
      { id: 'pale', title: 'Pale label', date: '2026-10-08', allDay: true, categoryId: 'pale' },
      { id: 'wrap', title: 'Long retreat', date: '2026-10-23', endDate: '2026-10-27', allDay: true },
      { id: 'uncached', title: 'Next year kickoff', date: '2028-01-04', startTime: '10:00', endTime: '11:00' },
    ].map(item => ({ ...common, ...item }))
    const categories = [
      { id: 'work', name: '업무', parentId: null, color: '#e11d48' },
      { id: 'home', name: '개인', parentId: null, color: '#2563eb' },
      { id: 'pale', name: '메모', parentId: null, color: '#fde68a' },
    ]
    localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories, items, settings: {} }))
    // Holidays come from the cache: local mode has no Edge Function, which also exercises the "API unavailable" path.
    const holiday = (date, name, kind = 'public') => ({ date, name, kind })
    localStorage.setItem('blanky.holidays.v1.2026', JSON.stringify({ fetchedAt: Date.now(), holidays: [holiday('2026-10-03', '개천절'), holiday('2026-10-05', '대체공휴일', 'substitute'), holiday('2026-10-09', '한글날'), holiday('2026-12-25', '기독탄신일')] }))
    localStorage.setItem('blanky.holidays.v1.2027', JSON.stringify({ fetchedAt: Date.now(), holidays: [holiday('2027-01-01', '신정')] }))
    localStorage.setItem('calendar-seed', '1')
  }).toString() + ')()' })

  const cell = iso => `document.querySelector('[data-calendar-cell="${iso}"]')`
  const ids = iso => evaluate(`[...${cell(iso)}.querySelectorAll('[data-calendar-item]')].map(e => e.dataset.calendarItem)`)
  // Details open in the draft sheet (a modal dialog); older layouts expanded the row in place.
  const details = '(document.querySelectorAll("dialog[open].schedule-draft-panel").length + document.querySelectorAll("[aria-expanded=true]").length)'
  const escape = () => evaluate('(() => { const close = document.querySelector("dialog[open].schedule-draft-panel button[aria-label=닫기]"); if (close) close.click(); else window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})) })()')
  const radio = label => `[...document.querySelectorAll('[role=radio]')].find(b => b.textContent.trim() === ${q(label)})`
  const setView = async (label) => {
    await navigate(base + '/settings/calendar')
    await wait('!!' + radio(label), 'settings choice ' + label)
    await evaluate(radio(label) + '.click()')
    await wait(radio(label) + '.getAttribute("aria-checked") === "true"', 'picked ' + label)
    await pause(300)
    await navigate(base + '/schedule')
  }

  // 1. Default is the existing dot view.
  await navigate(base + '/schedule')
  await wait(`!!document.querySelector('[aria-label="2026-10-29"]')`, 'calendar')
  assert.equal(await evaluate('!!document.querySelector("[data-calendar-view=detailed]")'), false, 'simple by default')
  assert.equal(await evaluate(`document.querySelector('[aria-label="2026-10-29"]').dataset.hasEvent`), 'true', 'dot on event day')
  assert.equal(await evaluate(`document.querySelector('[aria-label="2026-11-05"]').dataset.hasEvent`), 'true', 'dot on recurring day')
  assert.equal(await evaluate(`document.querySelector('[aria-label="2026-10-03"]').dataset.holiday`), 'true', 'holiday marked in simple view')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[aria-label="2026-10-03"]')).color`), 'rgb(220, 38, 38)', 'holiday red in simple view')
  await mkdir(shots, { recursive: true })
  { const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(shots, 'simple-1440.png'), Buffer.from(shot.data, 'base64')) }

  // 2. Switch to detailed from settings; survives reload.
  await setView('상세 보기')
  await wait('!!document.querySelector("[data-calendar-view=detailed]")', 'detailed view')

  // 3. Sorted, deduped, limited with "더보기".
  assert.deepEqual(await ids('2026-10-29'), ['allday', 'standup'], 'first rows of a busy day')
  assert.equal(await evaluate(`${cell('2026-10-29')}.querySelector('[data-calendar-more]').getAttribute('aria-label')`), '3개 더보기')
  assert.deepEqual(await ids('2026-10-15'), ['dentist'])
  assert.deepEqual(await ids('2026-10-20'), ['report'], 'task with due time shown')
  for (const day of ['2026-10-22', '2026-11-05']) assert.deepEqual(await ids(day), ['weekly'], 'recurring on ' + day)
  assert.deepEqual(await ids('2026-10-21'), [], 'no recurring outside rule')
  assert.equal(await evaluate(`${cell('2026-10-29')}.querySelector('[data-calendar-item=standup]').dataset.calendarColor`), '#e11d48', 'category color')
  assert.equal(await evaluate(`${cell('2026-10-22')}.querySelector('[data-calendar-item=weekly]').dataset.calendarColor`), '#2563eb', 'second category color')
  assert.notEqual(await evaluate(`getComputedStyle(${cell('2026-10-29')}.querySelector('[data-calendar-item=standup]')).backgroundColor`), await evaluate(`getComputedStyle(${cell('2026-10-22')}.querySelector('[data-calendar-item=weekly]')).backgroundColor`), 'categories tinted differently')
  // Timed entries: light tint + short category mark on the left. All-day entries: filled label.
  const style = (iso, id) => `getComputedStyle(${cell(iso)}.querySelector('[data-calendar-item=${id}]'))`
  assert.equal(await evaluate(`${style('2026-10-29', 'standup')}.borderLeftColor`), 'rgb(225, 29, 72)', 'timed entry category mark')
  assert.equal(await evaluate(`parseFloat(${style('2026-10-29', 'standup')}.borderLeftWidth)`), 2, 'short left mark')
  assert.equal(await evaluate(`${style('2026-10-20', 'report')}.borderLeftColor !== 'rgba(0, 0, 0, 0)' && ${cell('2026-10-20')}.querySelector('[data-calendar-item=report]').dataset.calendarStyle`), 'mark', 'task uses mark')
  assert.equal(await evaluate(`${cell('2026-10-29')}.querySelector('[data-calendar-item=allday]').dataset.calendarStyle`), 'fill', 'all-day filled')
  assert.equal(await evaluate(`${style('2026-10-07', 'trip')}.backgroundColor`), 'rgb(37, 99, 235)', 'filled with category color')
  assert.equal(await evaluate(`${style('2026-10-07', 'trip')}.color`), 'rgb(255, 255, 255)', 'white text on dark fill')
  assert.equal(await evaluate(`${style('2026-10-08', 'pale')}.color`), 'rgb(31, 41, 55)', 'dark text on pale fill')

  // Multi-day: one lane per bar, segments joined across days, title only on the first piece in a week row.
  assert.deepEqual(await ids('2026-10-06'), ['trip'])
  assert.deepEqual(await ids('2026-10-07'), ['trip', 'conf'])
  const rect = (iso, id) => evaluate(`(() => { const r = ${cell(iso)}.querySelector('[data-calendar-item=${id}]').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top } })()`)
  for (const id of ['trip', 'conf']) {
    const days = id === 'trip' ? ['2026-10-06', '2026-10-07', '2026-10-08'] : ['2026-10-07', '2026-10-08']
    for (let i = 1; i < days.length; i++) {
      const [a, b] = [await rect(days[i - 1], id), await rect(days[i], id)]
      assert.equal(Math.abs(a.top - b.top) < 1, true, id + ' same lane ' + days[i])
      assert.equal(Math.abs(a.right - b.left) <= 1, true, id + ' joined ' + days[i] + ' ' + a.right + '/' + b.left)
    }
  }
  assert.deepEqual(await evaluate(`['2026-10-06','2026-10-07','2026-10-08'].map(iso => ${'document'}.querySelector('[data-calendar-cell="' + iso + '"] [data-calendar-item=trip]').dataset.calendarSpan)`), ['start-to', 'from-to', 'from-end'])
  assert.equal(await evaluate(`getComputedStyle(${cell('2026-10-07')}.querySelector('[data-calendar-item=trip] span:last-child')).visibility`), 'hidden', 'continuation hides title')
  assert.equal(await evaluate(`getComputedStyle(${cell('2026-10-06')}.querySelector('[data-calendar-item=trip] span:last-child')).visibility`), 'visible', 'first piece shows title')
  // Bar wrapping to the next week row: square ends at the row edge, title repeated on the new row.
  const wrapSpans = await evaluate(`['2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27'].map(iso => { const e = document.querySelector('[data-calendar-cell="' + iso + '"] [data-calendar-item=wrap]'); return [e.dataset.calendarSpan, getComputedStyle(e.querySelector('span:last-child')).visibility] })`)
  assert.equal(wrapSpans[0][0], 'start-to'); assert.equal(wrapSpans[4][0], 'from-end')
  assert.equal(wrapSpans.filter(([, v]) => v === 'visible').length, 2, 'title on each week row')
  assert.equal(await evaluate(`${cell('2026-10-29')}.querySelector('[data-calendar-more]').textContent.trim()`), '+3개')

  // 3b. Holidays: name in red, synced copy of the holiday hidden, user's own event kept.
  assert.equal(await evaluate(`${cell('2026-10-03')}.querySelector('[data-calendar-holiday]').textContent.trim()`), '개천절')
  assert.equal(await evaluate(`getComputedStyle(${cell('2026-10-03')}.querySelector('[data-calendar-holiday]')).color`), 'rgb(220, 38, 38)', 'holiday name red')
  assert.equal(await evaluate(`getComputedStyle(${cell('2026-10-03')}.querySelector('button[aria-label="2026-10-03"]')).color`), 'rgb(220, 38, 38)', 'holiday date red')
  assert.deepEqual(await ids('2026-10-03'), ['family'], 'holiday copy hidden, own event kept')
  assert.equal(await evaluate(`${cell('2026-10-05')}.querySelector('[data-calendar-holiday]').textContent.trim()`), '대체공휴일')

  // 3c. The whole cell is the click target (empty area, date number) and selects the day; hover and selected styles; no summary panel.
  await evaluate(`${cell('2026-10-14')}.scrollIntoView({ block: 'center' })`); await pause(100)
  const box = await evaluate(`(() => { const r = ${cell('2026-10-14')}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 6 } })()`)
  const idleBg = await evaluate(`getComputedStyle(${cell('2026-10-14')}).backgroundColor`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }); await pause(250)
  assert.notEqual(await evaluate(`getComputedStyle(${cell('2026-10-14')}).backgroundColor`), idleBg, 'hover background')
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await wait("document.querySelector('[data-calendar-cell=\"2026-10-14\"]')?.dataset.selected === \"true\"", 'empty cell area selects day')
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }); await pause(250)
  assert.notEqual(await evaluate(`getComputedStyle(${cell('2026-10-14')}).backgroundColor`), idleBg, 'selected cell highlighted')
  assert.equal(await evaluate('!!document.querySelector("[data-calendar-panel], .theme-calendar aside")'), false, 'no day summary panel')
  await evaluate(`${cell('2026-10-03')}.querySelector('button[aria-label="2026-10-03"]').click()`)
  await wait("document.querySelector('[data-calendar-cell=\"2026-10-03\"]')?.dataset.selected === \"true\"", 'date number selects day')
  assert.equal(await evaluate('!!document.querySelector("[data-calendar-panel], .theme-calendar aside")'), false, 'no day summary panel')

  // 4. Whole entry opens the existing detail modal (title text and the row itself).
  const before = await evaluate(details)
  await evaluate(`${cell('2026-10-15')}.querySelector('[data-calendar-item=dentist] span:last-child').click()`)
  await wait(details + '>' + before, 'title click opens details')
  assert.equal(await evaluate(`[...document.querySelectorAll('input')].some(i => i.value === 'Dentist')`), true, 'modal shows clicked item')
  await escape(); await wait(details + '===' + before, 'details closed')
  await evaluate(`${cell('2026-10-15')}.querySelector('[data-calendar-item=dentist]').click()`)
  await wait(details + '>' + before, 'entry click opens details')
  await escape(); await wait(details + '===' + before, 'details closed again')

  // 5. "+N개" selects that day (the schedule column lists every entry) without opening a panel or a modal.
  await evaluate(`${cell('2026-10-29')}.querySelector('[data-calendar-more]').click()`)
  await wait("document.querySelector('[data-calendar-cell=\"2026-10-29\"]')?.dataset.selected === \"true\"", '"+N개" selects busy day')
  assert.equal(await evaluate('!!document.querySelector("[data-calendar-panel], .theme-calendar aside")'), false, 'no day summary panel')
  assert.equal(await evaluate(details), before, '"+N개" opens no modal')

  // 6. Layout: no horizontal scroll, ellipsis, entries inside cells at phone/tablet/desktop widths.
  for (const width of [390, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 }); await pause(200)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true, 'no page overflow ' + width)
    assert.equal(await evaluate('(() => { const g = document.querySelector("[data-calendar-view=detailed]"); return g.scrollWidth <= g.clientWidth + 1 })()'), true, 'no grid overflow ' + width)
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-calendar-cell]')].every(c => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('[data-calendar-item],[data-calendar-more]')].every(e => e.getBoundingClientRect().right <= r.right + 1) })`), true, 'entries fit cells ' + width)
    const title = `${cell('2026-10-22')}.querySelector('[data-calendar-item=weekly] span:last-child')`
    // Narrow grids (phone, the web side column) clip titles like the phone calendar; wide grids use an ellipsis.
    assert.ok(['ellipsis', 'clip'].includes(await evaluate(`getComputedStyle(${title}).textOverflow`)), 'truncated title ' + width)
    // Phone design on every width: no column dividers, all-day labels fill the cell, timed entries keep the tint + left mark.
    assert.equal(await evaluate(`parseFloat(getComputedStyle(${cell('2026-10-15')}).borderRightWidth)`), 0, 'no column divider ' + width)
    assert.equal(await evaluate(`(() => { const c = ${cell('2026-10-29')}.getBoundingClientRect(), e = ${cell('2026-10-29')}.querySelector('[data-calendar-item=allday]').getBoundingClientRect(); return c.width - e.width <= 5 })()`), true, 'all-day fills cell ' + width)
    assert.equal(await evaluate(`${cell('2026-10-15')}.querySelector('[data-calendar-item=dentist]').dataset.calendarStyle`), 'mark', 'timed entry mark ' + width)
    await evaluate('document.querySelector("[data-calendar-view=detailed]").scrollIntoView({block:"center"})'); await pause(100)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(shots, `detailed-${width}.png`), Buffer.from(shot.data, 'base64'))
  }
  // 6a. Dark mode: fills keep the category color and readable ink; marked entries get a stronger tint on the dark surface.
  {
    const tint = `getComputedStyle(${cell('2026-10-15')}.querySelector('[data-calendar-item=dentist]')).backgroundColor`
    const light = await evaluate(tint)
    await evaluate('document.documentElement.classList.add("dark")'); await pause(150)
    assert.notEqual(await evaluate(tint), light, 'dark tint')
    assert.equal(await evaluate(`getComputedStyle(${cell('2026-10-07')}.querySelector('[data-calendar-item=trip]')).color`), 'rgb(255, 255, 255)', 'dark fill ink')
    await evaluate('document.querySelector("[data-calendar-view=detailed]").scrollIntoView({block:"center"})'); await pause(100)
    const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(shots, 'detailed-dark-1440.png'), Buffer.from(shot.data, 'base64'))
    await evaluate('document.documentElement.classList.remove("dark")')
  }

  // 6b. Year change: the Dec 2026 grid shows both years' cached holidays; an uncached year still shows user items.
  await click('[aria-label="다음 달"]'); await click('[aria-label="다음 달"]')
  await wait(`!!${cell('2027-01-01')}?.querySelector('[data-calendar-holiday]')`, 'next-year holiday in December grid')
  assert.equal(await evaluate(`${cell('2026-12-25')}.querySelector('[data-calendar-holiday]').textContent.trim()`), '기독탄신일')
  assert.equal(await evaluate(`${cell('2027-01-01')}.querySelector('[data-calendar-holiday]').textContent.trim()`), '신정')
  for (let i = 0; i < 13; i++) await click('[aria-label="다음 달"]')
  await wait(`!!${cell('2028-01-04')}`, 'January 2028')
  assert.deepEqual(await ids('2028-01-04'), ['uncached'], 'items render without holiday data')
  assert.equal(await evaluate('document.querySelectorAll("[data-calendar-holiday]").length'), 0, 'no holidays for uncached year')
  { const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(shots, 'year-change.png'), Buffer.from(shot.data, 'base64')) }

  // 7. Back to the simple view.
  await setView('간단 보기')
  await wait(`!document.querySelector("[data-calendar-view=detailed]") && document.querySelector('[aria-label="2026-10-29"]')?.dataset.hasEvent === 'true'`, 'simple view restored')

  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: simple/detailed toggle, sorted + deduped entries, filled all-day labels with readable text, timed/task tint + left mark, joined multi-day bars across days and week rows, whole-cell click + hover/selected styles, "+N개" selects the day, no summary panel, holidays (red labels, synced copies hidden, cached across years, uncached year still renders items), whole-entry detail modal, 390/768/1440 layout without horizontal scroll.')
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-calendar-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
