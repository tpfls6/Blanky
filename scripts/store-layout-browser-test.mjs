import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve(process.env.BLANKY_AUDIT_DIR ?? 'c:/Users/serin/Github/Blanky/.audit/runs', 'store-layout')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.STORE_LAYOUT_TEST_URL ?? 'http://127.0.0.1:5207'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-store-layout-test-'))

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
  for (let i = 0; i < 100; i++) {
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

async function finish(ok, extra) {
  const payload = { started, ended: new Date().toISOString(), ok, log: logLines, errors, extra: extra ?? null, serverTail: serverOutput.slice(-1500) }
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify(payload, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
}

// Seeds `count` user-made themes and templates through the app's own modules.
async function seed(count) {
  await evaluate(`(async () => {
    const owner = ${q(owner)}
    const { BUILTIN_THEMES } = await import('/packages/types/src/theme.ts')
    const { officialListings } = await import('/src/features/marketplace/official.ts')
    const names = ['노을 테마', '숲 테마', '바다 테마']
    const themes = names.slice(0, ${count}).map((name, index) => ({ ...structuredClone(BUILTIN_THEMES[index + 1]), id: 'mine-theme-' + index, name, creatorId: owner, creatorName: 'Test', visibility: index ? 'private' : 'public', description: name + ' 설명' }))
    localStorage.setItem('blanky.themes.' + owner, JSON.stringify({ themes, installed: [], active: null }))
    const base = officialListings()
    const listings = ['운동 기록 공유', '영화 노트 공유', '여행 계획 공유'].slice(0, ${count}).map((name, index) => ({ ...structuredClone(base[index % base.length]), id: 'mine-template-' + index, name, creatorId: owner, creatorName: 'Test', status: index ? 'unlisted' : 'published' }))
    localStorage.setItem('blanky.templates.' + owner, JSON.stringify({ listings, installed: [], favorites: [] }))
  })()`)
}
const box = (selector) => evaluate(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } })()`)
// Desktop: the text column sits left of the preview. Mobile: the preview stacks below the text.
async function checkSplit(label, mobile) {
  await wait('document.querySelector(".store-split > div:first-child") && document.querySelector(".store-split-preview")', label + ' split')
  const text = await box('.store-split > div:first-child')
  const preview = await box('.store-split-preview')
  const width = await evaluate('document.documentElement.clientWidth')
  const scroll = await evaluate('document.documentElement.scrollWidth')
  if (mobile) assert.ok(preview.top >= text.bottom - 1, label + ' mobile stacks preview below text')
  else assert.ok(text.right <= preview.left, label + ' desktop text left of preview')
  assert.ok(text.left >= 16 && preview.right <= width - 16, label + ' keeps side gutters ' + JSON.stringify({ text, preview, width }))
  assert.ok(scroll <= width + 1, label + ' no horizontal scroll (' + scroll + ' > ' + width + ')')
  log(label + (mobile ? ' mobile' : ' desktop') + ' split ok')
}
async function viewport(mobile) {
  await send('Emulation.setDeviceMetricsOverride', mobile ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } : { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
}
const click = (text) => evaluate(`(() => { const el = [...document.querySelectorAll('button,a')].find(b => b.textContent.trim() === ${q(text)}); el?.click(); return Boolean(el) })()`)

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await viewport(false)
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + (() => {
      if (!location.hostname || localStorage.getItem('store-layout-seeded')) return
      const owner = '11111111-1111-4111-8111-111111111111'
      localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: owner, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
      localStorage.setItem('blanky.session.v1', owner)
      localStorage.setItem('blanky.library.' + owner, JSON.stringify({ categories: [], items: [], settings: { locale: 'ko', customTemplatesGuideSeen: true, onboardingDone: true, onboardingPages: ['store'] }, customPages: [], pageTemplates: [], recordTypes: [], records: [] }))
      localStorage.setItem('store-layout-seeded', '1')
    }).toString() + ')()',
  })
  await navigate(base + '/store')
  await wait('document.querySelector(".store-head h1")?.textContent === "스토어"', 'store')

  for (const count of [0, 1, 3]) {
    await seed(count)
    await navigate(base + '/store')
    await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "내 테마")', 'my themes button')
    assert.ok(await click('내 테마'))
    await wait('location.search.includes("view=mine")', 'mine view')
    assert.equal(await evaluate('location.pathname'), '/store', 'my themes stays in store')
    if (!count) {
      await wait('document.querySelector(".store-state")?.textContent.includes("아직 등록한 테마가 없습니다.")', 'empty themes')
      log('themes 0: empty message in place')
      await shot('themes-0')
    } else {
      await wait('document.querySelectorAll("[data-testid=my-themes] .store-list-item").length === ' + count, 'theme list ' + count)
      await wait('document.querySelector(".store-split-preview .theme-preview-frame")', 'theme preview')
      if (count > 1) {
        await evaluate('document.querySelectorAll("[data-testid=my-themes] .store-list-item")[2].click()')
        await wait('document.querySelector("[data-testid=my-themes] h2")?.textContent === "바다 테마"', 'theme selection')
        assert.equal(await evaluate('location.pathname'), '/store', 'selection stays in store')
      }
      await checkSplit('my themes ' + count, false)
      log('themes ' + count + ': list + preview in place')
      await shot('themes-' + count)
    }

    await navigate(base + '/store?tab=templates')
    await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "내 템플릿")', 'my templates button')
    assert.ok(await click('내 템플릿'))
    await wait('location.search.includes("view=mine")', 'template mine view')
    assert.equal(await evaluate('location.pathname'), '/store', 'my templates stays in store')
    if (!count) {
      await wait('document.querySelector(".store-state")?.textContent.includes("아직 등록한 템플릿이 없습니다.")', 'empty templates')
      log('templates 0: empty message in place')
      await shot('templates-0')
    } else {
      await wait('document.querySelectorAll("[data-testid=my-templates] .store-list-item").length === ' + count, 'template list ' + count)
      if (count > 1) {
        await evaluate('document.querySelectorAll("[data-testid=my-templates] .store-list-item")[1].click()')
        await wait('document.querySelector("[data-testid=my-templates] h2")?.textContent === "영화 노트 공유"', 'template selection')
        await wait('document.querySelector("[data-testid=my-templates] .store-meta")?.textContent.includes("비공개")', 'status label')
      }
      await checkSplit('my templates ' + count, false)
      log('templates ' + count + ': list + preview in place')
      await shot('templates-' + count)
    }
  }

  // S1 browsing. Desktop: one header line, underline tabs, chips, small sort dropdown, 4 columns.
  await viewport(false)
  await navigate(base + '/store')
  await wait('document.querySelectorAll(".theme-grid .store-card").length >= 4', 'theme cards')
  assert.equal(await evaluate('document.querySelector(".store-head h1").textContent'), '스토어')
  assert.equal(await evaluate('document.querySelector(".store-tabs [aria-current=page]").textContent'), '테마')
  assert.equal(await evaluate('new Set([...document.querySelectorAll(".theme-grid .store-card")].slice(0, 4).map(c => Math.round(c.getBoundingClientRect().top))).size'), 1, 'four cards in one desktop row')
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".store-chips button")].map(b => b.textContent)'), ['전체', '무료', '유료', '설치함'])
  // Featured row: up to four equal cards in one row, none stretched or cut off; no "평점 없음" filler on cards.
  const feat = await evaluate('[...document.querySelectorAll(".store-fcard")].filter(c => c.getClientRects().length).map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.top), r.right <= innerWidth] })')
  assert.ok(feat.length >= 2 && feat.length <= 4 && feat.every(([w, h, top, inside]) => w === feat[0][0] && h === feat[0][1] && top === feat[0][2] && inside), JSON.stringify(feat))
  assert.equal(await evaluate('[...document.querySelectorAll(".store-card-meta")].some(m => m.textContent.includes("평점 없음"))'), false)
  // Sort: opens right under its button, arrows move, Esc closes back to the button, a pick reorders, outside closes.
  await evaluate('document.querySelector(".store-sort").click()')
  await wait('document.querySelector("[role=listbox]")', 'sort menu')
  const menu = await evaluate('(() => { const b = document.querySelector(".store-sort").getBoundingClientRect(), m = document.querySelector("[role=listbox]").getBoundingClientRect(); return { gap: m.top - b.bottom, right: Math.abs(m.right - b.right) < 12, items: [...document.querySelectorAll("[role=option]")].map(o => o.textContent + (o.getAttribute("aria-selected") === "true" ? "*" : "")), focus: document.activeElement.textContent, heights: [...document.querySelectorAll("[role=option]")].map(o => o.getBoundingClientRect().height) } })()')
  assert.ok(menu.gap > -8 && menu.gap < 8 && menu.right, JSON.stringify(menu))
  assert.deepEqual(menu.items, ['추천순*', '인기순', '최신순'])
  assert.equal(menu.focus, '추천순')
  assert.ok(menu.heights.every(h => h >= 44), 'sort options 44px')
  await evaluate('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))')
  assert.equal(await evaluate('document.activeElement.textContent'), '인기순')
  await evaluate('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))')
  await wait('!document.querySelector("[role=listbox]") && document.activeElement?.classList.contains("store-sort")', 'esc closes to button')
  await evaluate('document.querySelector(".store-sort").click()')
  await wait('document.querySelector("[role=listbox]")', 'sort menu again')
  await evaluate('[...document.querySelectorAll("[role=option]")].find(o => o.textContent === "최신순").click()')
  await wait('!document.querySelector("[role=listbox]") && document.querySelector(".store-sort").textContent === "최신순"', 'picked newest')
  await evaluate('document.querySelector(".store-sort").click()')
  await wait('document.querySelector("[role=listbox]")', 'sort menu third')
  await evaluate('document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))')
  await wait('!document.querySelector("[role=listbox]")', 'outside closes')
  await shot('s1-themes-desktop')
  log('S1 desktop: header, tabs, chips, sort dropdown, 4 columns')

  // Phone: own app bar, 🔍 turns into a field (results as rows) and 취소 clears it, ⋯ sheet, chips in one line, 2 columns.
  await viewport(true)
  await navigate(base + '/store')
  await wait('document.querySelector(".store-bar") && document.querySelectorAll(".theme-grid .store-card").length >= 2', 'phone store')
  assert.equal(await evaluate('Boolean(document.querySelector(".store-head"))'), false)
  assert.equal(await evaluate('new Set([...document.querySelectorAll(".theme-grid .store-card")].slice(0, 2).map(c => Math.round(c.getBoundingClientRect().top))).size'), 1, 'two cards per phone row')
  assert.equal(await evaluate('new Set([...document.querySelectorAll(".store-chips button")].map(b => Math.round(b.getBoundingClientRect().top))).size'), 1, 'chips stay on one line')
  assert.ok(await evaluate('[...document.querySelectorAll(".store-bar button, .store-tabs a, .store-chips button, .store-sort")].every(el => el.getBoundingClientRect().height >= 44)'), 'phone controls 44px')
  assert.ok(await evaluate('document.querySelectorAll(".store-feat .store-fcard").length >= 2'), 'featured row')
  await evaluate('document.querySelector(".store-bar [data-tour=store-search]").click()')
  await wait('document.querySelector(".store-bar input")', 'search field')
  await evaluate('(() => { const input = document.querySelector(".store-bar input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "노을"); input.dispatchEvent(new Event("input", { bubbles: true })) })()')
  await wait('document.querySelectorAll(".store-results li").length === 1', 'search rows')
  assert.match(await evaluate('document.querySelector(".store-results li").innerText'), /노을 테마/)
  await shot('s1-search-mobile')
  await click('취소')
  await wait('!document.querySelector(".store-bar input") && !document.querySelector(".store-results") && document.querySelector(".theme-grid")', 'search cancelled')
  await evaluate('document.querySelector(".store-bar [aria-haspopup=dialog]").click()')
  await wait('document.querySelector("dialog[open].customization-sheet")', 'store sheet')
  assert.deepEqual(await evaluate('[...document.querySelectorAll("dialog[open] .more-row .more-rt")].map(r => r.firstChild.textContent)'), ['테마 만들기', '내가 등록한 테마', '설치한 테마 관리'])
  await evaluate('[...document.querySelectorAll("dialog[open] .more-row")][1].click()')
  await wait('location.search.includes("view=mine") && !document.querySelector("dialog[open]") && document.querySelector("[data-testid=my-themes]")', 'mine from sheet')
  await evaluate('document.querySelector(".store-bar .more-ib").click()')
  await wait('!location.search.includes("view=mine") && document.querySelector(".theme-grid") && !document.querySelector("[data-testid=my-themes]")', 'back leaves mine view')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'phone store fits')
  await shot('s1-themes-mobile')
  // Templates: categories + 즐겨찾기 · 설치함 chips, and ♡ on a card toggles the favorite in place.
  await navigate(base + '/store?tab=templates')
  await wait('document.querySelectorAll(".theme-grid .store-tcard").length >= 2', 'template cards')
  const chips = await evaluate('[...document.querySelectorAll(".store-chips button")].map(b => b.textContent)')
  assert.equal(chips[0], '전체'); assert.deepEqual(chips.slice(-2), ['즐겨찾기', '설치함'])
  const fav = '.theme-grid .store-tcard .store-fav'
  assert.equal(await evaluate('document.querySelector(' + q(fav) + ').getAttribute("aria-pressed")'), 'false')
  await evaluate('document.querySelector(' + q(fav) + ').click()')
  await wait('document.querySelector(' + q(fav) + ').getAttribute("aria-pressed") === "true" && location.pathname === "/store"', 'favorite toggled in place')
  await evaluate('[...document.querySelectorAll(".store-chips button")].find(b => b.textContent === "즐겨찾기").click()')
  await wait('document.querySelectorAll(".theme-grid .store-tcard").length === 1', 'favorites chip')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'phone templates fit')
  await shot('s1-templates-mobile')
  await evaluate('document.querySelector(' + q(fav) + ').click()')
  await wait('document.querySelectorAll(".theme-grid .store-tcard").length === 0', 'unfavorited')
  log('S1 phone: app bar search/cancel, sheet, chips, 2 columns, template favorite')

  // The store guide still finds both targets (tabs, then search: the field on desktop, 🔍 on phones).
  for (const mobile of [false, true]) {
    await viewport(mobile)
    await navigate(base + '/store?tour=1')
    await wait('document.querySelector("[data-page-tour]")?.textContent.includes("1 / 2")', 'store tour step 1')
    await evaluate('document.querySelector(".spotlight-actions .btn-primary").click()')
    await wait('document.querySelector("[data-page-tour]")?.textContent.includes("2 / 2")', 'store tour step 2')
    assert.ok(await evaluate('(() => { const p = document.querySelector("[data-page-tour]"); const target = [...document.querySelectorAll(p.dataset.tourTarget)].find(e => e.getClientRects().length); return Boolean(target) && target.matches("[data-tour=store-search]") })()'), 'store tour step 2 target ' + (mobile ? 'mobile' : 'desktop'))
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))')
  }
  log('store guide reaches tabs and search on desktop and phone')

  // Detail screens and the in-store panel keep text left, preview right; stacked on mobile.
  for (const mobile of [false, true]) {
    await viewport(mobile)
    const tag = mobile ? 'mobile' : 'desktop'
    await navigate(base + '/store/themes/mine-theme-0')
    await wait('document.querySelector(".store-split h1")?.textContent === "노을 테마"', 'theme detail')
    await wait('document.querySelector(".store-split-preview .theme-preview-frame")', 'theme detail preview')
    await checkSplit('theme detail', mobile)
    await shot('theme-detail-' + tag)
    await navigate(base + '/store/templates/mine-template-0')
    await wait('[...document.querySelectorAll("button")].some(b => b.textContent.includes("내 페이지에 추가"))', 'template detail')
    await checkSplit('template detail', mobile)
    await shot('template-detail-' + tag)
    await navigate(base + '/store?view=mine')
    await wait('document.querySelector("[data-testid=my-themes]")', 'my themes ' + tag)
    await checkSplit('my themes', mobile)
    await shot('my-themes-' + tag)
  }
  // S2/S3 details on phones: hero under a floating bar, creator row, stats, pinned action bar that never covers content.
  await viewport(true)
  await navigate(base + '/store/themes/mine-theme-0')
  await wait('document.querySelector(".store-detail-bar-over") && document.querySelector(".store-hero") && document.querySelector(".store-actionbar")', 'phone theme detail')
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".store-actionbar button")].map(b => b.textContent)'), ['미리보기', '적용하기'], 'owned theme: preview + apply')
  assert.ok(await evaluate('[...document.querySelectorAll(".store-detail-bar button, .store-actionbar button, .store-creator a")].every(el => { const r = el.getBoundingClientRect(); return r.height >= 40 && r.width >= 40 })'), 'detail targets')
  assert.ok(await evaluate('document.querySelector(".store-creator a").getAttribute("href").startsWith("/creator/")'))
  assert.equal(await evaluate('[...document.querySelectorAll(".store-stats dt")].some(d => d.textContent.includes("평점"))'), false, 'no rating cell without ratings')
  await evaluate('document.querySelector("main").scrollTop = 1e6'); await pause(150)
  const cover = await evaluate('(() => { const bar = document.querySelector(".store-actionbar").getBoundingClientRect(); const last = document.querySelector(".store-split").lastElementChild.getBoundingClientRect(); return { last: last.bottom, bar: bar.top } })()')
  assert.ok(cover.last <= cover.bar + 1, 'action bar covers the end ' + JSON.stringify(cover))
  await shot('s2-theme-mobile')
  await evaluate('document.querySelector(".store-detail-bar [aria-haspopup=dialog]").click()')
  await wait('document.querySelector("dialog[open].customization-sheet")', 'theme sheet')
  assert.deepEqual(await evaluate('[...document.querySelectorAll("dialog[open] .more-rt")].map(r => r.firstChild.textContent)'), ['링크 복사', '파일로 내보내기', '내 테마에서 관리'])
  await evaluate('document.querySelector("dialog[open] .customization-sheet-header button").click()')
  await wait('!document.querySelector("dialog[open]")', 'theme sheet closed')
  // A theme not owned yet reads 무료 설치.
  await navigate(base + '/store/themes/' + await evaluate('(async () => (await import("/packages/types/src/theme.ts")).BUILTIN_THEMES[1].id)()'))
  await wait('document.querySelector(".store-actionbar .btn-primary")', 'builtin detail')
  log('S2 phone theme detail: ' + await evaluate('document.querySelector(".store-actionbar .btn-primary").textContent'))

  await navigate(base + '/store/templates/mine-template-0')
  await wait('document.querySelector(".store-detail-bar") && document.querySelector(".store-actionbar .store-fav-btn")', 'phone template detail')
  assert.match(await evaluate('document.querySelector(".store-actionbar .btn-primary").textContent'), /내 페이지/)
  await evaluate('document.querySelector(".store-actionbar .store-fav-btn").click()')
  await wait('document.querySelector(".store-actionbar .store-fav-btn").getAttribute("aria-pressed") === "true"', 'detail favorite')
  await evaluate('document.querySelector(".store-actionbar .store-fav-btn").click()')
  await wait('document.querySelector(".store-actionbar .store-fav-btn").getAttribute("aria-pressed") === "false"', 'detail unfavorite')
  // Report: a reason sheet instead of window.prompt; 신고하기 waits for a reason.
  await evaluate('document.querySelector(".store-detail-bar [aria-haspopup=dialog]").click()')
  await wait('document.querySelector("dialog[open].customization-sheet")', 'template sheet')
  assert.deepEqual(await evaluate('[...document.querySelectorAll("dialog[open] .more-rt")].map(r => r.firstChild.textContent)'), ['링크 복사', '신고'])
  await evaluate('[...document.querySelectorAll("dialog[open] .more-row")].find(b => b.textContent === "신고").click()')
  await wait('document.querySelector("dialog[open] [role=radiogroup]")', 'report sheet')
  assert.equal(await evaluate('document.querySelector("dialog[open] .store-report-submit").disabled'), true)
  await evaluate('[...document.querySelectorAll("dialog[open] [role=radio]")].find(b => b.textContent === "작동하지 않음").click()')
  await evaluate('document.querySelector("dialog[open] .store-report-submit").click()')
  await wait('!document.querySelector("dialog[open]") && document.querySelector(".store-toast[data-on]")?.textContent.includes("신고를 접수했습니다.")', 'reported toast')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'template detail fits')
  await shot('s3-template-mobile')
  log('S2/S3 phone details: hero, creator, stats, action bar, sheets, report reasons')

  // Desktop keeps two columns with the buttons at the top of the info column.
  await viewport(false)
  await navigate(base + '/store/templates/mine-template-0')
  await wait('document.querySelector(".store-detail-actions")', 'desktop template actions')
  assert.ok(await evaluate('document.querySelector(".store-detail-actions").getBoundingClientRect().top < document.querySelector(".store-creator").getBoundingClientRect().top'), 'actions above creator')
  assert.equal(await evaluate('Boolean(document.querySelector(".store-actionbar"))'), false)

  await viewport(false)
  await navigate(base + '/store/themes/missing-theme')
  await wait('document.querySelector("[role=alert]")?.textContent.includes("테마를 찾을 수 없습니다.")', 'missing theme state')
  log('missing theme shows error state')

  // Publish form: settings left, preview of the chosen page right.
  await navigate(base + '/store/templates/mine-template-0')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.includes("내 페이지에 추가"))', 'install button')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("내 페이지에 추가")).click()')
  // A first install stays on the detail and offers 열기 in a toast.
  await wait('document.querySelector(".store-toast[data-on] a")?.textContent === "열기"', 'install toast')
  await evaluate('document.querySelector(".store-toast[data-on] a").click()')
  await wait('location.pathname.startsWith("/pages/")', 'installed page')
  for (const mobile of [false, true]) {
    await viewport(mobile)
    await navigate(base + '/store/templates/publish')
    await wait('document.querySelector(".store-split h1")?.textContent.includes("스토어에 공유")', 'publish form')
    await checkSplit('publish', mobile)
    await shot('publish-' + (mobile ? 'mobile' : 'desktop'))
  }
  await viewport(false)

  await finish(true)
  assert.equal(errors.length, 0, errors.join('\n'))
  log('PASS store layout and my store in place')
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
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-store-layout-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
