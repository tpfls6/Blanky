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
  await navigate(base + '/custom?group=custom')
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
  await shot('01-desktop-themes')
  await clickMenu('앱 레이아웃')
  await wait(heading('앱 레이아웃'), 'layout tab')
  await evaluate(`(() => { const el = document.querySelector('main select.w-24'); el.value = '24'; el.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await wait(`document.querySelector('[role=status]')?.textContent.includes('저장')`, 'layout saved')
  await evaluate('history.back()')
  await wait(heading('내 테마'), 'back to themes')
  await evaluate('history.back()')
  await wait(heading('커스텀 템플릿'), 'back to templates')
  assert.equal(await evaluate(`document.querySelector('[role=tab][aria-selected=true]').textContent.trim()`), '커스텀')
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
  await evaluate(`[...document.querySelectorAll('.customization-themes article button')].find(b => b.textContent === '미리보기').click()`)
  await wait(`!!document.querySelector('.theme-preview-bar')`, 'preview active')
  assert.equal(await themeState(), applied, 'preview must not persist changes')
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '미리보기 종료').click()`)
  await wait(`!document.querySelector('.theme-preview-bar')`, 'preview ended')
  await navigate(base + '/custom?tab=themes')
  await wait(heading('내 테마'), 'theme refresh')
  assert.equal(await themeState(), applied)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await wait(`getComputedStyle(document.querySelector('main label')).display !== 'none'`, 'mobile switcher')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await shot('02-mobile-themes')
  await evaluate(`(() => { const el = document.querySelector('main select'); el.value = 'templates'; el.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await wait(heading('커스텀 템플릿'), 'mobile templates')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await shot('03-mobile-templates')
  await evaluate(`(() => { const el = document.querySelector('main select'); el.value = 'layout'; el.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await wait(heading('앱 레이아웃'), 'mobile layout')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await shot('04-mobile-layout')
  assert.equal(errors.length, 0, errors.join('\n'))
  await finish(true)
  log('PASS unified navigation, template validation/import/persistence, legacy redirect, history, refresh, saved layout, four builtins, apply, preview isolation, mobile tabs and overflow')
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

