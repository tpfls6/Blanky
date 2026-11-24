// Mobile UX E2E: phone tabs, schedule pager, chat day filter, memo bulk delete,
// reading folders/drag, settings chips and category creation, plus a desktop
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
      for (let retry = 0; retry < 60 && !(await evaluate('Boolean(document.querySelector(".mobile-nav [data-mobile-tab]") && document.querySelector("[data-mobile-tab=more]"))')); retry++) await pause(100)
      const tabs = await evaluate('[...document.querySelectorAll(".mobile-nav > ul [data-mobile-tab]")].map((el) => el.dataset.mobileTab).join(",")')
      if (tabs !== 'schedule,memo,reading,diary') return 'tabs ' + tabs
      // More sits top-left: in the top bar, or in the schedule screen's own one-line header.
      const top = await evaluate('(() => { const m = document.querySelector("[data-mobile-tab=more]")?.getBoundingClientRect(); return Boolean(m) && m.left < innerWidth / 2 && m.top < 60 })()')
      if (!top) return 'more icon not top-left'
      const sizes = await evaluate('[...document.querySelectorAll(".mobile-nav > ul .mobile-link")].map((el) => { const r = el.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)) })')
      if (sizes.some((size) => size < 44)) return 'small tab ' + sizes.join(',')
      return 'ok'
    })
    await scenario(`${width} tab-header-alignment`, async () => {
      const headers = {}
      for (const route of ['memo', 'schedule', 'reading', 'diary']) {
        await navigate(base + '/' + route)
        for (let retry = 0; retry < 60 && !(await evaluate('Boolean(document.querySelector(".mobile-tab-header .mobile-tab-title"))')); retry++) await pause(100)
        headers[route] = await evaluate(`(() => {
          const header = document.querySelector('.mobile-tab-header');
          const menu = header?.querySelector('[data-mobile-tab=more]');
          const text = header?.querySelector('.mobile-tab-title > span');
          if (!menu || !text) return null;
          const box = element => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] };
          return { header: box(header), menu: box(menu), icon: box(menu.querySelector('svg')), title: box(text).filter((_, index) => index !== 2), content: text.textContent.trim(), href: menu.getAttribute('href') };
        })()`)
        if (width === 390 && headers[route]) await shot('header-' + route)
      }
      const memo = headers.memo
      if (!memo || memo.header[3] !== 56 || memo.menu[2] !== 44 || memo.menu[3] !== 44) return 'invalid memo reference ' + JSON.stringify(memo)
      for (const [route, header] of Object.entries(headers)) {
        if (!header?.content || header.href !== '/more') return 'invalid header ' + route + ' ' + JSON.stringify(header)
        for (const part of ['header', 'menu', 'icon', 'title']) {
          if (header[part].some((value, index) => Math.abs(value - memo[part][index]) > 0.05)) return route + ' ' + part + ' mismatch ' + JSON.stringify(headers)
        }
      }
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
  await scenario('reading-folders-and-add', async () => {
    await navigate(base + '/reading')
    await pause(1000)
    // A cold Vite compile of the reading chunk can take longer than the pause.
    for (let i = 0; i < 100 && !(await evaluate('Boolean(document.querySelector(".reading-folders-disclosure") && document.querySelector(".reading-book-card"))')); i++) await pause(100)
    const collapsed = await evaluate('document.querySelector(".reading-folders-disclosure").inert && !document.querySelector(".reading-filter-button, .reading-library-filters, .reading-list-heading")')
    const listTop = () => evaluate('document.querySelector(".reading-book-card").getBoundingClientRect().top')
    const foldedTop = await listTop()
    const addAvailable = await evaluate('document.querySelector("[data-tour=add-book]").getBoundingClientRect().height >= 44')
    await shot('reading-phone')
    if (!collapsed || !addAvailable) return `collapsed=${collapsed} addAvailable=${addAvailable}`
    await tap('[data-tour=reading-folders]')
    const unfoldedTop = await listTop()
    const overlay = await evaluate(`(() => {
      const menu = document.querySelector('.reading-folders-disclosure').getBoundingClientRect();
      const header = document.querySelector('.reading-heading').getBoundingClientRect();
      const dim = document.querySelector('.reading-folders-dim');
      const point = { x: innerWidth / 2, y: menu.bottom + 15 };
      return menu.height > 100 && Math.abs(menu.top - header.bottom) <= 1 && getComputedStyle(dim).opacity === '1' && document.elementFromPoint(point.x, point.y) === dim;
    })()`)
    if (!overlay || Math.abs(unfoldedTop - foldedTop) > 1) return `overlay=${overlay} list top folded=${foldedTop} unfolded=${unfoldedTop}`
    await shot('reading-folders-open')
    const outsideY = await evaluate('document.querySelector(".reading-folders-disclosure").getBoundingClientRect().bottom + 15')
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: outsideY }] })
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await pause(250)
    if (!(await evaluate('document.querySelector(".reading-folders-disclosure").inert'))) return 'scrim did not close the menu'
    await tap('[data-tour=reading-folders]')
    const folders = await evaluate(`(() => { const buttons = [...document.querySelectorAll('.reading-status-filters button')]; return { count: buttons.length, rows: new Set(buttons.map(b => Math.round(b.getBoundingClientRect().top))).size, onScreen: buttons.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 44 }) } })()`)
    if (folders.count !== 5 || folders.rows !== 5 || !folders.onScreen) return 'folders ' + JSON.stringify(folders)
    await tap('.reading-status-filters button:nth-child(3)')
    const listed = await evaluate('document.querySelectorAll(".reading-book-card").length')
    const closed = await evaluate('document.querySelector(".reading-folders-disclosure").inert')
    const filteredTop = await listTop()
    return listed === 4 && closed && Math.abs(filteredTop - foldedTop) <= 1 ? 'ok' : `filtered=${listed} closed=${closed} closedTop=${filteredTop}`
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
    const opened = await evaluate('!document.querySelector(".reading-folders-disclosure").inert')
    const down = await evaluate('document.querySelector("main").scrollTop')
    for (let step = 1; step <= 6; step++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: handle.x, y: (navTop - 20) - (navTop - 30) * step / 6, button: 'left', buttons: 1 })
    await pause(600)
    const up = await evaluate('document.querySelector("main").scrollTop')
    await shot('reading-drag')
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: handle.x, y: 15, button: 'left', buttons: 0, clickCount: 1 })
    await pause(300)
    const max = await evaluate('(() => { const m = document.querySelector("main"); return m.scrollHeight - m.clientHeight })()')
    return opened && down > before + 20 && up < down - 20 ? 'ok' : `opened=${opened} scrollTop before=${before} down=${down} up=${up} max=${max}`
  })
  await scenario('reading-icon-picker-toggle', async () => {
    await navigate(base + '/reading')
    await pause(900)
    await tap('[data-tour=reading-folders]')
    await tap('.reading-shelf-heading button')
    const layout = await evaluate(`(() => {
      const dialog = document.querySelector('dialog.reading-shelf-dialog[open]');
      if (!dialog?.matches(':modal')) return false;
      const rect = dialog.getBoundingClientRect();
      const field = dialog.querySelector('.reading-shelf-name-row input');
      const tile = dialog.querySelector('.reading-icon-picker > button');
      const input = field.getBoundingClientRect();
      const button = tile.getBoundingClientRect();
      return Math.abs(rect.x + rect.width / 2 - innerWidth / 2) <= 1 &&
        Math.abs(rect.y + rect.height / 2 - innerHeight / 2) <= 1 &&
        button.left > input.right && button.top === input.top && button.width === input.height && button.height === input.height &&
        field.labels.length === 1 && !tile.textContent.trim() && tile.hasAttribute('aria-label') && Boolean(tile.querySelector('.lucide-book-open'));
    })()`)
    if (!layout) return 'new shelf modal or icon button layout is incorrect'
    await shot('reading-shelf-create')
    await tap('.reading-shelf-dialog header button')
    await tap('.reading-edit')
    await pause(300)
    await shot('reading-shelf-edit')
    await tap('.reading-icon-picker > button')
    const opened = await evaluate('Boolean(document.querySelector(".reading-icon-panel:popover-open"))')
    await shot('reading-icon-open')
    const covered = await evaluate(`(() => { const b = document.querySelector('.reading-icon-picker > button').getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.reading-icon-panel') ? 'covered' : '' })()`)
    if (covered) return 'panel covers its trigger'
    await tap('.reading-icon-picker > button')
    const closed = await evaluate('!document.querySelector(".reading-icon-panel")')
    await tap('.reading-icon-picker > button')
    const reopened = await evaluate('Boolean(document.querySelector(".reading-icon-panel:popover-open"))')
    if (!opened || !closed || !reopened) return `open=${opened} closedAfterSecondTap=${closed} reopen=${reopened}`
    const escape = async () => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await pause(100)
    }
    await escape()
    if (!(await evaluate('!document.querySelector(".reading-icon-panel") && Boolean(document.querySelector(".reading-shelf-dialog[open]"))'))) return 'Escape did not close just the icon picker'
    await escape()
    return await evaluate('!document.querySelector(".reading-shelf-dialog") && document.activeElement?.matches(".reading-edit")') ? 'ok' : 'Escape did not close the shelf editor and restore focus'
  })

  await scenario('reading-book-detail', async () => {
    const reading = (expression) => evaluate(`(() => { const d = JSON.parse(localStorage.getItem('blanky.reading.v1.${owner}')); const b = d.books.find((x) => x.id === 'ub0'); return ${expression} })()`)
    const until = async (expression) => { for (let i = 0; i < 50 && !(await evaluate(expression)); i++) await pause(100); return evaluate(expression) }
    const setText = (selector, value, proto = 'HTMLTextAreaElement') => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    const clickText = (selector, text) => evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)}))?.click()`)
    await navigate(base + '/reading')
    await until('Boolean(document.querySelector(".reading-book-card a[href=\\"/reading/ub0\\"]"))')
    await tap('.reading-book-card a[href="/reading/ub0"]')
    if (!(await until('Boolean(document.querySelector(".reading-pd-top"))'))) return 'phone detail did not open'
    // ← · title · ⋮ takes the top edge (no MobileTopBar); old back link, delete button and the open metadata form are gone.
    const shape = await evaluate(`(() => {
      const top = document.querySelector('.reading-pd-top').getBoundingClientRect()
      const pad = (selector) => getComputedStyle(document.querySelector(selector)).paddingLeft
      const tabs = [...document.querySelectorAll('.reading-pd-tabs [role=tab]')].map((t) => t.getBoundingClientRect().width)
      return { bar: Math.round(top.top) + ',' + Math.round(top.height), topbar: Boolean(document.querySelector('[data-mobile-topbar]')), title: document.querySelector('.reading-pd-title').textContent,
        old: Boolean(document.querySelector('.reading-back, .reading-remove, [aria-label="책 종류 편집"]')), chip: document.querySelector('.reading-pd-meta .memo-pe-chip')?.textContent.trim(),
        gutters: [pad('.reading-pd-meta'), pad('.reading-pd-hero'), pad('.reading-pd-tabs'), pad('.reading-pd-row'), pad('.reading-pd-review')].join(','),
        tabSpread: Math.round(Math.max(...tabs) - Math.min(...tabs)), chips: [...new Set([...document.querySelectorAll('.reading-pd-chip, .reading-pd-date')].map((c) => Math.round(c.getBoundingClientRect().height)))].join(','),
        stars: [...new Set([...document.querySelectorAll('.reading-pd-info .reading-rating-half')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) }))].join(','),
        starSize: Math.round(document.querySelector('.reading-pd-info .reading-rating-star').getBoundingClientRect().width),
        fab: Boolean(document.querySelector('.add-fab')), overflow: document.documentElement.scrollWidth > innerWidth }
    })()`)
    await shot('reading-detail-phone')
    if (shape.bar !== '0,56' || shape.topbar || shape.title !== '테스트 책 1' || shape.old || shape.chip !== '책장 없음' || shape.gutters !== '16px,16px,16px,16px,16px' || shape.tabSpread > 1 || shape.chips !== '32' || shape.stars !== '16x44' || shape.starSize !== 22 || shape.fab || shape.overflow) return 'shape ' + JSON.stringify(shape)
    // Record fields save by themselves: chips and stars at once, the review after typing stops, tags on Enter.
    await clickText('.reading-pd-chip', '읽는 중')
    await pause(400)
    await evaluate('document.querySelector(".reading-pd-info [aria-label=\\"4점 선택\\"]").click()')
    await setText('.reading-pd-review', '자동 저장 감상')
    const saving = await evaluate('document.querySelector(".reading-pd-meta [role=status]").textContent')
    await pause(1300)
    await tap('.reading-pd-tag-add')
    await until('document.activeElement?.matches(".reading-pd-tag-input")')
    await setText('.reading-pd-tag-input', '여름', 'HTMLInputElement')
    await evaluate('document.querySelector(".reading-pd-tag-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))')
    await pause(600)
    const record = await reading('[b.reading_status, Boolean(b.started_at), b.rating, b.review, b.tags.join(",")].join("|")')
    const saved = await evaluate('document.querySelector(".reading-pd-meta [role=status]").textContent')
    if (saving !== '저장 중…' || record !== 'reading|true|4|자동 저장 감상|여름' || saved !== '저장됨') return `autosave saving=${saving} record=${record} status=${saved}`
    // Tag row: chips and ＋ 태그 추가 are 32px on one line, labels sit on the first chip's center in every row,
    // and a tag chip's visual side gaps (text on the left, the × glyph on the right) match.
    const tagRow = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.reading-pd-row')].map((row) => { const label = row.querySelector('.reading-pd-label').getBoundingClientRect(); const first = row.querySelector('.reading-pd-chip, .reading-pd-date, .reading-pd-tag').getBoundingClientRect(); return Math.abs((label.top + label.height / 2) - (first.top + first.height / 2)) <= 1 })
      const tag = document.querySelector('.reading-pd-tag:not(.reading-pd-tag-add)'), add = document.querySelector('.reading-pd-tag-add')
      const box = tag.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(tag.firstChild)
      const left = range.getBoundingClientRect().left - box.left, right = box.right - tag.querySelector('svg path, svg line, svg *:not(svg)').closest('svg').getBoundingClientRect().right + 3
      const a = add.getBoundingClientRect()
      return { rows: rows.join(','), sides: Math.abs(left - right) <= 1.5, add: Math.round(a.height) + '|' + (Math.abs((a.top + a.height / 2) - (box.top + box.height / 2)) <= 1) }
    })()`)
    await shot('reading-detail-tags')
    if (tagRow.rows !== 'true,true,true' || !tagRow.sides || tagRow.add !== '32|true') return 'tag row ' + JSON.stringify(tagRow)
    // The shelf chip opens a sheet; tapping a shelf puts the book on it.
    await tap('.reading-pd-meta .memo-pe-chip')
    await until('Boolean(document.querySelector("[data-mobile-sheet] .memo-move-option"))')
    await shot('reading-detail-shelf')
    await clickText('[data-mobile-sheet] .memo-move-option', '인생책')
    await pause(500)
    const shelved = await reading('d.memberships.some((m) => m.user_book_id === "ub0" && m.shelf_id === "sh1")')
    // ＋ 새 책장 creates a shelf by name and puts this book on it (checked in the list).
    await tap('[data-mobile-sheet] .reading-pd-new-shelf')
    await until('Boolean(document.querySelector(".reading-pd-new-shelf-form input"))')
    await setText('.reading-pd-new-shelf-form input', '여행', 'HTMLInputElement')
    await evaluate('document.querySelector(".reading-pd-new-shelf-form .btn").click()')
    await until('[...document.querySelectorAll("[data-mobile-sheet] .memo-move-option")].some((b) => b.textContent.includes("여행") && b.getAttribute("aria-checked") === "true")')
    await shot('reading-detail-new-shelf')
    const created = await reading('(() => { const s = d.shelves.find((x) => x.name === "여행"); return Boolean(s) && d.memberships.some((m) => m.user_book_id === "ub0" && m.shelf_id === s.id) })()')
    if (!created) return 'new shelf not created with the book on it'
    await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))')
    await pause(400)
    const chip = await evaluate('document.querySelector(".reading-pd-meta .memo-pe-chip").textContent.trim()')
    if (!shelved || chip !== '인생책 +1') return `shelf stored=${shelved} chip=${chip}`
    // ⋮ menu: 책 정보 수정 / 책장 이동 / 공유 / 서재에서 빼기 (red); 책 정보 수정 is a sheet that saves.
    await tap('.reading-pd-top [aria-haspopup=menu]')
    const menu = await evaluate('[...document.querySelectorAll(".memo-pe-menu [role=menuitem]")].map((b) => b.textContent.trim()).join(",") + "|" + Boolean(document.querySelector(".memo-pe-menu .memo-pe-danger"))')
    await shot('reading-detail-menu')
    await clickText('.memo-pe-menu [role=menuitem]', '책 정보 수정')
    if (!(await until('Boolean(document.querySelector("[data-mobile-sheet] [aria-label=\\"책 종류 편집\\"]"))'))) return 'metadata sheet did not open'
    await shot('reading-detail-info-sheet')
    await setText('[data-mobile-sheet] [aria-label="책 종류 편집"]', '소설', 'HTMLInputElement')
    await evaluate('document.querySelector("[data-mobile-sheet] form").requestSubmit()')
    await until('!document.querySelector("[data-mobile-sheet]")')
    const category = await reading('(b.book.categories ?? []).join(",")')
    if (menu !== '책 정보 수정,책장 이동,공유,서재에서 빼기|true' || category !== '소설') return `menu=${menu} category=${category}`
    // 문장 tab: + adds through a sheet, a row opens the edit sheet with 삭제.
    await clickText('.reading-pd-tabs [role=tab]', '문장')
    await pause(200)
    if (!(await evaluate('Boolean(document.querySelector(".add-fab"))'))) return 'no + on the quotes tab'
    await tap('.add-fab')
    await pause(300)
    await tap('[data-add=manual]')
    await until('Boolean(document.querySelector("[data-mobile-sheet] textarea"))')
    await setText('[data-mobile-sheet] textarea', '어떤 계절은 끝나고 나서야 시작된다.')
    await evaluate('document.querySelector("[data-mobile-sheet] form").requestSubmit()')
    await until('Boolean(document.querySelector(".reading-pd-entry"))')
    await shot('reading-detail-quotes')
    const tabCount = await evaluate('[...document.querySelectorAll(".reading-pd-tabs [role=tab]")].find((t) => t.textContent.startsWith("문장")).textContent')
    await tap('.reading-pd-entry')
    await until('Boolean(document.querySelector("[data-mobile-sheet] .reading-pd-delete"))')
    await evaluate('document.querySelector("[data-mobile-sheet] .reading-pd-delete").click()')
    await until('Boolean(document.querySelector(".reading-modal .btn-primary"))')
    await evaluate('document.querySelector(".reading-modal .btn-primary").click()')
    await until('!document.querySelector(".reading-pd-entry")')
    const quotes = await reading('d.highlights.filter((h) => h.user_book_id === "ub0").length')
    if (tabCount !== '문장1' || quotes !== 0) return `tab=${tabCount} quotes=${quotes}`
    // ← returns to the library.
    await tap('.reading-pd-top button[aria-label]')
    return await until('location.pathname === "/reading" && Boolean(document.querySelector(".reading-book-card"))') ? 'ok' : 'back did not return to the library'
  })

  await scenario('reading-book-detail-fit', async () => {
    const libKey = `blanky.library.${owner}`, readKey = `blanky.reading.v1.${owner}`, localeKey = `blanky.locale.${owner}`, prefKey = `blanky.preferences.${owner}`
    const until = async (expression) => { for (let i = 0; i < 60 && !(await evaluate(expression)); i++) await pause(100); return evaluate(expression) }
    // Storage is edited on a static file of the same origin, so the running app cannot write its own state back over it.
    const offApp = () => navigate(base + '/favicon.svg')
    const saved = await evaluate(`[localStorage.getItem('${libKey}'), localStorage.getItem('${readKey}'), localStorage.getItem('${localeKey}'), localStorage.getItem('${prefKey}')]`)
    const now = '2026-09-01T00:00:00.000Z'
    try {
      // The star row (stars · score · ×) stays one line at 360 and 390, Korean and English, with a 4.5 rating.
      await offApp()
      await evaluate(`(() => { const d = JSON.parse(localStorage.getItem('${readKey}')); d.books.find((b) => b.id === 'ub0').rating = 4.5; localStorage.setItem('${readKey}', JSON.stringify(d)) })()`)
      const rows = []
      for (const locale of ['ko', 'en']) {
        await offApp()
        await evaluate(`(() => { const d = JSON.parse(localStorage.getItem('${libKey}')); d.settings.locale = '${locale}'; localStorage.setItem('${libKey}', JSON.stringify(d)); localStorage.setItem('${localeKey}', JSON.stringify({ locale: '${locale}', updatedAt: new Date().toISOString() })); const p = JSON.parse(localStorage.getItem('${prefKey}') ?? 'null'); if (p) localStorage.setItem('${prefKey}', JSON.stringify({ ...p, locale: '${locale}' })) })()`)
        for (const width of [360, 390]) {
          await setViewport(width, 800, true)
          await navigate(base + '/reading/ub0')
          await until('Boolean(document.querySelector(".reading-pd-info .reading-rating .btn"))')
          const row = await evaluate(`(() => { const rating = document.querySelector('.reading-pd-info .reading-rating').getBoundingClientRect(), clear = document.querySelector('.reading-pd-info .reading-rating .btn').getBoundingClientRect(), info = document.querySelector('.reading-pd-info').getBoundingClientRect()
            return document.querySelector('.reading-pd-tabs [role=tab]').textContent + '|' + Math.round(rating.height) + '|' + Math.round(clear.width) + '|' + (clear.right <= info.right + 0.5) })()`)
          rows.push(`${locale}${width}:${row}`)
          if (width === 360) await shot(`reading-detail-stars-${locale}-360`)
        }
      }
      if (rows.some((row) => !row.endsWith('|44|32|true')) || rows.filter((row) => row.includes(':Log|')).length !== 2) return 'star rows ' + rows.join(' ')
      // A custom reading page's ?book= detail hides MobileTopBar too, so its app bar takes the top edge.
      await offApp()
      await evaluate(`(() => { const d = JSON.parse(localStorage.getItem('${libKey}')); d.settings.locale = 'ko'; localStorage.setItem('${localeKey}', JSON.stringify({ locale: 'ko', updatedAt: new Date().toISOString() })); const p = JSON.parse(localStorage.getItem('${prefKey}') ?? 'null'); if (p) localStorage.setItem('${prefKey}', JSON.stringify({ ...p, locale: 'ko' }))
        const book = { id: 'pb-1', user_id: '${owner}', book_id: 'pb-1', reading_status: 'reading', rating: null, current_page: 0, total_pages: null, progress: 0, started_at: null, finished_at: null, review: '', tags: [], created_at: '${now}', updated_at: '${now}', book: { id: 'pb-1', external_source: 'blanky-page', external_id: 'pb-1', title: '커스텀 책', author: '작가', cover_url: null, isbn10: null, isbn13: null, publisher: null, published_date: null, description: null, page_count: null, created_at: '${now}' } }
        d.customPages = [{ id: 'pg-read', name: '내 독서', icon: 'Library', description: '', sort: 0, schemaVersion: 1, blocks: [], template: 'reading', fieldLabels: {}, createdAt: '${now}', updatedAt: '${now}' }]
        d.records = [{ id: 'pb-1', typeId: 'pg-read', title: '커스텀 책', values: { readingBook: JSON.stringify(book) }, templateVersion: 1, createdAt: '${now}', updatedAt: '${now}' }]
        localStorage.setItem('${libKey}', JSON.stringify(d)) })()`)
      await setViewport(390, 800, true)
      await navigate(base + '/pages/pg-read')
      const listBar = await until('Boolean(document.querySelector("[data-mobile-topbar]")) && Boolean(document.querySelector(".reading-book-card"))')
      await navigate(base + '/pages/pg-read?book=pb-1')
      await until('Boolean(document.querySelector(".reading-pd-top"))')
      const custom = await evaluate(`(() => { const top = document.querySelector('.reading-pd-top').getBoundingClientRect(); return Math.round(top.top) + ',' + Math.round(top.height) + '|' + Boolean(document.querySelector('[data-mobile-topbar]')) + '|' + getComputedStyle(document.querySelector('.reading-pd-top')).position })()`)
      await shot('reading-detail-custom-page')
      if (!listBar || custom !== '0,56|false|sticky') return `custom page list bar=${listBar} detail=${custom}`
      return 'ok'
    } finally {
      await offApp()
      await evaluate(`(([lib, read, locale, pref]) => { localStorage.setItem('${libKey}', lib); localStorage.setItem('${readKey}', read); if (locale) localStorage.setItem('${localeKey}', locale); else localStorage.removeItem('${localeKey}'); if (pref) localStorage.setItem('${prefKey}', pref); else localStorage.removeItem('${prefKey}') })(${JSON.stringify(saved)})`)
      await setViewport(390, 800, true)
    }
  })
  await scenario('reading-add', async () => {
    const store = (expression) => evaluate(`(() => { const d = JSON.parse(localStorage.getItem('blanky.reading.v1.${owner}')); return ${expression} })()`)
    const until = async (expression) => { for (let i = 0; i < 60 && !(await evaluate(expression)); i++) await pause(100); return evaluate(expression) }
    const setValue = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    const clickText = (selector, text) => evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)}))?.click()`)
    const open = async () => {
      await tap('.add-fab')
      await pause(300)
      await tap('[data-add=manual]')
      return until('Boolean(document.querySelector(".reading-add-search input")) && document.activeElement === document.querySelector(".reading-add-search input")')
    }
    const search = async (query) => {
      await setValue('.reading-add-search input', query)
      await evaluate('document.querySelector(".reading-add-search").requestSubmit()')
    }
    await navigate(base + '/reading')
    await until('Boolean(document.querySelector(".reading-book-card"))')
    // Google Books answers from a stub: two books, none for "없는".
    await evaluate(`(() => { const real = window.fetch; window.fetch = async (url, init) => { const u = String(url); if (!u.includes('googleapis.com/books')) return real(url, init); const q = new URL(u).searchParams.get('q');
      const items = q.includes('없는') ? [] : [{ id: 'g1', volumeInfo: { title: '바람이 머무는 곳', authors: ['박서연'], publisher: '문학동네', publishedDate: '2023-05-01' } }, { id: 'g2', volumeInfo: { title: '숲의 시간', authors: ['이도윤'], publishedDate: '2021' } }];
      await new Promise((r) => setTimeout(r, 400)); return new Response(JSON.stringify({ items }), { status: 200, headers: { 'content-type': 'application/json' } }) } })()`)
    if (!(await open())) return 'add sheet did not open with the search field focused'
    const shape = await evaluate(`(() => {
      const sheet = document.querySelector('[data-mobile-sheet]').getBoundingClientRect(), field = document.querySelector('.reading-add-search').getBoundingClientRect()
      return { tall: sheet.height >= innerHeight - 44 - 40, field: Math.round(field.left) + ',' + Math.round(field.height), modes: [...document.querySelectorAll('.reading-add-mode button')].map((b) => Math.round(b.getBoundingClientRect().height) + b.getAttribute('aria-pressed')).join(','),
        details: Boolean(document.querySelector('[data-mobile-sheet] details')), searchButton: [...document.querySelectorAll('[data-mobile-sheet] button')].some((b) => b.textContent.trim() === '검색' && !b.closest('.reading-add-mode')) }
    })()`)
    await shot('reading-add-idle')
    if (!shape.tall || shape.field !== '16,44' || shape.modes !== '32true,32false' || shape.details || shape.searchButton) return 'shape ' + JSON.stringify(shape)
    // 검색 → skeleton → results; a result opens the confirm step (status and shelf chips, ＋ 새 책장).
    await search('바람')
    const skeleton = await until('Boolean(document.querySelector(".reading-add-skeleton"))')
    await until('document.querySelectorAll(".reading-add-result").length === 2')
    await shot('reading-add-results')
    await tap('.reading-add-result')
    if (!(await until('Boolean(document.querySelector(".reading-add-book"))'))) return 'confirm step did not open'
    // The system Back returns to the results first.
    await evaluate('history.back()')
    const backToResults = await until('!document.querySelector(".reading-add-book") && document.querySelectorAll(".reading-add-result").length === 2')
    await tap('.reading-add-result')
    await until('Boolean(document.querySelector(".reading-add-book"))')
    await clickText('.reading-add-group .reading-pd-chip', '완독')
    await clickText('.reading-add-group .reading-pd-chip', '인생책')
    await tap('.reading-add .reading-pd-new-shelf')
    await until('Boolean(document.querySelector(".reading-add .reading-pd-new-shelf-form input"))')
    await setValue('.reading-add .reading-pd-new-shelf-form input', '추가책장')
    await evaluate('document.querySelector(".reading-add .reading-pd-new-shelf-form input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))')
    const made = await until('[...document.querySelectorAll(".reading-add-group .reading-pd-chip")].some((b) => b.textContent.includes("추가책장") && b.getAttribute("aria-pressed") === "true")')
    const chips = await evaluate('[...new Set([...document.querySelectorAll(".reading-add-group .reading-pd-chip, .reading-add-group .reading-pd-new-shelf")].map((b) => Math.round(b.getBoundingClientRect().height)))].join(",")')
    await shot('reading-add-confirm')
    await tap('.reading-add-foot .btn')
    await until('!document.querySelector("[data-mobile-sheet]")')
    const added = await store('(() => { const b = d.books.find((x) => x.book.external_id === "g1"); const s = d.shelves.find((x) => x.name === "추가책장"); return Boolean(b && s) && b.reading_status === "done" && ["sh1", s.id].every((id) => d.memberships.some((m) => m.user_book_id === b.id && m.shelf_id === id)) })()')
    const toast = await evaluate('document.body.textContent.includes("서재에 추가했어요.")')
    if (!skeleton || !backToResults || !made || chips !== '32' || !added || !toast) return JSON.stringify({ skeleton, backToResults, made, chips, added, toast })
    // Reopened: the recent search runs again, and the added book is greyed out and disabled.
    await open()
    const recent = await evaluate('[...document.querySelectorAll(".reading-add-recent .reading-pd-chip")].map((b) => b.textContent).join(",")')
    await clickText('.reading-add-recent .reading-pd-chip', '바람')
    await until('document.querySelectorAll(".reading-add-result").length === 2')
    const owned = await evaluate('(() => { const r = [...document.querySelectorAll(".reading-add-result")].find((b) => b.textContent.includes("바람이 머무는 곳")); return r.disabled + "|" + r.textContent.includes("서재에 있음") })()')
    // No results → 직접 입력하기 carries the query into the title; status chips apply.
    await search('없는책')
    await until('Boolean(document.querySelector(".reading-add-state .reading-pd-chip"))')
    await shot('reading-add-empty')
    await tap('.reading-add-state .reading-pd-chip')
    await until('Boolean(document.querySelector(".reading-add-manual"))')
    const prefilled = await evaluate('document.querySelector(".reading-add-manual input").value')
    await setValue('.reading-add-manual .reading-add-field:nth-of-type(2) input', '직접 저자')
    await clickText('.reading-add-group .reading-pd-chip', '읽는 중')
    await shot('reading-add-manual')
    await evaluate('document.querySelector(".reading-add-manual").requestSubmit()')
    await until('!document.querySelector("[data-mobile-sheet]")')
    const manual = await store('(() => { const b = d.books.find((x) => x.book.title === "없는책"); return b ? b.book.author + "|" + b.reading_status + "|" + Boolean(b.started_at) : "missing" })()')
    if (recent !== '바람' || owned !== 'true|true' || prefilled !== '없는책' || manual !== '직접 저자|reading|true') return JSON.stringify({ recent, owned, prefilled, manual })
    return 'ok'
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
