// Mobile UX E2E: phone tabs, schedule pager, chat day filter, memo bulk delete,
// reading chips/drag, settings chips and category creation, plus a desktop
// regression pass. Runs against a local Vite server in local-storage mode.
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'mobile-ux')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.MOBILE_UX_TEST_URL ?? 'http://127.0.0.1:5223'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-mobile-ux-test-'))

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
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: null } }); await server.listen(); server.printUrls();'], { env: { ...process.env, NODE_ENV: 'production', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', (data) => { serverOutput += data })
server.stderr.on('data', (data) => { serverOutput += data })
for (let i = 0; i < 300; i++) {
  try { if ((await fetch(base)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 100))
  if (i === 299) throw new Error(serverOutput)
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
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
  const pair = pending.get(message.id)
  if (pair) { pending.delete(message.id); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
ws.addEventListener('close', () => { for (const pair of pending.values()) pair.reject(new Error('Browser connection closed: ' + browserOutput.slice(-300))); pending.clear() })
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
const pause = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
async function navigate(url) {
  const loaded = new Promise((resolvePromise) => { loadResolve = resolvePromise })
  const result = await send('Page.navigate', { url })
  if (result.errorText) throw new Error(result.errorText)
  // A dependency re-optimization can swallow the load event; never wait forever.
  await Promise.race([loaded, pause(15000)])
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(evidenceDir, name + '.png'), Buffer.from(result.data, 'base64'))
}

const owner = '22222222-2222-4222-8222-222222222222'
const failures = []
const report = []
const only = process.env.MOBILE_UX_ONLY?.split(',')
async function scenario(name, run) {
  if (only && !only.some((part) => name.includes(part))) return
  try {
    const outcome = await run()
    report.push({ name, outcome })
    log(`${outcome === 'ok' ? 'ok  ' : 'FAIL'} ${name}: ${outcome}`)
    if (outcome !== 'ok') failures.push(name)
  } catch (error) {
    report.push({ name, outcome: error.message })
    log(`FAIL ${name}: ${error.message}`)
    failures.push(name)
  }
}
const center = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); const bottom = Math.min(r.bottom, document.querySelector('.mobile-nav')?.getBoundingClientRect().top ?? innerHeight); return { x: r.left + r.width / 2, y: (Math.max(0, r.top) + bottom) / 2 } })()`)
async function tap(selector) {
  const point = await center(selector)
  if (!point) throw new Error('missing ' + selector)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await pause(250)
}
/** A finger dragging vertically by `dy` from near the top of `selector`. */
async function verticalDrag(selector, dy) {
  const rect = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && { x: r.left + r.width * 0.6, y: r.top + 40 } })()`)
  if (!rect) throw new Error('missing ' + selector)
  const x = Math.round(rect.x), y0 = Math.round(rect.y)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
  for (let step = 1; step <= 12; step++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y0 + dy * step / 12) }] })
    await pause(16)
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
async function longPress(selector) {
  const point = await center(selector)
  if (!point) throw new Error('missing ' + selector)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] })
  await pause(650)
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await pause(250)
}
// The selection bar sits over the bottom nav, which `tap` treats as the lower edge: click its buttons instead.
const clickAction = (label) => evaluate(`(() => { const b = [...document.querySelectorAll('.memo-phone-actions button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}); b?.click(); return Boolean(b) })()`)
async function swipe(selector, dx) {
  const point = await center(selector)
  if (!point) throw new Error('missing ' + selector)
  // A real finger: touch down, slide sideways in small steps, lift.
  const y = Math.round(point.y)
  const x0 = Math.round(dx < 0 ? point.x + Math.abs(dx) / 2 : point.x - Math.abs(dx) / 2)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
  for (let step = 1; step <= 12; step++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + dx * step / 12), y }] })
    await pause(16)
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // Wait for momentum and snapping to settle: a tap during a fling only stops the fling.
  let last = -1
  for (let i = 0; i < 40; i++) {
    await pause(100)
    const left = await evaluate('(() => { const t = document.querySelector(".schedule-pager-track"); return t ? Math.round(t.scrollLeft) : 0 })()')
    const snapped = await evaluate('(() => { const t = document.querySelector(".schedule-pager-track"); return !t || Math.abs(t.scrollLeft - Math.round(t.scrollLeft / t.clientWidth) * t.clientWidth) < 2 })()')
    if (left === last && i >= 5 && snapped) break
    last = left
  }
}
const activeTab = () => evaluate('document.querySelector("[data-schedule-tab][aria-selected=true]")?.dataset.scheduleTab ?? "none"')
async function setViewport(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile })
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 })
}
const overflow = `(() => { const main = document.querySelector('main'); return Math.max(document.scrollingElement.scrollWidth - document.documentElement.clientWidth, main ? main.scrollWidth - main.clientWidth : 0) })()`
const typeInto = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const stored = (expression) => evaluate(`(() => { const d = JSON.parse(localStorage.getItem('blanky.library.${owner}')); return ${expression} })()`)

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + ((ownerId) => {
      if (!location.hostname) return
      if (localStorage.getItem('mobile-ux-seeded')) { localStorage.setItem('blanky.session.v1', ownerId); return }
      const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA') }
      const today = day(0)
      const now = new Date().toISOString()
      const yesterday = new Date(Date.now() - 86400000 * 1.5).toISOString()
      const common = { description: '', date: today, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'none', categoryId: 'school', startTime: null, endTime: null, duration: null }
      // A wide, short avatar: the preview must still be a circle.
      const avatar = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="400" height="120" fill="#3A62B0"/><circle cx="200" cy="60" r="40" fill="#fff"/></svg>')
      localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: ownerId, name: 'Mobile UX', nickname: 'UX', email: 'ux@example.test', password: 'test-only', avatar }]))
      localStorage.setItem('blanky.session.v1', ownerId)
      localStorage.setItem('blanky.library.' + ownerId, JSON.stringify({
        categories: [{ id: 'school', name: '학교', parentId: null, color: '#7157db' }],
        items: [
          { ...common, id: 'e1', kind: 'event', title: '데이터베이스 수업', startTime: '09:00', endTime: '10:30', duration: 90 },
          { ...common, id: 'e2', kind: 'event', title: '팀 회의', startTime: '14:00', endTime: '15:00', duration: 60 },
          { ...common, id: 't1', kind: 'task', title: '과제 제출 준비하기', dueDate: today, duration: 30 },
          { ...common, id: 't2', kind: 'task', title: '독서 기록 정리', date: day(2), duration: 30 },
        ],
        memos: ['첫 메모', '둘째 메모', '셋째 메모'].map((title, index) => ({ id: 'm' + index, title, body: title + ' 내용', categoryId: null, tags: [], createdAt: now, updatedAt: now })),
        settings: { locale: 'ko', calendarView: 'detailed', onboardingDone: true, onboardingPages: ['custom', 'diary', 'reading', 'memo', 'schedule', 'settings', 'home'], customTemplatesGuideSeen: true },
        customPages: [], pageTemplates: [], recordTypes: [], records: [],
      }))
      localStorage.setItem('blanky.homeChat.' + ownerId, JSON.stringify([
        { id: 'old-user', role: 'user', text: 'OLD-MSG 어제 입력', createdAt: yesterday },
        { id: 'old-bot', role: 'assistant', text: 'OLD-REPLY', createdAt: yesterday, status: 'done' },
        { id: 'new-user', role: 'user', text: 'TODAY-MSG 오늘 입력', createdAt: now },
      ]))
      const book = (index, status) => ({ id: 'ub' + index, user_id: ownerId, book_id: 'b' + index, reading_status: status, rating: null, current_page: 0, total_pages: null, progress: 0, started_at: null, finished_at: null, review: '', tags: [], created_at: now, updated_at: now,
        book: { id: 'b' + index, created_at: now, external_source: 'manual', external_id: 'x' + index, isbn10: null, isbn13: null, title: '테스트 책 ' + (index + 1), author: '저자', publisher: null, published_date: null, description: null, cover_url: null, page_count: null } })
      const statuses = ['want', 'reading', 'done', 'stopped']
      localStorage.setItem('blanky.reading.v1.' + ownerId, JSON.stringify({
        books: Array.from({ length: 14 }, (_, index) => book(index, statuses[index % 4])),
        shelves: [{ id: 'sh1', user_id: ownerId, name: '인생책', description: '', icon: '📚', color: '#3A62B0', sort_order: 0, created_at: now, updated_at: now }],
        memberships: [], highlights: [], notes: [],
      }))
      localStorage.setItem('mobile-ux-seeded', '1')
    }).toString() + ')(' + JSON.stringify(owner) + ')',
  })

  // Cold start: the first load waits for Vite to finish optimizing dependencies.
  await setViewport(390, 800, true)
  await navigate(base + '/schedule?add=quick')
  for (let i = 0; i < 100 && !(await evaluate('Boolean(document.querySelector(".mobile-nav [data-mobile-tab]"))')); i++) await pause(200)

  for (const width of [360, 390, 430]) {
    await setViewport(width, 800, true)
    // ---------- Mobile nav ----------
    await scenario(`${width} nav-core-tabs`, async () => {
      await navigate(base + '/schedule?add=quick')
      await pause(900)
      const tabs = await evaluate('[...document.querySelectorAll(".mobile-nav > ul [data-mobile-tab]")].map((el) => el.dataset.mobileTab).join(",")')
      if (tabs !== 'schedule,memo,reading,diary') return 'tabs ' + tabs
      // More sits top-left: in the top bar, or in the schedule screen's own one-line header.
      const top = await evaluate('(() => { const m = document.querySelector("[data-mobile-tab=more]")?.getBoundingClientRect(); return Boolean(m) && m.left < innerWidth / 2 && m.top < 60 })()')
      if (!top) return 'more icon not top-left'
      const sizes = await evaluate('[...document.querySelectorAll(".mobile-nav > ul .mobile-link")].map((el) => { const r = el.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)) })')
      if (sizes.some((size) => size < 44)) return 'small tab ' + sizes.join(',')
      return 'ok'
    })
    await scenario(`${width} nav-more-current`, async () => {
      await navigate(base + '/trash')
      await pause(800)
      const more = await evaluate('document.querySelector("[data-mobile-tab=more]").getAttribute("aria-current")')
      if (more !== 'page') return 'more not current: ' + more
      await tap('[data-mobile-tab=more]')
      for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-more-page]"))')); i++) await pause(100)
      const state = await evaluate('(() => { const p = document.querySelector("[data-more-page]"); if (!p || location.pathname !== "/more") return "menu page missing"; if (document.querySelector("dialog[open]")) return "menu is modal"; const rows = [...p.querySelectorAll(".more-row, .more-tiles a")]; return rows.every(r => r.getBoundingClientRect().height >= 44) ? "ok" : "small touch target" })()')
      if (width === 390) await shot('nav-more-page')
      if (state !== 'ok') return state
      await evaluate('document.querySelector("main").scrollTop = document.querySelector("main").scrollHeight')
      const bottom = await evaluate('document.querySelector("[data-more-page]").getBoundingClientRect().bottom <= document.querySelector(".mobile-nav").getBoundingClientRect().top')
      if (!bottom) return 'menu hidden under bottom bar'
      await tap('[data-more-link=activity]')
      await pause(400)
      const after = await evaluate('location.pathname + "|" + Boolean(document.querySelector("dialog[open]"))')
      if (after !== '/activity|false') return 'after ' + after
      await evaluate('history.back()')
      for (let i = 0; i < 50 && !(await evaluate('location.pathname === "/more" && Boolean(document.querySelector("[data-more-page]"))')); i++) await pause(100)
      return await evaluate('location.pathname === "/more" && document.querySelector("[data-mobile-tab=more]").getAttribute("aria-current") === "page"') ? 'ok' : 'back did not return to menu'
    })
    // ---------- Home ----------
    await scenario(`${width} home-cleanup`, async () => {
      await navigate(base + '/schedule?add=quick')
      await pause(900)
      const text = await evaluate('document.querySelector("main").innerText')
      const gone = ['활동 기록', 'Shift', '입력 도움말', '예시', '이어서 수정할 수 있어요'].filter((word) => text.includes(word))
      if (gone.length) return 'still shows ' + gone.join(', ')
      if (width === 390) await shot('home-phone')
      return 'ok'
    })
    await scenario(`${width} home-chat-today-only`, async () => {
      await evaluate('[...document.querySelectorAll("main button")].find((b) => b.getAttribute("aria-controls") === "home-chat-panel").click()')
      await pause(400)
      const panel = await evaluate('document.querySelector("#home-chat-panel").innerText')
      const count = await evaluate(`JSON.parse(localStorage.getItem('blanky.homeChat.${owner}')).length`)
      if (width === 390) await shot('home-chat-today')
      if (panel.includes('OLD-MSG') || panel.includes('OLD-REPLY')) return 'old message visible'
      if (!panel.includes('TODAY-MSG')) return 'today message missing'
      return count === 3 ? 'ok' : 'stored ' + count
    })
    // ---------- Schedule ----------
    await scenario(`${width} schedule-calendar-home`, async () => {
      await navigate(base + '/schedule')
      await pause(1000)
      for (let i = 0; i < 100 && !(await evaluate('Boolean(document.querySelector("[data-schedule-mobile]"))')); i++) await pause(100)
      if (!(await evaluate('Boolean(document.querySelector("[data-schedule-mobile]"))'))) return 'phone layout missing'
      const grid = await evaluate('(() => { const cells = [...document.querySelectorAll(".mcal-cell")]; const r = cells.map((c) => c.getBoundingClientRect()); return { count: cells.length, small: r.filter((x) => x.width < 44 || x.height < 44).length, today: Boolean(document.querySelector(".mcal-cell[aria-current=date]")), lastWeekInMonth: cells.slice(-7).some((c) => !c.hasAttribute("data-other")) } })()')
      // Only the weeks the month touches: 4-6 rows, the last one still holding days of this month.
      if (![28, 35, 42].includes(grid.count) || !grid.lastWeekInMonth || grid.small || !grid.today) return 'grid ' + JSON.stringify(grid)
      if (width === 390) await shot('schedule-calendar')
      const month = await evaluate('document.querySelector(".mcal-ym").textContent')
      await swipe('.mcal-grid', -Math.round(width * 0.6))
      await pause(400)
      if ((await evaluate('document.querySelector(".mcal-ym").textContent')) === month) return 'month swipe did not move'
      await swipe('.mcal-grid', Math.round(width * 0.6))
      await pause(400)
      await evaluate('document.querySelector(".mcal-cell[aria-current=date]").click()')
      await pause(500)
      if ((await evaluate('document.querySelector("[data-schedule-mobile]").dataset.snap')) !== 'half') return 'day sheet did not open'
      // The sheet drags from its body too: up from half reaches full right under the header (no week row left), down from the top goes back.
      await verticalDrag('.mcal-sheet-body', -260)
      await pause(500)
      const full = await evaluate('(() => ({ snap: document.querySelector("[data-schedule-mobile]").dataset.snap, top: Math.round(document.querySelector(".mcal-sheet").getBoundingClientRect().top), head: Math.round(document.querySelector(".mcal-head").getBoundingClientRect().bottom) }))()')
      if (full.snap !== 'full' || Math.abs(full.top - full.head) > 1) return 'body drag up did not reach full ' + JSON.stringify(full)
      await verticalDrag('.mcal-sheet-body', 260)
      await pause(500)
      if ((await evaluate('document.querySelector("[data-schedule-mobile]").dataset.snap')) !== 'half') return 'body drag down did not return to half'
      await evaluate('[...document.querySelectorAll(".mcal-seg button")].find((b) => b.textContent === "타임라인").click()')
      await pause(400)
      if (!(await evaluate('Boolean(document.querySelector(".mcal-tl-grid"))'))) return 'timeline missing'
      if (width === 390) await shot('schedule-timeline')
      await evaluate('history.back()')
      await pause(500)
      if ((await evaluate('document.querySelector("[data-schedule-mobile]").dataset.snap')) !== 'closed') return 'Back did not close the day sheet'
      const scroll = await evaluate(overflow)
      return scroll > 1 ? 'horizontal page scroll ' + scroll : 'ok'
    })
  }

  await setViewport(390, 844, true)
  await scenario('mobile-keyboard-layout', async () => {
    await navigate(base + '/schedule?add=quick')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("#home-entry"))')); i++) await pause(100)
    await evaluate(`(() => { const input = document.querySelector('#home-entry'); input.focus(); Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => innerHeight - 300 }); visualViewport.dispatchEvent(new Event('resize')); })()`)
    await pause(300)
    const open = await evaluate(`(() => { const root = document.querySelector('.theme-app-layout'); return root.dataset.keyboardOpen === 'true' && getComputedStyle(document.querySelector('.mobile-nav')).display === 'none' && Math.abs(root.getBoundingClientRect().height - visualViewport.height) < 2 })()`)
    await evaluate(`delete visualViewport.height; document.querySelector('#home-entry').blur(); visualViewport.dispatchEvent(new Event('resize'))`)
    await pause(300)
    const closed = await evaluate(`document.querySelector('.theme-app-layout').dataset.keyboardOpen === 'false' && getComputedStyle(document.querySelector('.mobile-nav')).display !== 'none'`)
    return open && closed ? 'ok' : 'keyboard viewport did not resize/restore'
  })
  await scenario('mobile-menu-settings', async () => {
    // The old editor link now opens More › Menu layout on phones.
    await navigate(base + '/settings/general#navigation')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-menu-layout]"))')); i++) await pause(100)
    if (await evaluate('location.pathname') !== '/more/menu') return 'old menu link went to ' + await evaluate('location.pathname + location.hash')
    const desktopBefore = await evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('blanky.library.${owner}')).settings.nav)`)
    const tabs = () => evaluate('[...document.querySelectorAll(".mobile-nav [data-mobile-tab]")].map(e => e.dataset.mobileTab).join(",")')
    const key = (id, name) => evaluate(`(() => { const grip = document.querySelector('[data-menu-grip="${id}"]'); grip.focus(); grip.dispatchEvent(new KeyboardEvent('keydown', { key: '${name}', bubbles: true })) })()`)
    // A finger drags activity's handle from More onto the end of the bottom bar.
    const from = await center('[data-menu-grip="activity"]')
    const to = await evaluate('(() => { const r = [...document.querySelectorAll("[data-zone=bar] [data-menu-row]")].pop().getBoundingClientRect(); return { y: r.bottom - 4 } })()')
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
    for (let step = 1; step <= 12; step++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: Math.round(from.y + (to.y - from.y) * step / 12) }] })
      await pause(16)
    }
    const during = await evaluate('document.body.classList.contains("menu-dragging") + "|" + document.querySelector("[data-zone=bar]").dataset.state')
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await pause(300)
    if (await tabs() !== 'schedule,memo,reading,diary,activity') return `drag not saved (dragging|bar=${during}): ` + await tabs()
    // Keyboard: right moves schedule to More, left brings it back at the end, up moves it one place earlier.
    await key('schedule', 'ArrowRight')
    await pause(200)
    if (await tabs() !== 'memo,reading,diary,activity') return 'arrow right failed: ' + await tabs()
    await key('schedule', 'ArrowLeft')
    await pause(200)
    await key('schedule', 'ArrowUp')
    await pause(200)
    if (await tabs() !== 'memo,reading,diary,schedule,activity') return 'arrow reorder failed: ' + await tabs()
    // A sixth tab is refused with a spoken notice; settings cannot be hidden.
    await key('trash', 'ArrowLeft')
    await pause(200)
    const full = await evaluate('document.querySelector(".more-toast[role=status]").textContent')
    if (await tabs() !== 'memo,reading,diary,schedule,activity' || !full) return 'sixth tab not refused: ' + full
    await key('settings', 'ArrowRight')
    await pause(200)
    if (await evaluate('Boolean(document.querySelector("[data-zone=hidden] [data-menu-row=settings]"))')) return 'settings was hidden'
    await shot('mobile-menu-layout')
    await navigate(base + '/more')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-more-page]"))')); i++) await pause(100)
    if (await tabs() !== 'memo,reading,diary,schedule,activity') return 'order lost after reload'
    if (await evaluate('Boolean(document.querySelector(".more-tiles [data-more-link=activity]")) || Boolean(document.querySelector(".more-tiles [data-more-link=trash]"))')) return 'More tiles did not follow the bar'
    const desktopAfter = await evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('blanky.library.${owner}')).settings.nav)`)
    if (desktopBefore !== desktopAfter) return 'mobile setting changed desktop menu'
    await tap('[data-more-link=mobile-navigation]')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-menu-layout]"))')); i++) await pause(100)
    await evaluate('document.querySelector("[data-menu-restore]").click()')
    await pause(300)
    return await tabs() === 'schedule,memo,reading,diary' ? 'ok' : 'restore failed'
  })
  await scenario('schedule-category-create', async () => {
    await navigate(base + '/schedule')
    await pause(1000)
    await evaluate('document.querySelector(".mcal-fab").click()')
    await pause(300)
    await evaluate('document.querySelector("[data-add=manual]").click()')
    await pause(500)
    const openSheet = () => evaluate('[...document.querySelectorAll("[data-mobile-draft] .mdraft-row")].find((b) => b.textContent.includes("카테고리")).click()')
    await openSheet()
    await pause(400)
    await typeInto('[data-mobile-sheet] input', '운동 루틴')
    await pause(300)
    const offer = await evaluate('document.querySelector("[data-category-create]")?.textContent ?? ""')
    await shot('category-create-offer')
    if (!offer.includes('운동 루틴')) return 'no create option: ' + offer
    await evaluate('document.querySelector("[data-category-create]").click()')
    await pause(400)
    const label = await evaluate('[...document.querySelectorAll("[data-mobile-draft] .mdraft-row")].find((b) => b.textContent.includes("카테고리")).querySelector(".mdraft-val").textContent.trim()')
    const saved = await stored('d.categories.map((c) => c.name).join(",")')
    if (label !== '운동 루틴') return 'row value ' + label
    if (!saved.includes('운동 루틴')) return 'not persisted: ' + saved
    // Searching an existing name lists it and offers nothing new.
    await openSheet()
    await pause(400)
    await typeInto('[data-mobile-sheet] input', '학교')
    await pause(300)
    const search = await evaluate('[...document.querySelectorAll("[data-mobile-sheet] [role=option]")].map((o) => o.textContent.trim()).join("|") + (document.querySelector("[data-category-create]") ? "|create" : "")')
    await evaluate('history.back()')
    await pause(300)
    return search === '학교' ? 'ok' : 'search result ' + search
  })

  // ---------- Memo ----------
  // Right margin and gap above the bottom nav of a FAB, in CSS pixels.
  const fabSpot = (selector) => evaluate(`(() => {
    const fab = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect()
    const nav = document.querySelector('.mobile-nav')?.getBoundingClientRect()
    return fab && nav ? { size: Math.round(fab.width) + 'x' + Math.round(fab.height), right: innerWidth - fab.right, gap: nav.top - fab.bottom } : null
  })()`)
  // The one-line header of a phone tab: its box, the ☰ and search buttons, the title's type, and whether MobileTopBar is drawn.
  const headSpot = (head, title, search) => evaluate(`(() => {
    const box = (el) => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') : null }
    const h = document.querySelector(${JSON.stringify(head)}), t = h?.querySelector(${JSON.stringify(title)})
    return { head: box(h), more: box(h?.querySelector('[data-mobile-tab=more]')), search: box(h?.querySelector(${JSON.stringify(search)})),
      title: t ? getComputedStyle(t).fontSize + ' ' + getComputedStyle(t).fontWeight : null, topbar: Boolean(document.querySelector('[data-mobile-topbar]')),
      rows: h ? new Set([...h.children].filter((c) => c.getBoundingClientRect().height > 0 && getComputedStyle(c).position !== 'absolute').map((c) => Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2))).size : 0 }
  })()`)
  await scenario('memo-phone-list', async () => {
    // The memo + must sit exactly where the schedule home's + does.
    await navigate(base + '/schedule')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector(".mcal-fab"))')); i++) await pause(100)
    const scheduleFab = await fabSpot('.mcal-fab')
    const scheduleHead = await headSpot('.mcal-head', '.mcal-ym', '[data-open-search]')
    await navigate(base + '/memo')
    // Phones open the memo tab on its list, not on the first memo.
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-memo-row]"))')); i++) await pause(100)
    await pause(300)
    if (await evaluate('Boolean(document.querySelector(".memo-phone-editor, [data-tour=memo-back]"))')) return 'memo tab opened a memo instead of the list'
    await shot('memo-list-phone')
    // One header line like the schedule's: ☰ · folder ▾ · search, same box, same ☰ and search spots, no MobileTopBar above.
    const memoHead = await headSpot('.memo-phone-head', '.memo-phone-folder', '[data-tour=memo-search]')
    log('header schedule ' + JSON.stringify(scheduleHead) + ' memo ' + JSON.stringify(memoHead))
    if (memoHead.topbar || memoHead.rows !== 1 || memoHead.head !== scheduleHead.head || memoHead.more !== scheduleHead.more || memoHead.search !== scheduleHead.search || memoHead.title !== scheduleHead.title) return 'header memo ' + JSON.stringify(memoHead) + ' schedule ' + JSON.stringify(scheduleHead)
    const memoFab = await fabSpot('.add-fab[data-tour=new-memo]')
    const layout = await evaluate(`({ rows: document.querySelectorAll('[data-memo-row]').length, icons: document.querySelectorAll('.memo-row-actions, .memo-browse, .memo-pick-toggle').length })`)
    if (layout.rows !== 3 || layout.icons !== 0) return 'layout ' + JSON.stringify(layout)
    if (!scheduleFab || !memoFab || memoFab.size !== '56x56' || memoFab.size !== scheduleFab.size || Math.abs(memoFab.right - scheduleFab.right) > 1 || Math.abs(memoFab.gap - scheduleFab.gap) > 1) return 'fab memo ' + JSON.stringify(memoFab) + ' schedule ' + JSON.stringify(scheduleFab)
    await tap('[data-tour=memo-folders]')
    const folders = await evaluate('[document.querySelector("[data-tour=memo-folders]").getAttribute("aria-expanded"), ...[...document.querySelectorAll(".memo-phone-folders[data-open] .memo-phone-folder-item span")].map((s) => s.textContent)].join(",")')
    await shot('memo-folders-phone')
    if (!folders.startsWith('true,전체 메모,즐겨찾기,미분류,학교')) return 'folders ' + folders
    await evaluate('document.querySelector(".memo-phone-dim").click()')
    await pause(300)
    await tap('[data-tour=memo-search]')
    const focused = await evaluate('document.activeElement?.classList.contains("memo-phone-search")')
    await typeInto('.memo-phone-search', '둘째')
    await pause(200)
    const found = await evaluate('[...document.querySelectorAll("[data-memo-row]")].map((r) => r.dataset.memoRow).join(",") + "|" + Boolean(document.querySelector(".add-fab"))')
    await shot('memo-search-phone')
    await tap('[aria-label="검색 닫기"]')
    const back = await evaluate('document.querySelectorAll("[data-memo-row]").length + "|" + Boolean(document.querySelector("[data-tour=memo-folders]"))')
    if (!focused || found !== 'm1|false' || back !== '3|true') return `search focused=${focused} found=${found} back=${back}`
    // The ☰ in the memo header opens the more page.
    await tap('.memo-phone-head [data-mobile-tab=more]')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-more-page]"))')); i++) await pause(100)
    const more = await evaluate('location.pathname')
    await navigate(base + '/memo')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-memo-row]"))')); i++) await pause(100)
    return more === '/more' ? 'ok' : 'more link went to ' + more
  })
  await scenario('memo-long-press-actions', async () => {
    await longPress('[data-memo-row=m0] button')
    await tap('[data-memo-row=m2] button')
    const count = await evaluate('document.querySelector(".memo-phone-picked").textContent + "|" + Boolean(document.querySelector(".memo-phone-actions")) + "|" + Boolean(document.querySelector(".add-fab"))')
    await shot('memo-picking')
    if (count !== '2개 선택됨|true|false') return 'picking ' + count
    if (!await clickAction('즐겨찾기')) return 'favorite button missing'
    await pause(300)
    const stars = await stored('d.memos.filter((m) => m.favorite).map((m) => m.id).sort().join(",")')
    if (stars !== 'm0,m2' || await evaluate('Boolean(document.querySelector(".memo-phone-actions"))')) return 'favorite ' + stars
    await longPress('[data-memo-row=m1] button')
    if (!await clickAction('이동')) return 'move button missing'
    await pause(400)
    await shot('memo-move-sheet')
    await evaluate('[...document.querySelectorAll(".memo-move-option")].find((b) => b.textContent.trim() === "학교")?.click()')
    await pause(300)
    const moved = await stored('d.memos.find((m) => m.id === "m1").categoryId')
    return moved === 'school' ? 'ok' : 'moved ' + moved
  })
  await scenario('memo-bulk-delete', async () => {
    await longPress('[data-memo-row=m0] button')
    await tap('[data-memo-row=m2] button')
    const count = await evaluate('document.querySelector(".memo-phone-picked").textContent')
    if (count !== '2개 선택됨') return 'count ' + count
    await clickAction('삭제')
    await pause(300)
    const dialog = await evaluate('document.querySelector("dialog[open]")?.innerText ?? ""')
    await shot('memo-confirm')
    if (!dialog.includes('2개')) return 'confirm missing: ' + dialog
    // Cancel keeps everything.
    await evaluate('[...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.trim() === "취소").click()')
    await pause(300)
    const kept = await stored('d.memos.length')
    if (kept !== 3) return 'cancel removed memos: ' + kept
    await clickAction('삭제')
    // Wait for the dialog itself: a fixed pause flaked under load (the confirm button was not there yet).
    let confirmed = false
    for (let i = 0; i < 30 && !confirmed; i++) {
      confirmed = await evaluate('(() => { const b = [...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.includes("삭제")); b?.click(); return Boolean(b) })()')
      if (!confirmed) await pause(100)
    }
    if (!confirmed) return 'second confirm did not open'
    await pause(500)
    const data = await stored('d.memos.map((m) => m.id).join(",") + "|" + (d.trash ?? []).length')
    const picking = await evaluate('Boolean(document.querySelector(".memo-phone-actions"))')
    return data === 'm1|2' && !picking ? 'ok' : 'after delete ' + data + ' picking=' + picking
  })

  // Phone editor: back arrow, title and menu in the top bar, no save/list buttons, autosave, category sheet, menu.
  const editorReady = async () => { for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector(".memo-phone-editor .memo-rich-content"))')); i++) await pause(100) }
  const typeBody = async (text) => {
    await evaluate('(() => { const el = document.querySelector(".memo-phone-editor .memo-rich-content"); el.focus(); const s = getSelection(); s.selectAllChildren(el); s.collapseToEnd() })()')
    await send('Input.insertText', { text })
  }
  await scenario('memo-phone-editor', async () => {
    await tap('[data-memo-row=m1] button')
    await editorReady()
    const shape = await evaluate(`(() => {
      const top = document.querySelector('.memo-pe-top')
      const tools = document.querySelector('.memo-pe-tools')?.getBoundingClientRect()
      const nav = document.querySelector('.mobile-nav')?.getBoundingClientRect()
      const words = [...document.querySelectorAll('main button')].map((b) => b.textContent.trim())
      return { back: Boolean(top?.querySelector('[data-tour=memo-back][aria-label="목록으로"]')), title: top?.querySelector('input.memo-title')?.value,
        more: top?.querySelector('[aria-haspopup=menu]')?.getAttribute('aria-expanded'), oldButtons: words.filter((w) => w === '저장' || w === '목록보기' || w === '삭제').length,
        chip: document.querySelector('.memo-pe-chip')?.textContent.trim(), status: document.querySelector('.memo-pe-meta [role=status]') !== null,
        toolsOnNav: tools && nav ? Math.abs(nav.top - tools.bottom) <= 1 : false, overflow: document.querySelector('main').scrollHeight - document.querySelector('main').clientHeight }
    })()`)
    await shot('memo-editor-phone')
    // The editor bar takes the same top edge as the list header (no MobileTopBar above it).
    const bar = await evaluate(`(() => { const r = document.querySelector('.memo-pe-top').getBoundingClientRect(); return Math.round(r.top) + ',' + Math.round(r.height) + '|' + Boolean(document.querySelector('[data-mobile-topbar]')) })()`)
    log('editor bar top,height ' + bar)
    if (bar !== '0,56|false') return 'editor bar ' + bar
    if (!shape.back || shape.title !== '둘째 메모' || shape.more !== 'false' || shape.oldButtons !== 0 || shape.chip !== '학교' || !shape.status || !shape.toolsOnNav || shape.overflow > 1) return 'shape ' + JSON.stringify(shape)
    // Typing saves by itself after a pause.
    await typeInto('.memo-pe-title', '둘째 메모 수정')
    const saving = await evaluate('document.querySelector(".memo-pe-status").textContent')
    await pause(1300)
    const autosaved = await stored('d.memos.find((m) => m.id === "m1").title')
    const done = await evaluate('document.querySelector(".memo-pe-status").textContent')
    if (saving !== '저장 중…' || autosaved !== '둘째 메모 수정' || done !== '저장됨') return `autosave saving=${saving} stored=${autosaved} done=${done}`
    // The back arrow right after typing still saves (flush), then shows the list.
    await typeBody(' 추가')
    await tap('[data-tour=memo-back]')
    const flushed = await stored('d.memos.find((m) => m.id === "m1").body')
    const listed = await evaluate('Boolean(document.querySelector("[data-memo-row=m1]")) && !document.querySelector(".memo-phone-editor")')
    if (!flushed.includes('추가') || !listed) return 'flush body=' + flushed.slice(-40) + ' listed=' + listed
    // The checklist button turns the current line into a task; tapping its checkbox checks it (faded + struck) and saves.
    await tap('[data-memo-row=m1] button')
    await editorReady()
    await typeBody('')
    // The icon row scrolls sideways; bring the button on screen before tapping it.
    await evaluate('document.querySelector(".memo-pe-tools [aria-label=\\"체크리스트\\"]").scrollIntoView({ inline: "center", block: "nearest" })')
    await tap('.memo-pe-tools [aria-label="체크리스트"]')
    const checklistOn = await evaluate('document.querySelector(".memo-pe-tools [aria-label=\\"체크리스트\\"]").getAttribute("aria-pressed")')
    const box = await evaluate(`(() => { const r = document.querySelector('.memo-rich-content ul[data-type=taskList] > li input')?.getBoundingClientRect(); return r ? Math.round(r.width) : 0 })()`)
    if (box === 0) return `checklist pressed=${checklistOn} no task item`
    await tap('.memo-rich-content ul[data-type=taskList] > li input')
    const checked = await evaluate(`(() => { const p = document.querySelector('.memo-rich-content ul[data-type=taskList] > li[data-checked=true] p'); return p ? getComputedStyle(p).textDecorationLine : 'none' })()`)
    await shot('memo-editor-checklist')
    await pause(1300)
    const taskSaved = await stored('d.memos.find((m) => m.id === "m1").body.includes(\'"type":"taskItem","attrs":{"checked":true}\')')
    if (checklistOn !== 'true' || box < 18 || checked !== 'line-through' || !taskSaved) return `checklist pressed=${checklistOn} box=${box} checked=${checked} saved=${taskSaved}`
    // The category sheet applies at once; the menu stars the memo.
    await tap('.memo-pe-chip')
    await pause(300)
    await shot('memo-editor-category')
    await evaluate('[...document.querySelectorAll(".memo-move-option")].find((b) => b.textContent.trim() === "미분류")?.click()')
    await pause(300)
    const category = await stored('d.memos.find((m) => m.id === "m1").categoryId')
    await tap('.memo-pe-top [aria-haspopup=menu]')
    const menu = await evaluate('document.querySelector(".memo-pe-top [aria-haspopup=menu]").getAttribute("aria-expanded") + "|" + [...document.querySelectorAll(".memo-pe-menu [role=menuitem]")].map((b) => b.textContent.trim()).join(",")')
    await shot('memo-editor-menu')
    await evaluate('[...document.querySelectorAll(".memo-pe-menu [role=menuitem]")].find((b) => b.textContent.trim() === "즐겨찾기")?.click()')
    await pause(300)
    const star = await stored('d.memos.find((m) => m.id === "m1").favorite === true')
    if (category !== null || menu !== 'true|즐겨찾기,공유,삭제' || !star) return `category=${category} menu=${menu} star=${star}`
    // The system Back leaves the editor for the list too.
    await evaluate('history.back()')
    await pause(500)
    return await evaluate('Boolean(document.querySelector("[data-memo-row=m1]")) && !document.querySelector(".memo-phone-editor")') ? 'ok' : 'back did not return to the list'
  })
  await scenario('memo-phone-editor-new-and-delete', async () => {
    await tap('.add-fab')
    await pause(300)
    await tap('[data-add=manual]')
    await editorReady()
    const empty = await evaluate('document.querySelector(".memo-pe-title").value')
    await typeBody('장보기 목록')
    await tap('[data-tour=memo-back]')
    const titles = await stored('d.memos.map((m) => m.title).join(",")')
    if (empty !== '' || !titles.split(',').includes('장보기 목록')) return `new memo title=${empty} stored=${titles}`
    const id = await stored('d.memos.find((m) => m.title === "장보기 목록").id')
    await tap(`[data-memo-row="${id}"] button`)
    await editorReady()
    await tap('.memo-pe-top [aria-haspopup=menu]')
    await evaluate('[...document.querySelectorAll(".memo-pe-menu [role=menuitem]")].find((b) => b.textContent.trim() === "삭제")?.click()')
    let confirmed = false
    for (let i = 0; i < 30 && !confirmed; i++) {
      confirmed = await evaluate('(() => { const b = [...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.includes("삭제")); b?.click(); return Boolean(b) })()')
      if (!confirmed) await pause(100)
    }
    await pause(500)
    const after = await stored(`d.memos.some((m) => m.id === ${JSON.stringify(id)}) + "|" + (d.trash ?? []).some((t) => JSON.stringify(t).includes(${JSON.stringify(id)}))`)
    const listed = await evaluate('!document.querySelector(".memo-phone-editor") && Boolean(document.querySelector(".memo-phone-list"))')
    return confirmed && after === 'false|true' && listed ? 'ok' : `delete confirmed=${confirmed} after=${after} listed=${listed}`
  })

  // ---------- Reading ----------
  await scenario('reading-chips-and-add', async () => {
    await navigate(base + '/reading')
    await pause(1000)
    const chips = await evaluate(`(() => { const row = document.querySelector('.reading-status-filters'); const buttons = [...row.querySelectorAll('button')]; const tops = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))); const s = getComputedStyle(row); return { count: buttons.length, rows: tops.size, overflowX: s.overflowX, onScreen: buttons.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth }), height: Math.round(buttons[0].getBoundingClientRect().height), radius: getComputedStyle(buttons[0]).borderRadius } })()`)
    const add = await evaluate(`(() => { const b = document.querySelector('[data-tour=add-book]'); const r = b.getBoundingClientRect(), c = b.closest('header').getBoundingClientRect(); const s = getComputedStyle(b); return { offset: Math.round((r.left + r.width / 2) - (c.left + c.width / 2)), justify: s.justifyContent } })()`)
    await shot('reading-phone')
    // The chips wrap instead of scrolling sideways, so 중단 is never hidden off screen.
    if (chips.count !== 5 || chips.rows > 2 || chips.overflowX === 'auto' || !chips.onScreen || chips.height < 44 || chips.height > 52 || chips.radius === '0px') return 'chips ' + JSON.stringify(chips)
    if (Math.abs(add.offset) > 1 || add.justify !== 'center') return 'add button ' + JSON.stringify(add)
    // Chip filters still filter.
    await tap('.reading-status-filters button:nth-child(3)')
    const listed = await evaluate('document.querySelectorAll(".reading-book-card").length')
    return listed === 4 ? 'ok' : 'filtered ' + listed
  })
  await scenario('reading-drag-autoscroll', async () => {
    await navigate(base + '/reading')
    await pause(1000)
    // Start a book drag, then hold the pointer at the bottom edge (just above the tab bar), then at the top edge.
    await evaluate('document.querySelector("main").scrollTop = 0')
    const handle = await evaluate(`(() => { const h = document.querySelectorAll('.reading-book-drag-handle')[2]; h.scrollIntoView({ block: 'center' }); const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    const navTop = await evaluate('document.querySelector(".mobile-nav").getBoundingClientRect().top')
    const before = await evaluate('document.querySelector("main").scrollTop')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: handle.x, y: handle.y, button: 'left', buttons: 1, clickCount: 1 })
    for (let step = 1; step <= 6; step++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: handle.x, y: handle.y + (navTop - 20 - handle.y) * step / 6, button: 'left', buttons: 1 })
    await pause(600)
    const down = await evaluate('document.querySelector("main").scrollTop')
    for (let step = 1; step <= 6; step++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: handle.x, y: (navTop - 20) - (navTop - 30) * step / 6, button: 'left', buttons: 1 })
    await pause(600)
    const up = await evaluate('document.querySelector("main").scrollTop')
    await shot('reading-drag')
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: handle.x, y: 15, button: 'left', buttons: 0, clickCount: 1 })
    await pause(300)
    const max = await evaluate('(() => { const m = document.querySelector("main"); return m.scrollHeight - m.clientHeight })()')
    return down > before + 20 && up < down - 20 ? 'ok' : `scrollTop before=${before} down=${down} up=${up} max=${max}`
  })
  await scenario('reading-icon-picker-toggle', async () => {
    await navigate(base + '/reading')
    await pause(900)
    await tap('.reading-edit')
    await pause(300)
    await tap('.reading-icon-picker > button')
    const opened = await evaluate('Boolean(document.querySelector(".reading-icon-panel:popover-open"))')
    await shot('reading-icon-open')
    const covered = await evaluate(`(() => { const b = document.querySelector('.reading-icon-picker > button').getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.reading-icon-panel') ? 'covered' : '' })()`)
    if (covered) return 'panel covers its trigger'
    await tap('.reading-icon-picker > button')
    const closed = await evaluate('!document.querySelector(".reading-icon-panel")')
    await tap('.reading-icon-picker > button')
    const reopened = await evaluate('Boolean(document.querySelector(".reading-icon-panel:popover-open"))')
    return opened && closed && reopened ? 'ok' : `open=${opened} closedAfterSecondTap=${closed} reopen=${reopened}`
  })

  // ---------- Settings ----------
  await scenario('settings-app-bar-and-avatar', async () => {
    const until = async (expression) => { for (let i = 0; i < 80 && !(await evaluate(expression)); i++) await pause(100); return evaluate(expression) }
    await navigate(base + '/settings/general')
    // Lazy settings chunks can take a while on a cold dev server; wait for the content instead of a fixed pause.
    await until('Boolean(document.querySelector(".settings-app-bar h1") && document.querySelector(".more-themes"))')
    const bar = await evaluate(`(() => { const head = document.querySelector('.settings-app-bar'); return head ? { title: head.querySelector('h1')?.textContent.trim(), back: head.querySelector('a')?.getAttribute('href'), height: Math.round(head.getBoundingClientRect().height), chips: Boolean(document.querySelector('.settings-chips')), nav: Boolean(document.querySelector('#navigation, #help')), topbar: getComputedStyle(document.querySelector('[data-mobile-topbar]')).display, lang: document.querySelector('.more-seg [aria-checked=true]')?.textContent, themes: document.querySelectorAll('.more-themes button').length, current: document.querySelectorAll('.mobile-nav [aria-current=page]').length } : null })()`)
    await shot('settings-general-phone')
    if (!bar || bar.title !== '일반' || bar.back !== '/more' || bar.height < 56 || bar.chips || bar.nav || bar.topbar !== 'none' || bar.lang !== '한국어' || bar.themes !== 3 || bar.current !== 0) return 'general ' + JSON.stringify(bar)
    await tap('.settings-app-bar a')
    await until('Boolean(document.querySelector("[data-more-page]"))')
    if (await evaluate('location.pathname') !== '/more') return 'back went to ' + await evaluate('location.pathname')
    if (await evaluate('document.querySelectorAll(".mobile-nav [aria-current=page]").length') !== 0) return 'a bottom tab reads as current on More'
    // More keeps the shared top bar; its ☰ leads home from here.
    const top = await evaluate('(() => { const bar = document.querySelector("[data-mobile-topbar]"); return getComputedStyle(bar).display + "|" + bar.querySelector("[data-mobile-tab=more]").getAttribute("href") + "|" + Boolean(document.querySelector("[data-more-page] .more-bar")) })()')
    if (top !== 'flex|/schedule|false') return 'more top bar ' + top
    await tap('[data-more-link=account]')
    await until('Boolean(document.querySelector(".profile-avatar img"))')
    const avatar = await evaluate(`(() => { const box = document.querySelector('.profile-avatar'); const img = box.querySelector('img'); const r = box.getBoundingClientRect(), i = img.getBoundingClientRect(); return { path: location.pathname, w: Math.round(r.width), h: Math.round(r.height), iw: Math.round(i.width), ih: Math.round(i.height), fit: getComputedStyle(img).objectFit, rows: document.querySelectorAll('[data-settings-row]').length } })()`)
    await shot('settings-account-phone')
    if (avatar.path !== '/settings/account') return 'nav ' + avatar.path
    if (avatar.w !== avatar.h || avatar.iw !== avatar.ih || avatar.fit !== 'cover' || avatar.w < 60 || avatar.rows < 5) return 'avatar ' + JSON.stringify(avatar)
    await tap('[data-settings-row=name]')
    if (!(await until('Boolean(document.querySelector("[data-mobile-sheet] input"))'))) return 'name sheet did not open'
    await shot('settings-account-name-sheet')
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await pause(300)
    // AI and calendar list their tabs as sections on phones; long values open sheets.
    await navigate(base + '/settings/ai?tab=input')
    await until('Boolean(document.querySelector("[data-settings-row=work-hours]") && document.querySelector("#settings-section-input"))')
    const ai = await evaluate('({ tabs: document.querySelectorAll("[role=tablist]").length, input: Boolean(document.querySelector("#settings-section-input")), days: document.querySelectorAll(".more-days button").length })')
    if (ai.tabs !== 0 || !ai.input || ai.days !== 7) return 'ai ' + JSON.stringify(ai)
    await tap('[data-settings-row=work-hours]')
    if (!(await until('document.querySelectorAll("[data-mobile-sheet] [data-time-field]").length === 2 && !document.querySelector("[data-mobile-sheet] input[type=time]")'))) return 'work hours sheet did not open'
    await tap('[data-mobile-sheet] [data-time-field]')
    if (!(await until('document.querySelectorAll("[data-mobile-sheet] .mcal-wheels .mcal-wcol").length === 3'))) return 'time wheel did not open'
    await shot('settings-ai-phone')
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await pause(300)
    await navigate(base + '/settings/calendar')
    if (!(await until('Boolean(document.querySelector(".more-gcal") && document.querySelectorAll(".settings-page .more-seg").length >= 5)'))) return 'calendar cards missing'
    await tap('[data-settings-row=day-range]')
    if (!(await until('Boolean(document.querySelector("[data-mobile-sheet] .mcal-wheels"))'))) return 'day range wheel missing'
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await pause(300)
    await shot('settings-calendar-phone')
    await navigate(base + '/settings/categories')
    if (!(await until('Boolean(document.querySelector("[data-category-add]") && document.querySelector("[data-settings-row^=category-]"))'))) return 'category rows missing'
    await tap('[data-category-add]')
    if (!(await until('Boolean(document.querySelector(".cat-modal .cat-modal-name-row input"))'))) return 'category add dialog missing'
    await shot('settings-category-add-phone')
    await tap('.cat-modal header .icon-btn')
    await pause(300)
    await tap('[data-settings-row^=category-]')
    if (!(await until('Boolean(document.querySelector("[data-mobile-sheet]"))'))) return 'category sheet did not open'
    await shot('settings-categories-phone')
    return 'ok'
  })

  // ---------- Desktop regression ----------
  await setViewport(1440, 1000, false)
  await scenario('desktop-unchanged', async () => {
    await navigate(base + '/schedule')
    await pause(1000)
    const schedule = await evaluate('({ phone: Boolean(document.querySelector("[data-schedule-mobile]")), calendar: Boolean(document.querySelector("[data-theme-slot=calendar]")), timeline: Boolean(document.querySelector(".schedule-timeline-scroll")), nav: getComputedStyle(document.querySelector(".mobile-nav")).display })')
    await shot('desktop-schedule')
    if (schedule.phone || !schedule.calendar || !schedule.timeline || schedule.nav !== 'none') return 'schedule ' + JSON.stringify(schedule)
    await navigate(base + '/reading')
    await pause(900)
    const reading = await evaluate(`(() => { const b = [...document.querySelectorAll('.reading-status-filters .reading-nav')]; const r = b.map((x) => x.getBoundingClientRect()); return { display: getComputedStyle(document.querySelector('.reading-status-filters')).display, stacked: r.every((x, i) => i === 0 || x.top > r[i - 1].top), wide: r.every((x) => x.width > 150) } })()`)
    await shot('desktop-reading')
    if (reading.display !== 'contents' || !reading.stacked || !reading.wide) return 'reading ' + JSON.stringify(reading)
    await navigate(base + '/settings/general')
    await pause(800)
    const settings = await evaluate('({ bar: Boolean(document.querySelector(".settings-app-bar")), nav: Boolean(document.querySelector("#navigation [data-mobile-nav-settings]")), side: getComputedStyle(document.querySelector("[data-tour=settings-nav]")).display })')
    await shot('desktop-settings')
    if (settings.bar || !settings.nav || settings.side === 'none') return 'desktop settings changed ' + JSON.stringify(settings)
    await navigate(base + '/memo')
    await pause(800)
    const memo = await evaluate('getComputedStyle(document.querySelector("[data-memo-row] .memo-row-actions")).opacity')
    await shot('desktop-memo')
    await navigate(base + '/schedule?add=quick')
    await pause(800)
    await shot('desktop-home')
    return memo === '0' ? 'ok' : 'memo actions opacity ' + memo
  })

  if (errors.length) { log('page errors: ' + errors.slice(0, 3).join(' | ')); failures.push('page-errors') }
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify({ started, ended: new Date().toISOString(), ok: failures.length === 0, failures, report, errors }, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
  if (failures.length) { console.error('FAILED: ' + failures.join(', ')); process.exitCode = 1 } else log('all mobile UX scenarios passed')
} finally {
  ws.close()
  browser.kill()
  server.kill()
}
