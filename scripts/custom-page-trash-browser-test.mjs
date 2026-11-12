// 커스텀 페이지 삭제 → 휴지통 → 복구: the page, its record type, its records and its menu item all leave and all come back.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.PAGE_TRASH_TEST_URL ?? 'http://127.0.0.1:5192'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-page-trash-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolveEndpoint, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolveEndpoint(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**", "**/.audit/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', data => { serverOutput += data })
server.stderr.on('data', data => { serverOutput += data })
for (let i = 0; i < 100; i++) {
  try { const res = await fetch(base); if (res.ok) break } catch {}
  await new Promise(r => setTimeout(r, 100))
  if (i === 99) throw new Error(serverOutput)
}
let targets
for (let i = 0; i < 50; i++) {
  try { targets = await fetch(browserEndpoint + '/json/list').then(r => r.json()); break } catch {}
  await new Promise(r => setTimeout(r, 100))
  if (i === 49) throw new Error(browserOutput)
}
const target = targets.find(t => t.type === 'page')
if (!target) throw new Error('No disposable browser test page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolveOpen, reject) => {
  ws.addEventListener('open', resolveOpen, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
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
function send(method, params = {}) {
  return new Promise((resolveSend, reject) => {
    const id = ++nextId
    pending.set(id, { resolve: resolveSend, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function navigate(url) {
  const loaded = new Promise(resolveLoad => { loadResolve = resolveLoad })
  const result = await send(url ? 'Page.navigate' : 'Page.reload', url ? { url } : {})
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms))
async function wait(expression, label) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(' + expression + ')')) return
    await pause(100)
  }
  throw new Error('Timed out: ' + label + '\n' + await evaluate('document.querySelector("main")?.innerText.slice(0, 1500) ?? ""'))
}
const q = value => JSON.stringify(value)
const owner = '11111111-1111-4111-8111-111111111111'
const libraryKey = 'blanky.library.' + owner
const library = 'JSON.parse(localStorage.getItem(' + q(libraryKey) + '))'
const evidence = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'page-trash')
await mkdir(evidence, { recursive: true })
async function shot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(evidence, name + '.png'), Buffer.from(result.data, 'base64')) }
const steps = []


const pageId = '22222222-2222-4222-8222-222222222222'
const page = { id: pageId, name: '운동 일지', icon: 'StickyNote', description: '', sort: 0, schemaVersion: 1, blocks: [], template: 'diary', fieldLabels: {}, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }
const recordType = { id: pageId, name: '운동 일지', icon: 'StickyNote', color: '#3A62B0', description: 'blanky:page:diary:v1', schemaVersion: 1, version: 1, blocks: [], createdAt: page.createdAt, updatedAt: page.updatedAt }
const records = [1, 2].map(n => ({ id: '33333333-3333-4333-8333-33333333333' + n, typeId: pageId, title: '기록 ' + n, values: { date: '2026-11-0' + n, body: '본문 ' + n }, templateVersion: 1, createdAt: page.createdAt, updatedAt: page.updatedAt }))
const other = { id: '44444444-4444-4444-8444-444444444444', typeId: 'other-type', title: '다른 기록', values: {}, templateVersion: 1, createdAt: page.createdAt, updatedAt: page.updatedAt }
const state = expr => evaluate('(()=>{const lib=' + library + ';return ' + expr + '})()')
const clickIn = (scope, label) => evaluate('[...document.querySelectorAll(' + q(scope) + ')].find(e=>e.textContent.includes("운동 일지")).querySelectorAll("button").forEach(b=>{if(b.textContent.trim()===' + q(label) + ')b.click()})')

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + ((seed) => {
    if (!location.hostname || localStorage.getItem('page-trash-seeded')) return
    const id = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id, name: 'T', nickname: 'T', email: 't@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', id)
    localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories: [], items: [], customPages: [seed.page], records: seed.records, recordTypes: [seed.recordType], trash: [], settings: { locale: 'ko', onboardingDone: true, onboardingPages: ['memo', 'diary', 'reading', 'custom'], customTemplatesGuideSeen: true } }))
    localStorage.setItem('page-trash-seeded', '1')
  }).toString() + ')(' + JSON.stringify({ page, recordType, records: [...records, other] }) + ')' })
  await navigate(base + '/custom')
  await wait('[...document.querySelectorAll("main article")].some(a=>a.textContent.includes("운동 일지"))', 'custom page row')
  assert.equal(await state('lib.settings.nav.some(n=>n.id===' + q(pageId) + ')'), true, 'page is in the menu before delete')
  await shot('01-before-delete')

  // 1. 삭제: page, its record type, its records and its menu item leave; another page's record stays.
  await clickIn('main article', '삭제')
  await wait('document.querySelector("dialog[open] .app-confirm-action")', 'confirm dialog')
  assert.match(await evaluate('document.querySelector("dialog[open]").textContent'), /휴지통으로 이동/)
  await evaluate('document.querySelector("dialog[open] .app-confirm-action").click()')
  await wait('!' + library + '.customPages.some(p=>p.id===' + q(pageId) + ')', 'page removed')
  assert.deepEqual(await state('[lib.recordTypes.some(t=>t.id===' + q(pageId) + '),lib.records.map(r=>r.id),lib.settings.nav.some(n=>n.id===' + q(pageId) + ')]'), [false, [other.id], false])
  const row = await state('lib.trash.find(t=>t.id===' + q(pageId) + ')')
  assert.equal(row?.kind, 'page', 'the page went to the trash')
  assert.deepEqual(row.payload.records.map(r => r.id), records.map(r => r.id), 'its records went with it')
  steps.push('page-delete')

  // 2. The trash lists it as a page (after a fresh load).
  await navigate(base + '/trash')
  await wait('[...document.querySelectorAll("main li")].some(li=>li.textContent.includes("운동 일지")&&li.textContent.includes("페이지"))', 'page in trash')
  await shot('02-trash')
  steps.push('trash-listed')

  // 3. 복구 brings the page, its record type, records and menu item back, once.
  await clickIn('main li', '복구')
  await wait(library + '.customPages.some(p=>p.id===' + q(pageId) + ')', 'page restored')
  assert.deepEqual(await state('[lib.trash.length,lib.customPages.filter(p=>p.id===' + q(pageId) + ').length,lib.recordTypes.filter(t=>t.id===' + q(pageId) + ').length,lib.records.map(r=>r.id).sort(),lib.settings.nav.filter(n=>n.id===' + q(pageId) + ').length]'),
    [0, 1, 1, [...records.map(r => r.id), other.id].sort(), 1])
  steps.push('page-restore')

  // 4. After a reload the restored page opens with its records.
  await navigate(base + '/pages/' + pageId)
  await wait('document.querySelector("main")?.textContent.includes("운동 일지")', 'restored page opens')
  await shot('03-restored-page')
  assert.equal(await state('lib.records.filter(r=>r.typeId===' + q(pageId) + ').length'), 2)
  steps.push('restored-page-opens')

  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ surface: 'custom-page-trash-local', supabase: 'not-configured', steps }, null, 2))
  console.log('PASS: ' + steps.join(', '))
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise(resolveStop => browser.once('exit', resolveStop))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-page-trash-')) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
