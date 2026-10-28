import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.HOME_BATCH_TEST_URL ?? 'http://127.0.0.1:5183'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-home-batch-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolveEndpoint, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolveEndpoint(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', data => { serverOutput += data })
server.stderr.on('data', data => { serverOutput += data })
for (let i = 0; i < 60; i++) {
  try { const res = await fetch(base); if (res.ok) break } catch {}
  await new Promise(r => setTimeout(r, 100))
  if (i === 59) throw new Error(serverOutput)
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
  for (let i = 0; i < 80; i++) {
    if (await evaluate('Boolean(' + expression + ')')) return
    await pause(100)
  }
  throw new Error('Timed out: ' + label)
}
const q = value => JSON.stringify(value)
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
async function button(text) {
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()')
}

const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner
const evidence = resolve('.audit/runs/nl-agent-batch')
await mkdir(evidence, { recursive: true })

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('home-batch-seeded')) return
    const ownerId = '11111111-1111-4111-8111-111111111111'
    const date = new Date()
    const today = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: ownerId, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', ownerId)
    const common = { description: '', date: today, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'none', categoryId: 'test-category', startTime: '15:00', endTime: '16:00', duration: 60, kind: 'event' }
    localStorage.setItem('blanky.library.' + ownerId, JSON.stringify({
      categories: [{ id: 'test-category', name: 'Test category', parentId: null, color: '#7157db' }],
      items: [
        { ...common, id: 'work-1', title: '근로' },
        { ...common, id: 'work-2', title: '근로' },
        { ...common, id: 'class-1', title: '수업' },
        { ...common, id: 'class-2', title: '수업' },
      ],
      settings: {},
    }))
    localStorage.setItem('home-batch-seeded', '1')
  }).toString() + ')()' })
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home loaded')
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).items.length'), 4)

  await fill('#home-entry', '중복 일정 삭제해줘')
  await evaluate('document.querySelector(' + q('button[aria-label="보내기"]') + ').click()')
  await wait('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="실행")', 'preview execute')
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).items.length'), 4, 'preview must not delete')
  assert.ok(await evaluate('document.body.textContent.includes("삭제 후보 2건")'))

  await button('실행')
  await wait('document.body.textContent.includes("중복 일정 2건을 정리했습니다.")', 'batch success copy')
  const batch = await evaluate('window.__blankyLastBatch')
  assert.equal(batch.status, 'applied')
  assert.equal(batch.google, 'idle')
  assert.equal(batch.deletedIds.length, 2)
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).items.length'), 2)
  const leftover = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).items.map(item=>item.title).sort()')
  assert.deepEqual(leftover, ['근로', '수업'])

  const afterClick = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(evidence, '01-after-execute.png'), Buffer.from(afterClick.data, 'base64'))

  await navigate()
  await wait('document.querySelector("#home-entry")', 'home reloaded')
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).items.length'), 2, 'reload keeps the two originals')

  await fill('#home-entry', '중복 일정 삭제해줘')
  await evaluate('document.querySelector(' + q('button[aria-label="보내기"]') + ').click()')
  await wait('document.body.textContent.includes("중복 일정이 없어요") || document.body.textContent.includes("추가로 정리할 중복 일정이 없어요")', 'second pass idle')
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="실행")'), false)
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).items.length'), 2, 'second pass deletes nothing')

  const beforeRollback = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).items')
  const rollback = await evaluate(`(async()=>{
    try {
      await window.__blankyApplyWorkBatch({
        key: crypto.randomUUID(),
        deletes: [window.__blankyLastBatch ? { id: 'missing-id', title: '없음', kind: 'event', date: '2026-10-28' } : { id: 'missing-id' }, JSON.parse(localStorage.getItem(${q(library)})).items[0]],
      })
      return 'applied'
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })()`)
  assert.match(rollback, /기존 일정이 유지/)
  assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).items'), beforeRollback, 'failed batch leaves items')

  const afterReload = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(evidence, '02-after-reload.png'), Buffer.from(afterReload.data, 'base64'))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({
    surface: 'home-local',
    clickedExecute: true,
    batch,
    leftover,
    rollback,
    supabase: 'not-configured',
  }, null, 2))
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: Home clicked 실행, local batch deleted 2, reload held, second pass idle, rollback kept items')
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise(resolveStop => browser.once('exit', resolveStop))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-home-batch-')) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
