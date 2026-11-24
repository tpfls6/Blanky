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
      const state = await evaluate('(() => { const p = document.querySelector("[data-more-page]"); if (!p || location.pathname !== "/more") return "menu page missing"; if (document.querySelector("dialog[open]")) return "menu is modal"; const rows = [...p.querySelectorAll(".more-menu-row")]; return rows.every(r => r.getBoundingClientRect().height >= 44) ? "ok" : "small touch target" })()')
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
    await navigate(base + '/settings/general')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-mobile-nav-settings]"))')); i++) await pause(100)
    const desktopBefore = await evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('blanky.library.${owner}')).settings.nav)`)
    await evaluate(`(() => { const select = document.querySelector('[data-mobile-nav-slot="0"]'); select.value = 'activity'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await pause(300)
    await evaluate('document.querySelector("[data-mobile-nav-settings] li:first-child button:last-child").click()')
    await pause(300)
    const tabs = () => evaluate('[...document.querySelectorAll(".mobile-nav [data-mobile-tab]")].map(e => e.dataset.mobileTab).join(",")')
    // Slot 1 (schedule) becomes activity, then moves down one place.
    if (await tabs() !== 'memo,activity,reading,diary') return 'saved order not applied: ' + await tabs()
    await navigate(base + '/more')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-more-page]"))')); i++) await pause(100)
    if (await tabs() !== 'memo,activity,reading,diary') return 'order lost after reload'
    if (!(await evaluate('Boolean(document.querySelector("[data-more-link=schedule]")) && !document.querySelector("[data-more-link=activity]")'))) return 'More did not follow mobile pins'
    const desktopAfter = await evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('blanky.library.${owner}')).settings.nav)`)
    if (desktopBefore !== desktopAfter) return 'mobile setting changed desktop menu'
    await tap('[data-more-link=mobile-navigation]')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-mobile-nav-settings]"))')); i++) await pause(100)
    await pause(300)
    if (!(await evaluate('location.hash === "#navigation" && document.querySelector("[data-mobile-nav-settings]").getBoundingClientRect().top < innerHeight'))) return 'menu edit shortcut did not reveal settings'
    await shot('mobile-menu-settings')
    await evaluate('document.querySelector("[data-mobile-nav-settings] > button").click()')
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
  await scenario('memo-row-delete-icon', async () => {
    await navigate(base + '/memo')
    await pause(900)
    // Phones open the first memo; go back to the list.
    await evaluate('[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "목록보기")?.click()')
    await pause(300)
    const sizes = await evaluate('[...document.querySelectorAll("[data-memo-row] .memo-row-actions button")].map((b) => { const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)) + ":" + getComputedStyle(b.parentElement).opacity })')
    await shot('memo-list-phone')
    if (sizes.length !== 6 || sizes.some((value) => Number(value.split(':')[0]) < 40 || value.split(':')[1] !== '1')) return 'icons ' + sizes.join(',')
    return 'ok'
  })
  await scenario('memo-bulk-delete', async () => {
    await tap('.memo-pick-toggle')
    await tap('[data-memo-row=m0] .memo-row-check')
    await tap('[data-memo-row=m2] button')
    const count = await evaluate('document.querySelector(".memo-pick-count").textContent')
    if (count !== '2개 선택됨') return 'count ' + count
    await shot('memo-picking')
    await tap('.memo-pick-delete')
    await pause(300)
    const dialog = await evaluate('document.querySelector("dialog[open]")?.innerText ?? ""')
    await shot('memo-confirm')
    if (!dialog.includes('2개')) return 'confirm missing: ' + dialog
    // Cancel keeps everything.
    await evaluate('[...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.trim() === "취소").click()')
    await pause(300)
    const kept = await stored('d.memos.length')
    if (kept !== 3) return 'cancel removed memos: ' + kept
    await tap('.memo-pick-delete')
    // Wait for the dialog itself: a fixed pause flaked under load (the confirm button was not there yet).
    let confirmed = false
    for (let i = 0; i < 30 && !confirmed; i++) {
      confirmed = await evaluate('(() => { const b = [...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.includes("삭제")); b?.click(); return Boolean(b) })()')
      if (!confirmed) await pause(100)
    }
    if (!confirmed) return 'second confirm did not open'
    await pause(500)
    const data = await stored('d.memos.map((m) => m.id).join(",") + "|" + (d.trash ?? []).length')
    const picking = await evaluate('Boolean(document.querySelector(".memo-pick-bar"))')
    return data === 'm1|2' && !picking ? 'ok' : 'after delete ' + data + ' picking=' + picking
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
  await scenario('settings-chips-and-avatar', async () => {
    await navigate(base + '/settings/general')
    await pause(900)
    const chips = await evaluate(`(() => { const nav = document.querySelector('.settings-chips'); const s = nav && getComputedStyle(nav); return nav ? { display: s.display, overflowX: s.overflowX, count: nav.querySelectorAll('a').length, current: nav.querySelector('[aria-current=page]')?.textContent.trim(), rows: new Set([...nav.querySelectorAll('a')].map((a) => Math.round(a.getBoundingClientRect().top))).size } : null })()`)
    await shot('settings-general-phone')
    if (!chips || chips.display === 'none' || chips.count !== 5 || chips.overflowX !== 'auto' || chips.rows !== 1) return 'chips ' + JSON.stringify(chips)
    await tap('.settings-chips a:nth-child(2)')
    await pause(500)
    const avatar = await evaluate(`(() => { const box = document.querySelector('.profile-avatar'); const img = box.querySelector('img'); const r = box.getBoundingClientRect(), i = img.getBoundingClientRect(); return { path: location.pathname, w: Math.round(r.width), h: Math.round(r.height), iw: Math.round(i.width), ih: Math.round(i.height), fit: getComputedStyle(img).objectFit } })()`)
    await shot('settings-account-phone')
    if (avatar.path !== '/settings/account') return 'nav ' + avatar.path
    return avatar.w === avatar.h && avatar.iw === avatar.ih && avatar.fit === 'cover' && avatar.w >= 60 ? 'ok' : 'avatar ' + JSON.stringify(avatar)
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
    const settings = await evaluate('getComputedStyle(document.querySelector(".settings-chips")).display')
    await shot('desktop-settings')
    if (settings !== 'none') return 'settings chips on desktop ' + settings
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
