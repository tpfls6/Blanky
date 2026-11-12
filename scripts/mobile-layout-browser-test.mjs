// Mobile layout audit: every main route at phone and desktop widths.
// Fails when content is wider than the viewport (horizontal page scroll or
// content clipped by the layout), and records undersized touch targets.
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'mobile-layout')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5221'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-mobile-test-'))

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
async function navigate(url) {
  const loaded = new Promise((resolvePromise) => { loadResolve = resolvePromise })
  const result = await send('Page.navigate', { url })
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(evidenceDir, name + '.png'), Buffer.from(result.data, 'base64'))
}

const ROUTES = [
  ['home', '/'], ['schedule', '/schedule'], ['recurring', '/schedule/recurring'], ['activity', '/activity'],
  ['diary', '/diary'], ['reading', '/reading'], ['memo', '/memo'], ['custom', '/custom'],
  ['custom-themes', '/custom?tab=themes'], ['custom-page', '/pages/mobile-page'], ['store', '/store'],
  ['store-templates', '/store?tab=templates'], ['theme-editor', '/customize/theme'], ['trash', '/trash'],
  ['settings-general', '/settings/general'], ['settings-account', '/settings/account'], ['settings-ai', '/settings/ai'],
  ['settings-ai-input', '/settings/ai?tab=input'], ['settings-calendar', '/settings/calendar'],
  ['settings-google', '/settings/calendar?tab=google'], ['settings-categories', '/settings/categories'],
  ['guide', '/guide'], ['welcome', '/welcome'], ['login', '/login'], ['signup', '/signup'],
]
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812, mobile: true },
  { name: 'phone-small', width: 320, height: 640, mobile: true },
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
]
const SIGNED_OUT = new Set(['welcome', 'login', 'signup'])

// Runs in the page. Elements may sit outside the viewport only inside an
// intentional horizontal scroller, or inside a clipping box that itself fits.
const audit = `(() => {
  const vw = document.documentElement.clientWidth
  const layoutClip = (el) => el.tagName === 'MAIN' || el.classList.contains('theme-app-layout')
  const pageScroll = document.scrollingElement.scrollWidth - vw
  const main = document.querySelector('main')
  const offenders = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1) continue
    if (el.closest('details:not([open]) > :not(summary)')) continue
    if (r.right <= vw + 1 && r.left >= -1) continue
    const own = getComputedStyle(el)
    if (own.position === 'fixed' || own.visibility === 'hidden') continue
    let p = el.parentElement, ok = false
    while (p && p !== document.body) {
      const s = getComputedStyle(p)
      if (/(auto|scroll)/.test(s.overflowX) || (/(hidden|clip)/.test(s.overflowX) && !layoutClip(p))) {
        const pr = p.getBoundingClientRect()
        if (pr.right <= vw + 1 && pr.left >= -1) { ok = true; break }
      }
      if (s.position === 'fixed') { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 1 && pr.left >= -1) { ok = true; break } }
      p = p.parentElement
    }
    if (ok) continue
    if (offenders.some((o) => o.node.contains(el))) continue
    offenders.push({ node: el, tag: el.tagName.toLowerCase(), cls: String(el.className?.baseVal ?? el.className).slice(0, 90), text: (el.textContent || '').trim().slice(0, 40), left: Math.round(r.left), right: Math.round(r.right) })
  }
  const small = [...document.querySelectorAll('main button, main a[href], main input, main select, nav a, nav button')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(el).visibility !== 'hidden' })
    .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30))
  const inputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), textarea, select')]
    .filter((el) => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16).length
  return { vw, pageScroll, mainScroll: main ? main.scrollWidth - main.clientWidth : 0, offenders: offenders.slice(0, 8).map(({ node, ...rest }) => rest), small: small.slice(0, 10), smallCount: small.length, zoomInputs: inputs }
})()`

const owner = '11111111-1111-4111-8111-111111111111'
const failures = []
const report = []
try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + ((ownerId) => {
      if (!location.hostname || location.pathname === '/welcome' || location.pathname === '/login' || location.pathname === '/signup') { localStorage.removeItem('blanky.session.v1'); return }
      if (localStorage.getItem('mobile-test-seeded')) { localStorage.setItem('blanky.session.v1', ownerId); return }
      const today = new Date().toLocaleDateString('en-CA')
      const common = { description: '', date: today, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'none', categoryId: 'school', startTime: null, endTime: null, duration: null }
      localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: ownerId, name: 'Mobile', nickname: 'Mobile', email: 'mobile@example.test', password: 'test-only', avatar: null }]))
      localStorage.setItem('blanky.session.v1', ownerId)
      localStorage.setItem('blanky.library.' + ownerId, JSON.stringify({
        categories: [{ id: 'school', name: '학교 수업과 과제 관리용 아주 긴 카테고리 이름', parentId: null, color: '#7157db' }],
        items: [
          { ...common, id: 'e1', kind: 'event', title: '데이터베이스 수업 — 아주 긴 제목이 모바일에서 어떻게 보이는지 확인', startTime: '09:00', endTime: '10:30', duration: 90 },
          { ...common, id: 'e2', kind: 'event', title: '팀 회의', startTime: '14:00', endTime: '15:00', duration: 60 },
          { ...common, id: 't1', kind: 'task', title: '과제 제출 준비하기', dueDate: today, duration: 30 },
        ],
        settings: { locale: 'ko', onboardingDone: true, onboardingPages: ['custom', 'diary', 'reading', 'memo'], customTemplatesGuideSeen: true },
        customPages: [{ id: 'mobile-page', name: '모바일 페이지', icon: 'Calendar', description: '', sort: 1, schemaVersion: 1, blocks: [{ id: 'w', type: 'widget-calendar', props: {} }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
        pageTemplates: [], recordTypes: [], records: [],
      }))
      localStorage.setItem('mobile-test-seeded', '1')
    }).toString() + ')(' + JSON.stringify(owner) + ')',
  })
  const only = process.env.MOBILE_TEST_ROUTES?.split(',')
  for (const viewport of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.mobile ? 2 : 1, mobile: viewport.mobile })
    await send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile, maxTouchPoints: viewport.mobile ? 5 : 1 })
    for (const [name, path] of ROUTES) {
      if (only && !only.includes(name)) continue
      const errorCount = errors.length
      await navigate(base + path)
      await pause(SIGNED_OUT.has(name) ? 600 : 900)
      const result = await evaluate(audit)
      const page = await evaluate('location.pathname + location.search')
      const bad = result.pageScroll > 1 || result.mainScroll > 1 || result.offenders.length > 0
      const pageErrors = errors.slice(errorCount)
      report.push({ viewport: viewport.name, name, page, ...result, errors: pageErrors })
      log(`${bad ? 'FAIL' : 'ok  '} ${viewport.name} ${name} (${page}) pageScroll=${result.pageScroll} mainScroll=${result.mainScroll} offenders=${result.offenders.length} smallTargets=${result.smallCount} zoomInputs=${result.zoomInputs}`)
      for (const o of result.offenders) log(`       ${o.tag}.${o.cls} [${o.left}..${o.right}] "${o.text}"`)
      if (bad) failures.push(`${viewport.name}/${name}`)
      if (pageErrors.length) failures.push(`${viewport.name}/${name}: ${pageErrors[0]}`)
      if (viewport.name !== 'phone-small') await shot(`${viewport.name}-${name}`)
    }
  }

  // Phone interactions: sheets, dialogs and popovers must open inside the screen.
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const fits = (selector) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 ? 'ok' : JSON.stringify({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }) })()`
  async function scenario(name, run) {
    try { const outcome = await run(); log(`${outcome === 'ok' ? 'ok  ' : 'FAIL'} scenario ${name}: ${outcome}`); if (outcome !== 'ok') failures.push('scenario/' + name) } catch (error) { log(`FAIL scenario ${name}: ${error.message}`); failures.push('scenario/' + name) }
  }
  await scenario('more-page', async () => {
    await navigate(base + '/')
    await pause(700)
    const barCount = await evaluate('document.querySelectorAll(".mobile-nav > ul > li").length')
    if (barCount !== 5) return 'bar items ' + barCount
    await evaluate('document.querySelector("[data-mobile-tab=more]").click()')
    for (let i = 0; i < 50 && !(await evaluate('Boolean(document.querySelector("[data-more-page]"))')); i++) await pause(100)
    const fit = await evaluate('document.documentElement.scrollWidth <= innerWidth + 1 ? "ok" : "menu overflows"')
    await shot('scenario-more-page')
    if (fit !== 'ok') return fit
    await evaluate('document.querySelector("[data-more-link=settings]").click()')
    await pause(700)
    const state = await evaluate('location.pathname + "|" + Boolean(document.querySelector("dialog[open]")) + "|" + document.querySelector("[data-mobile-tab=more]").getAttribute("aria-current")')
    return state === '/settings/general|false|page' ? 'ok' : state
  })
  await scenario('confirm-dialog', async () => {
    await navigate(base + '/settings/categories')
    await pause(900)
    const opened = await evaluate(`(() => { const el = [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === '삭제'); if (!el) return false; el.click(); return true })()`)
    if (!opened) return 'delete button missing'
    await pause(400)
    const fit = await evaluate(fits('dialog[open], [role=dialog]'))
    await shot('scenario-confirm-dialog')
    return fit
  })
  await scenario('color-popover', async () => {
    await navigate(base + '/customize/theme')
    await pause(900)
    await evaluate('(() => { const d = document.querySelectorAll("details.color-choice"); d[d.length - 1].open = true })()')
    await pause(200)
    const fit = await evaluate(fits('details.color-choice[open] .color-popover'))
    await shot('scenario-color-popover')
    return fit
  })
  await scenario('touch-area', async () => {
    await navigate(base + '/schedule')
    await pause(900)
    if (!(await evaluate('matchMedia("(pointer: coarse)").matches'))) return 'pointer is not coarse'
    // A tap 8px outside the 16px task checkbox still reaches it.
    return evaluate(`(() => { const box = document.querySelector('main button[role=checkbox]'); if (!box) return 'checkbox missing'; box.scrollIntoView({ block: 'center' }); const r = box.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom + 8); return hit?.closest('button[role=checkbox]') === box ? 'ok' : 'hit ' + (hit?.tagName ?? 'none') })()`)
  })
  await scenario('home-input-font', async () => {
    await navigate(base + '/')
    await pause(700)
    const size = await evaluate('parseFloat(getComputedStyle(document.querySelector("main textarea")).fontSize)')
    return size >= 16 ? 'ok' : 'textarea ' + size + 'px (iOS relies on maximum-scale)'
  })
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify({ started, ended: new Date().toISOString(), ok: failures.length === 0, failures, report }, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
  if (failures.length) { console.error('FAILED: ' + failures.join(', ')); process.exitCode = 1 } else log('all routes fit their viewport')
} finally {
  ws.close()
  browser.kill()
  server.kill()
}
