// PWA check on a production build: Chromium installability, manifest icons,
// offline start from the service worker cache, and the update prompt.
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'pwa')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.PWA_TEST_URL ?? 'http://127.0.0.1:5222'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')

// Local-only build: no Supabase project, so the app runs on the browser account store.
const outDir = await mkdtemp(join(tmpdir(), 'blanky-pwa-build-'))
const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }
const build = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir'], { env, encoding: 'utf8', windowsHide: true })
if (build.status !== 0) throw new Error('vite build failed\n' + build.stdout + build.stderr)
log('built ' + outDir)

const profile = await mkdtemp(join(tmpdir(), 'blanky-pwa-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=412,915', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
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
const server = spawn(process.execPath, ['--input-type=module', '-e', `import { preview } from "vite"; const server = await preview({ build: { outDir: ${JSON.stringify(outDir)} }, preview: { host: "127.0.0.1", port: ${new URL(base).port}, strictPort: true } }); server.printUrls();`], { env, windowsHide: true, stdio: 'pipe' })
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
  if (pair) { pending.delete(message.id); message.error ? pair.reject(new Error(message.error.message)) : pair.resolve(message.result) }
})
ws.addEventListener('close', () => { for (const pair of pending.values()) pair.reject(new Error('Browser connection closed')); pending.clear() })
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
  if (result?.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
async function wait(expression, label, tries = 100) {
  for (let i = 0; i < tries; i++) {
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
const pngSize = (buffer) => [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]

let ok = false
try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + (() => {
      if (!location.hostname || localStorage.getItem('pwa-test-seeded')) return
      const owner = '11111111-1111-4111-8111-111111111111'
      localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: owner, name: 'Pwa', nickname: 'Pwa', email: 'pwa@example.test', password: 'test-only', avatar: null }]))
      localStorage.setItem('blanky.session.v1', owner)
      localStorage.setItem('blanky.library.' + owner, JSON.stringify({ categories: [], items: [], settings: { locale: 'ko', onboardingDone: true, onboardingPages: ['custom', 'diary', 'reading', 'memo'], customTemplatesGuideSeen: true }, customPages: [], pageTemplates: [], recordTypes: [], records: [] }))
      localStorage.setItem('pwa-test-seeded', '1')
    }).toString() + ')()',
  })

  // 1. Manifest, icons and iOS tags.
  await navigate(base + '/')
  const manifest = await fetch(base + '/manifest.webmanifest').then((r) => r.json())
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  for (const icon of manifest.icons) {
    const bytes = Buffer.from(await fetch(base + icon.src).then((r) => r.arrayBuffer()))
    assert.deepEqual(pngSize(bytes).join('x'), icon.sizes, icon.src)
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512'))
  const apple = await evaluate('document.querySelector("link[rel=apple-touch-icon]")?.getAttribute("href")')
  assert.deepEqual(pngSize(Buffer.from(await fetch(base + apple).then((r) => r.arrayBuffer()))), [180, 180])
  assert.equal(await evaluate('document.querySelector("meta[name=apple-mobile-web-app-capable]")?.content'), 'yes')
  log('manifest, icons and iOS meta ok (' + manifest.icons.length + ' icons)')

  // 2. Service worker controls the page.
  await wait('navigator.serviceWorker.controller', 'service worker controls the page')
  const firstCaches = await evaluate('caches.keys()')
  assert.ok(firstCaches.some((key) => key.startsWith('blanky-static-')), JSON.stringify(firstCaches))
  log('service worker active, caches ' + firstCaches.join(','))

  // 3. Chromium's own install check (the same one behind the install prompt).
  const installability = await send('Page.getInstallabilityErrors')
  assert.deepEqual(installability.installabilityErrors, [], JSON.stringify(installability.installabilityErrors))
  log('Chromium installability: no errors')

  // 4. Offline start: app shell and lazy route come from the cache.
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await navigate(base + '/schedule')
  await wait('document.querySelector("main h1, main h2, main [data-theme-slot]")', 'offline schedule renders')
  await wait('document.querySelector(".app-status-notice p")', 'offline notice')
  await shot('01-offline-schedule')
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await wait('!document.querySelector(".app-status-notice p")', 'offline notice hides when back online')
  log('offline start ok')

  // 5. A new deploy waits for the user, then takes over on reload.
  const swPath = join(outDir, 'sw.js')
  const oldVersion = (await readFile(swPath, 'utf8')).match(/const VERSION = '([^']+)'/)[1]
  await writeFile(swPath, (await readFile(swPath, 'utf8')).replace(oldVersion, 'test-update'))
  await evaluate('navigator.serviceWorker.getRegistration().then((r) => r.update())')
  await wait('document.querySelector(".app-status-notice button")', 'update prompt')
  await shot('02-update-ready')
  const reloaded = new Promise((resolvePromise) => { loadResolve = resolvePromise })
  await evaluate('document.querySelector(".app-status-notice button").click()')
  await reloaded
  await wait('navigator.serviceWorker.controller', 'controller after update')
  const nextCaches = await evaluate('caches.keys()')
  assert.ok(nextCaches.includes('blanky-static-test-update'), JSON.stringify(nextCaches))
  assert.ok(!nextCaches.includes('blanky-static-' + oldVersion), 'old cache removed')
  log('update prompt and cache rollover ok')

  assert.deepEqual(errors, [])
  ok = true
  log('PWA checks passed')
} finally {
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify({ started, ended: new Date().toISOString(), ok, log: logLines, errors }, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
  ws.close()
  browser.kill()
  server.kill()
}
