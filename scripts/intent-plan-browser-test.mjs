import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.INTENT_TEST_URL ?? 'http://127.0.0.1:5191'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-intent-plan-'))
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
  throw new Error('Timed out: ' + label + '\n' + await evaluate('document.querySelector("#home-chat-panel")?.innerText ?? ""'))
}
const q = value => JSON.stringify(value)
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
async function button(text, scope = 'document') {
  const found = await evaluate('(()=>{const b=[...' + scope + '.querySelectorAll("button")].filter(b=>!b.disabled&&b.getClientRects().length).find(b => b.textContent.trim() === ' + q(text) + '); if(b){b.click();return true}return false})()')
  if (!found) throw new Error('No button: ' + text)
}
async function key(name) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: 27 })
}
const sendButton = 'document.querySelector("button[aria-label=\\"보내기\\"]")'
async function say(text) {
  await fill('#home-entry', text)
  await evaluate(sendButton + '.click()')
  await wait('!document.querySelector("#home-entry").value && !document.querySelector("#home-chat-panel [aria-busy=true]")', 'sent ' + text)
}
const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const items = id => 'JSON.parse(localStorage.getItem("blanky.library.' + id + '")).items'
const lastAssistant = '[...document.querySelectorAll("#home-chat-panel [data-chat-message=assistant]")].at(-1)'
const lastStatus = lastAssistant + '?.dataset.chatStatus'
const panelOpen = 'getComputedStyle(document.querySelector("#home-chat-panel")).display !== "none"'
const history = 'document.querySelector("[aria-controls=home-chat-panel]")'
const evidence = resolve('.audit/runs/intent-plan')
await mkdir(evidence, { recursive: true })
async function shot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(evidence, name + '.png'), Buffer.from(result.data, 'base64')) }
const steps = []
const work = { id: '44444444-4444-4444-8444-444444444444', kind: 'event', title: '근로', description: '', date: '2026-01-05', startTime: '09:00', endTime: '18:00', duration: 540,
  categoryId: null, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'weekly', repeatDays: [1, 3, 5] }

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + ((seed) => {
    if (!location.hostname || localStorage.getItem('intent-seeded')) return
    const id = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id, name: 'T', nickname: 'T', email: 't@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', id)
    localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories: [], items: [seed], settings: { onboardingDone: true } }))
    localStorage.setItem('intent-seeded', '1')
  }).toString() + ')(' + JSON.stringify(work) + ')' })
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home loaded')
  // This week's Friday and next week's Friday in the browser's own calendar.
  const [friday, nextFriday] = await evaluate('(()=>{const d=new Date();const monday=new Date(d.getFullYear(),d.getMonth(),d.getDate()-((d.getDay()+6)%7));const f=n=>{const x=new Date(monday);x.setDate(x.getDate()+n);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,"0"),String(x.getDate()).padStart(2,"0")].join("-")};return [f(4),f(11)]})()')
  const library = 'JSON.parse(localStorage.getItem("blanky.library.' + owner + '"))'

  // 1. The reported sentence: a preview, nothing saved yet, never a memo.
  await say('이번주 금요일은 1시 퇴근하고 도현오빠랑 데이트 있어')
  await wait(lastStatus + ' === "confirm"', 'plan preview')
  const preview = await evaluate(lastAssistant + '.innerText')
  assert.match(preview, /근로 · .*하루만 09:00–18:00 → 09:00–13:00/)
  assert.match(preview, /새 일정: 도현오빠랑 데이트/)
  assert.match(preview, /몇 시인가요/)
  assert.equal(await evaluate(items(owner) + '.length'), 1, 'nothing saved before 실행')
  assert.equal(await evaluate('(' + library + '.memos ?? []).length'), 0, 'not saved as memo')
  await shot('01-preview')
  steps.push('preview')

  // 2. 실행: this Friday ends at 13:00, other weeks keep 09:00–18:00, the date is added without a made-up time.
  await button('실행', '(' + lastAssistant + ')')
  await wait(lastStatus + ' === "saved" || ' + lastStatus + ' === "failed"', 'plan ran')
  assert.equal(await evaluate(lastStatus), 'saved', await evaluate(lastAssistant + '.innerText'))
  const rows = await evaluate(items(owner))
  const repeatsOn = (row, day) => {
    if (day < row.date) return false
    if (row.repeat !== 'none' && row.repeatUntil && day > row.repeatUntil) return false
    if (row.repeat === 'weekly') return row.repeatDays.includes(new Date(day + 'T12:00:00Z').getUTCDay() || 7)
    return row.repeat === 'none' ? day === row.date : false
  }
  const workOn = day => rows.filter(row => (row.id === work.id || row.seriesId === work.id) && repeatsOn(row, day))
  assert.equal(workOn(friday).length, 1)
  assert.equal(workOn(friday)[0].endTime, '13:00')
  assert.equal(workOn(friday)[0].startTime, '09:00')
  assert.equal(workOn(nextFriday).length, 1)
  assert.equal(workOn(nextFriday)[0].endTime, '18:00')
  assert.equal(workOn(nextFriday)[0].repeat, 'weekly')
  const date = rows.find(row => row.title === '도현오빠랑 데이트')
  assert.ok(date, 'date saved')
  assert.equal(date.date, friday)
  assert.equal(date.startTime, null)
  steps.push('run')

  // 3. An unknown target asks; nothing is saved and nothing becomes a memo.
  const before = rows.length
  await say('토요일 동아리 약속 취소됐어')
  await wait(lastStatus + ' === "review"', 'question')
  assert.match(await evaluate(lastAssistant + '.innerText'), /찾지 못했어요/)
  assert.equal(await evaluate(items(owner) + '.length'), before)
  assert.equal(await evaluate('(' + library + '.memos ?? []).length'), 0)
  steps.push('unknown-target')

  // 4. A schedule sentence the local parser cannot analyse fails visibly instead of becoming a memo.
  // On failure the words go back into the input so nothing typed is lost.
  await fill('#home-entry', '내일 회의 끝나면 민수랑 저녁 먹고 영화 보기')
  await evaluate(sendButton + '.click()')
  await wait(lastStatus + ' === "failed" || ' + lastStatus + ' === "saved" || ' + lastStatus + ' === "review"', 'complex result')
  if (await evaluate(lastStatus) === 'failed') assert.equal(await evaluate('document.querySelector("#home-entry").value'), '내일 회의 끝나면 민수랑 저녁 먹고 영화 보기')
  await fill('#home-entry', '')
  assert.equal(await evaluate('(' + library + '.memos ?? []).length'), 0, 'complex schedule not filed as memo')
  steps.push('no-memo-fallback')

  // 5. Plain notes still become memos.
  await say('조용한 하루')
  await wait('(' + library + '.memos ?? []).length === 1', 'memo saved')
  steps.push('memo')

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await navigate()
  await wait('document.querySelector("#home-entry")', 'mobile')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'mobile panel')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= 391'), 'no horizontal scroll')
  await shot('02-mobile-history')
  steps.push('mobile')

  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ surface: 'home-local', supabase: 'not-configured', steps }, null, 2))
  console.log('PASS: ' + steps.join(', '))
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise(resolveStop => browser.once('exit', resolveStop))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-intent-plan-')) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
