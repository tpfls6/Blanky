import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'customization')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.CUSTOMIZATION_TEST_URL ?? 'http://127.0.0.1:5208'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')
const { mkdtemp } = await import('node:fs/promises')
const profile = await mkdtemp(join(tmpdir(), 'blanky-customization-test-'))

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
const outDir = JSON.stringify(join(profile, 'dist'))
const server = spawn(process.execPath, ['--input-type=module', '-e', `
  import { build, preview } from 'vite'
  const config = { build: { outDir: ${outDir}, emptyOutDir: true } }
  await build(config)
  await preview({ ...config, preview: { host: '127.0.0.1', port: ${new URL(base).port}, strictPort: true } })
`], { env: { ...process.env, NODE_ENV: 'production', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', (data) => { serverOutput += data })
server.stderr.on('data', (data) => { serverOutput += data })
const serverStartAttempts = 600
for (let i = 0; i < serverStartAttempts; i++) {
  try { if ((await fetch(base)).ok) break } catch {}
  if (server.exitCode !== null || i === serverStartAttempts - 1) {
    server.kill()
    browser.kill()
    await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
    throw new Error('Vite failed to start: ' + serverOutput)
  }
  await new Promise((r) => setTimeout(r, 100))
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
  for (let i = 0; i < 80; i++) {
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
const library = 'blanky.library.' + owner

async function finish(ok, extra) {
  const payload = { started, ended: new Date().toISOString(), ok, log: logLines, errors, extra: extra ?? null, serverTail: serverOutput.slice(-1500) }
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify(payload, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + (() => {
      if (!location.hostname || localStorage.getItem('customization-test-seeded')) return
      const owner = '11111111-1111-4111-8111-111111111111'
      localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: owner, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
      localStorage.setItem('blanky.session.v1', owner)
      localStorage.setItem('blanky.library.' + owner, JSON.stringify({
        categories: [],
        items: [],
        settings: { locale: 'ko', customTemplatesGuideSeen: true, onboardingDone: true, onboardingPages: ['home', 'diary', 'reading', 'memo', 'store', 'custom', 'settings'] },
        customPages: [],
        pageTemplates: [],
        recordTypes: [],
        records: [],
      }))
      localStorage.setItem('customization-test-seeded', '1')
    }).toString() + ')()',
  })

  const heading = text => `document.querySelector('main h1')?.textContent === ${q(text)}`
  const clickMenu = text => evaluate(`[...document.querySelectorAll('main nav a')].find(a => a.textContent === ${q(text)}).click()`)
  const themeState = () => evaluate(`localStorage.getItem('blanky.themes.${owner}')`)
  await navigate(base + '/custom')
  await wait(heading('커스텀 템플릿'), 'template hub')
  assert.equal(await evaluate(`document.querySelectorAll('#app-sidebar a[href="/settings/themes"]').length`), 0)
  assert.equal(await evaluate(`document.querySelector('#app-sidebar a[href="/custom"]').textContent.trim()`), '커스터마이징')
  await wait(`!!document.querySelector('input[type=file]')`, 'template import input')
  const uploadTemplate = contents => evaluate(`(() => {
    const input = document.querySelector('input[type=file]')
    const transfer = new DataTransfer()
    transfer.items.add(new File([${q(contents)}], 'Customization.blankytpl', { type: 'application/json' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await uploadTemplate('<html>invalid template</html>')
  await wait(`!!document.querySelector('[role=alert]')?.textContent`, 'invalid template rejected')
  await uploadTemplate(JSON.stringify({ formatVersion: 1, kind: 'blanky.template-package', id: 'customization-diary', name: '커스터마이징 검증 일기', description: '', author: 'tester', version: '1.0.0', pageType: 'diary', icon: 'BookOpen', fieldLabels: { mood: '오늘의 컨디션' } }))
  await wait(`!!document.querySelector('.theme-import-review')`, 'template import review')
  await evaluate(`[...document.querySelectorAll('.theme-import-review button')].find(b => b.textContent === '템플릿 추가').click()`)
  await wait(`[...document.querySelectorAll('main article')].some(el => el.textContent.includes('커스터마이징 검증 일기'))`, 'template installed')
  await navigate()
  await wait(`[...document.querySelectorAll('main article')].some(el => el.textContent.includes('커스터마이징 검증 일기'))`, 'template retained on refresh')
  await clickMenu('내 테마')
  await wait(heading('내 테마'), 'theme tab')
  await wait(`document.querySelectorAll('.customization-themes article').length === 4`, 'four builtins')
  assert.equal(await evaluate(`document.querySelector('main nav [aria-current="page"]').textContent`), '내 테마')
  assert.equal(await evaluate(`document.querySelector('#app-sidebar a[href="/custom"]').getAttribute('aria-current')`), 'page')
  assert.ok(await evaluate(`(() => { const r = document.querySelector('.customization-themes article .theme-more').getBoundingClientRect(); return r.width >= 40 && r.height >= 40 })()`), 'desktop card ⋯ is at least 40px')
  await shot('01-desktop-themes')
  await clickMenu('앱 레이아웃')
  await wait(heading('앱 레이아웃'), 'layout tab')
  await evaluate(`(() => { const el = document.querySelector('main select.w-24'); el.value = '24'; el.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await wait(`document.querySelector('[role=status]')?.textContent.includes('저장')`, 'layout saved')
  await evaluate('history.back()')
  await wait(heading('내 테마'), 'back to themes')
  await evaluate('history.back()')
  await wait(heading('커스텀 템플릿'), 'back to templates')
  assert.equal(await evaluate(`!!document.querySelector('main [role=tablist]')`), false)
  assert.ok(await evaluate(`[...document.querySelectorAll('main article')].some(el => el.textContent.includes('커스터마이징 검증 일기'))`), 'installed diary template listed without a basic tab')
  await clickMenu('앱 레이아웃')
  await wait(heading('앱 레이아웃'), 'layout restored')
  assert.equal(await evaluate(`document.querySelector('main select.w-24').value`), '24')
  await navigate()
  await wait(heading('앱 레이아웃'), 'refresh layout')
  assert.equal(await evaluate(`document.querySelector('main select.w-24').value`), '24')
  await navigate(base + '/settings/themes')
  await wait(heading('내 테마'), 'legacy redirect')
  assert.equal(await evaluate('location.pathname + location.search'), '/custom?tab=themes')
  await wait(`document.querySelectorAll('.customization-themes article').length === 4`, 'loaded themes')
  await evaluate(`document.querySelector('.customization-themes article button').click()`)
  await wait(`!!JSON.parse(localStorage.getItem('blanky.themes.${owner}')).active`, 'theme applied')
  const applied = await themeState()
  // The applied theme moves into the hero card, which holds the preview button; the other cards keep only 적용 + ⋯.
  assert.equal(await evaluate(`document.querySelectorAll('.customization-themes article').length`), 3, 'theme in use leaves the groups')
  await evaluate(`[...document.querySelectorAll('.customization-themes .theme-hero button')].find(b => b.textContent === '미리보기').click()`)
  await wait(`!!document.querySelector('.theme-preview-bar')`, 'preview active')
  assert.equal(await themeState(), applied, 'preview must not persist changes')
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '미리보기 종료').click()`)
  await wait(`!document.querySelector('.theme-preview-bar')`, 'preview ended')
  await navigate(base + '/custom?tab=themes')
  await wait(heading('내 테마'), 'theme refresh')
  assert.equal(await themeState(), applied)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  const mobileMenu = text => evaluate(`[...document.querySelectorAll('.customization-menu')].find(a => a.textContent.trim() === ${q(text)}).click()`)
  const openThemeActions = async () => {
    await evaluate('document.querySelector("[data-tour=add-theme]").click()')
    await wait(`document.querySelector(${q('dialog[open] a[href="/customize/theme"]')})`, 'mobile theme actions')
  }
  await wait('document.querySelector(".customization-menu")?.offsetHeight > 0 && document.querySelector(".customization-themes .add-fab")', 'mobile switcher')
  assert.ok(await evaluate('(() => { const widths = [...document.querySelectorAll(".customization-menu")].map(a => a.offsetWidth); return widths.length === 2 && Math.max(...widths) - Math.min(...widths) <= 1; })()'))
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await shot('02-mobile-themes')
  assert.ok(await evaluate('!!document.querySelector(".customization-themes .theme-hero") && document.querySelectorAll(".customization-themes .theme-row").length === 3'), 'mobile hero + thumbnail rows')
  // Scrolled to the end, the fixed + button must clear the last row's ⋯ and the 테마 끄기 card; touch targets stay ≥44px.
  const fabClear = await evaluate(`(() => {
    for (let el = document.querySelector('.customization-themes'); el; el = el.parentElement) el.scrollTop = el.scrollHeight
    scrollTo(0, document.documentElement.scrollHeight)
    const fab = document.querySelector('.customization-themes .add-fab').getBoundingClientRect()
    const rows = document.querySelectorAll('.customization-themes .theme-row')
    const off = [...document.querySelectorAll('.customization-themes button.more-row')].at(-1).getBoundingClientRect()
    const more = rows[rows.length - 1].querySelector('.theme-more').getBoundingClientRect()
    return [more, off].every(r => r.bottom <= fab.top || r.right <= fab.left)
  })()`)
  assert.ok(fabClear, 'add button clears the last row and the turn-off card at scroll end')
  assert.ok(await evaluate(`(() => {
    const box = el => { const r = el.getBoundingClientRect(), a = getComputedStyle(el, '::after'); return { w: r.width - parseFloat(a.left || 0) - parseFloat(a.right || 0), h: r.height - parseFloat(a.top || 0) - parseFloat(a.bottom || 0) } }
    const more = document.querySelector('.theme-row .theme-more').getBoundingClientRect()
    return more.width >= 44 && more.height >= 44 && [document.querySelector('.theme-pill'), document.querySelector('.theme-store-link')].every(el => { const b = box(el); return b.w >= 44 && b.h >= 44 })
  })()`), 'theme row touch targets are at least 44px')
  await evaluate('document.querySelector(".theme-row .theme-more").click()')
  await wait(`[...document.querySelectorAll('dialog[open] .more-row')].some(b => b.textContent === '적용하기')`, 'mobile theme action sheet')
  await shot('02a-mobile-theme-actions')
  await evaluate('document.querySelector("dialog[open] .icon-btn").click()')
  await wait('!document.querySelector("dialog[open]")', 'theme action sheet closed')
  // The hero card opens the same sheet without 적용하기, since that theme is already applied.
  assert.ok(await evaluate('(() => { const r = document.querySelector(".theme-hero .theme-more").getBoundingClientRect(); return r.width >= 44 && r.height >= 44 })()'), 'hero ⋯ is 44px')
  await evaluate('document.querySelector(".theme-hero .theme-more").click()')
  await wait(`[...document.querySelectorAll('dialog[open] .more-row')].some(b => b.textContent.startsWith('미리보기'))`, 'hero action sheet')
  assert.equal(await evaluate(`[...document.querySelectorAll('dialog[open] .more-row')].some(b => b.textContent === '적용하기')`), false, 'hero sheet hides apply')
  await evaluate('document.querySelector("dialog[open] .icon-btn").click()')
  await wait('!document.querySelector("dialog[open]")', 'hero action sheet closed')
  await openThemeActions()
  await evaluate('document.querySelector("dialog[open] button:not(.icon-btn)").click()')
  await wait('document.querySelector("dialog[open] input[type=file]")?.accept.includes(".blankytheme")', 'mobile theme import')
  await shot('02b-mobile-theme-import')
  await evaluate('document.querySelector("dialog[open] .icon-btn").click()')
  await openThemeActions()
  await evaluate('document.querySelector("dialog[open] a").click()')
  await wait('location.pathname === "/customize/theme" && document.querySelectorAll(".theme-editor-swatch").length === 6', 'mobile theme editor')
  assert.ok(await evaluate('[...document.querySelectorAll(".theme-editor-swatch")].every(el => el.offsetWidth === el.offsetHeight && getComputedStyle(el).borderRadius === "50%")'))
  // Mobile editor: mini preview pinned under the app bar, and at scroll end the fixed save bar clears the last color row.
  assert.ok(await evaluate(`(() => {
    const main = document.querySelector('main'); main.scrollTop = main.scrollHeight
    const bar = document.querySelector('.te-actionbar').getBoundingClientRect()
    const last = [...document.querySelectorAll('.te-color-row')].at(-1).getBoundingClientRect()
    const preview = document.querySelector('.te-preview').getBoundingClientRect()
    const targets = [...document.querySelectorAll('.te-actionbar .btn, .te-color-row, .te-bar .more-ib')].every(el => el.offsetHeight >= 44)
    return last.bottom <= bar.top && preview.top >= 56 && preview.top <= 60 && targets && !!document.querySelector('.te-preview .te-mini') && !document.querySelector('.te-preview iframe')
  })()`), 'mobile theme editor: save bar clears content, preview pinned, 44px targets')
  await shot('02c-mobile-theme-editor')
  const nameTheme = name => evaluate(`(() => { const input = document.querySelector(".theme-editor input[required]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${q(name)}); input.dispatchEvent(new Event("input", { bubbles: true })); })()`)
  await nameTheme('   ')
  await evaluate('document.querySelector(".theme-editor-actions .btn-line").click()')
  await wait('document.querySelector(".theme-editor [role=status]")?.textContent.includes("테마 이름을 입력해 주세요")', 'blank theme name rejected')
  await nameTheme('  새 모바일 테마  ')
  await evaluate('document.querySelector(".theme-editor-actions .btn-line").click()')
  await wait(`localStorage.getItem('blanky.themes.${owner}')?.includes('"name":"새 모바일 테마"')`, 'mobile theme saved with trimmed name')
  await evaluate('document.querySelector(".mobile-theme-editor-heading a").click()')
  await wait(heading('내 테마'), 'back to my themes')
  await mobileMenu('커스텀 템플릿')
  await wait(heading('커스텀 템플릿'), 'mobile templates')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  assert.equal(await evaluate('!!document.querySelector("main input[type=file]")'), false)
  await shot('03-mobile-templates')
  // + opens a sheet: 파일 가져오기 / 스토어 둘러보기.
  await evaluate('document.querySelector(".add-fab[data-tour=new-page]").click()')
  await wait('[...document.querySelectorAll("dialog[open] .more-row")].map(el => el.textContent).join("|").includes("스토어 둘러보기")', 'mobile add sheet')
  assert.equal(await evaluate('document.querySelector("dialog[open] a.more-row").getAttribute("href")'), '/store?tab=templates')
  await evaluate('[...document.querySelectorAll("dialog[open] button.more-row")].find(b => b.textContent.includes("파일 가져오기")).click()')
  await wait('document.querySelector("dialog[open] input[type=file]")?.accept.includes(".blankytpl")', 'mobile template import')
  await uploadTemplate(JSON.stringify({ formatVersion: 1, kind: 'blanky.template-package', id: 'mobile-diary', name: '모바일 검증 일기', description: '', author: 'tester', version: '1.0.0', pageType: 'diary', icon: 'BookOpen' }))
  await wait('document.querySelector("dialog[open] .theme-import-review")', 'mobile template review')
  await evaluate('[...document.querySelectorAll("dialog[open] .theme-import-review button")].find(b => b.textContent === "템플릿 추가").click()')
  await wait('document.querySelector("dialog[open] [role=alert]")?.textContent.includes("저장했습니다")', 'mobile template saved')
  await evaluate('document.querySelector("dialog[open] .icon-btn").click()')
  const installedTemplate = '[...document.querySelectorAll("main article details")].find(el => el.querySelector("summary").textContent.includes("모바일 검증 일기"))'
  await wait(installedTemplate, 'mobile template installed')
  assert.equal(await evaluate(installedTemplate + '.open'), false)
  await evaluate(installedTemplate + '.querySelector("summary").click()')
  assert.equal(await evaluate(installedTemplate + '.open'), true)
  // 앱 레이아웃 is desktop-only: below lg the tab is gone and a direct ?tab=layout visit shows a notice card.
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".customization-menu")].map(a => a.textContent.trim())'), ['커스텀 템플릿', '내 테마'])
  await navigate(base + '/custom?tab=layout')
  await wait(heading('앱 레이아웃은 PC에서 편집할 수 있어요'), 'mobile layout notice')
  assert.equal(await evaluate('!!document.querySelector("[data-tour=layout-controls]")'), false)
  assert.equal(await evaluate('[...document.querySelectorAll(".add-fab")].some(el => el.getClientRects().length > 0)'), false)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await shot('04-mobile-layout')
  await evaluate('[...document.querySelectorAll("main a")].find(a => a.textContent.trim() === "커스텀 템플릿으로").click()')
  await wait(heading('커스텀 템플릿'), 'notice back to templates')
  assert.equal(await evaluate('location.pathname + location.search'), '/custom')
  assert.equal(errors.length, 0, errors.join('\n'))
  await finish(true)
  log('PASS customization navigation, template imports, persisted layout, theme apply/preview, mobile theme menu and round swatches, mobile layout notice and overflow')
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
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-customization-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}

