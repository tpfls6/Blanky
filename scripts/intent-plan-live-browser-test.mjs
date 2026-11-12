import { withPlannerTestUser } from './planner-test-user.mjs'
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.INTENT_LIVE_TEST_URL ?? 'http://127.0.0.1:5192'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-intent-live-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolveEndpoint, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolveEndpoint(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: process.env, windowsHide: true, stdio: 'pipe' })
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
async function wait(expression, label, tries = 150) {
  for (let i = 0; i < tries; i++) {
    if (await evaluate('Boolean(' + expression + ')')) return
    await pause(100)
  }
  throw new Error('Timed out: ' + label + '\n' + await evaluate('document.querySelector("#home-chat-panel")?.textContent.slice(-600) ?? ""'))
}
const q = value => JSON.stringify(value)
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
async function button(text, scope = 'document') {
  const found = await evaluate('(()=>{const b=[...' + scope + '.querySelectorAll("button")].filter(b=>!b.disabled&&b.getClientRects().length).find(b => b.textContent.trim() === ' + q(text) + '); if(b){b.click();return true}return false})()')
  if (!found) throw new Error('No button: ' + text)
}
async function say(text) {
  await fill('#home-entry', text)
  await evaluate('document.querySelector("button[aria-label=\\"보내기\\"]").click()')
}
const lastAssistant = '[...document.querySelectorAll("#home-chat-panel [data-chat-message=assistant]")].at(-1)'
const lastStatus = lastAssistant + '?.dataset.chatStatus'
const history = 'document.querySelector("[aria-controls=home-chat-panel]")'
const panelOpen = 'getComputedStyle(document.querySelector("#home-chat-panel")).display !== "none"'
const chip = title => '[...document.querySelectorAll("#home-chat-panel [data-work-chip]")].find(b=>!b.disabled&&b.textContent.includes(' + q(title) + '))'
const messageCount = 'document.querySelectorAll("#home-chat-panel [data-chat-message]").length'
const evidence = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'intent-plan-live')
await mkdir(evidence, { recursive: true })
async function shot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(evidence, name + '.png'), Buffer.from(result.data, 'base64')) }
const steps = []

async function login(session) {
  await navigate(base + '/login')
  await wait('document.querySelector("input[type=email]")', 'login form')
  await fill('input[type=email]', session.email)
  await fill('input[type=password]', session.password)
  await evaluate('document.querySelector("button[type=submit]").click()')
  await wait('document.querySelector("#home-entry")', 'authenticated home')
}
async function until(read, predicate, label) {
  for (let i = 0; i < 60; i++) { const value = await read(); if (predicate(value)) return value; await pause(200) }
  throw new Error('DB timeout: ' + label)
}
const iso = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
const now = new Date()
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
const dayOf = offset => { const day = new Date(monday); day.setDate(day.getDate() + offset); return iso(day) }
const friday = dayOf(4), nextWednesday = dayOf(9), nextFriday = dayOf(11), wednesdayAfter = dayOf(16)
const weekday = day => new Date(day + 'T12:00:00Z').getUTCDay() || 7
const occurs = (row, day) => {
  if (day < row.date) return false
  if (row.repeat_rule !== 'none' && row.repeat_until && day > row.repeat_until) return false
  if (row.repeat_rule === 'weekly') return row.repeat_days.includes(weekday(day))
  return row.repeat_rule === 'none' && row.date === day
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await withPlannerTestUser(async a => {
    await login(a)
    await evaluate('Object.keys(localStorage).forEach(k=>{if(k.startsWith("blanky.onboarding."))localStorage.setItem(k,"1")})')
    const calendar = await until(async () => (await a.client.from('calendars').select('id').eq('type', 'personal').limit(1)).data ?? [], list => list.length === 1, 'personal calendar')
    // An existing weekly routine, saved before the request like a real user's data.
    const seed = await a.client.from('schedules').insert({ user_id: a.userId, calendar_id: calendar[0].id, kind: 'event', title: '근로', description: '', date: dayOf(-28),
      start_time: '09:00', end_time: '18:00', duration_minutes: 540, repeat_rule: 'weekly', repeat_days: [1, 3, 5], all_day: false, priority: 'medium', status: 'todo', change_source: 'manual' }).select('id').single()
    if (seed.error) throw new Error('Seed failed: ' + seed.error.code)
    const workId = seed.data.id
    const series = async () => {
      const { data, error } = await a.client.from('schedules').select('id,title,date,start_time,end_time,repeat_rule,repeat_days,repeat_until,series_id,all_day')
      if (error) throw new Error('DB read failed: ' + error.code)
      return data
    }
    const workOn = (rows, day) => rows.filter(row => (row.id === workId || row.series_id === workId) && occurs(row, day))
    await navigate(base + '/')
    await wait('document.querySelector("#home-entry")', 'home with seed')

    // 1. The reported sentence: preview first, nothing written yet.
    const before = await series()
    await say('이번주 금요일은 1시 퇴근하고 도현오빠랑 데이트 있어')
    await wait(lastStatus + ' === "confirm" || ' + lastStatus + ' === "review" || ' + lastStatus + ' === "failed"', 'plan preview')
    assert.equal(await evaluate(lastStatus), 'confirm', await evaluate(lastAssistant + '.innerText'))
    assert.match(await evaluate(lastAssistant + '.innerText'), /근로 · .*하루만 09:00–18:00 → 09:00–13:00/)
    assert.deepEqual(await series(), before, 'nothing written before 실행')
    steps.push('preview')

    // 2. 실행 writes: only this Friday ends at 13:00, the rule and other weeks stay, the date is added untimed.
    await button('실행', '(' + lastAssistant + ')')
    await wait(lastStatus + ' === "saved" || ' + lastStatus + ' === "failed"', 'plan ran')
    assert.equal(await evaluate(lastStatus), 'saved', await evaluate(lastAssistant + '.innerText'))
    const after = await until(series, rows => rows.some(row => row.title === '도현오빠랑 데이트'), 'date row')
    assert.equal(workOn(after, friday).length, 1)
    assert.equal(workOn(after, friday)[0].end_time.slice(0, 5), '13:00')
    assert.equal(workOn(after, friday)[0].start_time.slice(0, 5), '09:00')
    assert.equal(workOn(after, nextFriday).length, 1)
    assert.equal(workOn(after, nextFriday)[0].end_time.slice(0, 5), '18:00')
    assert.equal(workOn(after, nextFriday)[0].repeat_rule, 'weekly')
    assert.equal(workOn(after, dayOf(-28)).length, 1, 'earlier weeks kept')
    const date = after.find(row => row.title === '도현오빠랑 데이트')
    assert.equal(date.date, friday)
    assert.equal(date.start_time, null)
    steps.push('series-once-and-create')

    // 3. Reload: the app reads the server rows back the same way.
    await navigate(base + '/')
    await wait('document.querySelector("#home-entry")', 'reloaded')
    steps.push('reload')

    // 4. Cancelling one occurrence of the series keeps the following weeks.
    await say('다음주 수요일 근로 취소됐어')
    await wait(lastStatus + ' === "confirm" || ' + lastStatus + ' === "review"', 'cancel preview')
    assert.equal(await evaluate(lastStatus), 'confirm', await evaluate(lastAssistant + '.innerText'))
    await button('실행', '(' + lastAssistant + ')')
    await wait(lastStatus + ' === "saved" || ' + lastStatus + ' === "failed"', 'cancel ran')
    assert.equal(await evaluate(lastStatus), 'saved', await evaluate(lastAssistant + '.innerText'))
    const cancelled = await until(series, rows => workOn(rows, nextWednesday).length === 0, 'cancelled occurrence')
    assert.equal(workOn(cancelled, wednesdayAfter).length, 1)
    assert.equal(workOn(cancelled, friday)[0].end_time.slice(0, 5), '13:00', 'earlier one-off change kept')
    steps.push('cancel-once')
    await shot('01-live-plan')
  })
  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ surface: 'home-live', supabase: 'production-disposable-account', steps }, null, 2))
  console.log('PASS: ' + steps.join(', '))
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise(resolveStop => browser.once('exit', resolveStop))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-intent-live-')) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
