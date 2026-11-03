import { withPlannerTestUser } from './planner-test-user.mjs'
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.HOME_CHAT_LIVE_TEST_URL ?? 'http://127.0.0.1:5188'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-home-chat-live-'))
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
const evidence = resolve('.audit/runs/home-chat-panel-live')
await mkdir(evidence, { recursive: true })
const steps = []

async function login(session) {
  await navigate(base + '/login')
  await wait('document.querySelector("input[type=email]")', 'login form')
  await fill('input[type=email]', session.email)
  await fill('input[type=password]', session.password)
  await evaluate('document.querySelector("button[type=submit]").click()')
  await wait('document.querySelector("#home-entry")', 'authenticated home')
}
async function logout() {
  await navigate(base + '/settings/account')
  await wait('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="로그아웃")', 'account page')
  await button('로그아웃')
  await wait('location.pathname !== "/settings/account"', 'signed out')
}
async function rows(session, filter = '') {
  const { data, error } = await session.client.from('schedules').select('id,title,date,start_time,repeat_rule,kind,due_date').ilike('title', '%' + filter + '%')
  if (error) throw new Error('DB read failed: ' + error.code)
  return data
}
async function until(read, predicate, label) {
  for (let i = 0; i < 60; i++) { const value = await read(); if (predicate(value)) return value; await pause(200) }
  throw new Error('DB timeout: ' + label)
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await withPlannerTestUser(async a => withPlannerTestUser(async b => {
    await login(a)
    // Tour overlays are per device; dismiss any so they do not cover the panel.
    await evaluate('Object.keys(localStorage).forEach(k=>{if(k.startsWith("blanky.onboarding."))localStorage.setItem(k,"1")})')

    // 1. Single and multiple requests reach the server as soon as they are analysed.
    await say('내일 오후 3시 라이브회의')
    await wait(lastStatus + ' === "saved" || ' + lastStatus + ' === "review" || ' + lastStatus + ' === "failed"', 'single result')
    assert.equal(await evaluate(lastStatus), 'saved', await evaluate(lastAssistant + '.textContent'))
    const single = await until(() => rows(a, '라이브회의'), list => list.length === 1, 'single row')
    assert.equal(single[0].start_time.slice(0, 5), '15:00')
    assert.ok(await evaluate('Boolean(document.querySelector(' + q('[data-work-chip="' + single[0].id + '"]') + '))'), 'chip id is the server id')
    await say('내일 오후 5시 라이브운동, 금요일까지 라이브과제')
    await wait(lastStatus + ' === "saved" || ' + lastStatus + ' === "review" || ' + lastStatus + ' === "failed"', 'multi result')
    assert.equal(await evaluate(lastStatus), 'saved', await evaluate(lastAssistant + '.textContent'))
    await until(() => rows(a, '라이브'), list => list.some(row => row.title.includes('운동')) && list.some(row => row.kind === 'task' && row.due_date), 'multi rows')
    steps.push('auto-save-db')

    // 2. Chip edit and delete reach the server and the calendar list.
    await evaluate(chip('라이브회의') + '.click()')
    await wait('document.querySelector("dialog[open][data-work-edit]")', 'edit dialog')
    await fill('dialog[open] form input:not([type])', '라이브회의 수정')
    await evaluate('document.querySelector("dialog[open] form").requestSubmit()')
    await wait('!document.querySelector("dialog[open]")', 'edit saved')
    await until(() => rows(a, '라이브회의'), list => list.length === 1 && list[0].title === '라이브회의 수정' && list[0].id === single[0].id, 'edited row')
    await evaluate(chip('라이브운동') + '.click()')
    await wait('document.querySelector("dialog[open][data-work-edit]")', 'delete dialog')
    await button('삭제', 'document.querySelector("dialog[open][data-work-edit]")')
    await wait('document.querySelector("dialog.app-confirm-dialog[open]")', 'confirm')
    await evaluate('document.querySelector("dialog.app-confirm-dialog .app-confirm-action").click()')
    await until(() => rows(a, '라이브운동'), list => list.length === 0, 'deleted row')
    steps.push('edit-delete-db')

    // 3. A retried save with the same ids leaves one server row.
    const retryId = crypto.randomUUID()
    const tomorrow = await evaluate('(()=>{const d=new Date();d.setDate(d.getDate()+1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")})()')
    const interrupted = { role: 'assistant', text: '분석했어요. 저장하는 중…', createdAt: new Date().toISOString(), status: 'working',
      retry: [{ id: retryId, kind: 'event', title: '라이브재시도', date: tomorrow, startTime: '19:00', endTime: null, description: '', status: 'todo', repeat: 'none', repeatDays: [] }] }
    for (const id of ['r1', 'r2']) {
      await evaluate('(()=>{const key="blanky.homeChat.' + a.userId + '";const rows=JSON.parse(localStorage.getItem(key)??"[]");rows.push(' + JSON.stringify({ ...interrupted, id }) + ');localStorage.setItem(key,JSON.stringify(rows))})()')
      await navigate(base + '/')
      await wait('document.querySelector("#home-entry")', 'reload')
      await evaluate(history + '.click()')
      await wait(lastStatus + ' === "failed"', 'interrupted shown')
      await button('다시 시도', '(' + lastAssistant + ')')
      await wait(lastStatus + ' === "saved" || ' + lastStatus + ' === "failed"', 'retry result')
      assert.equal(await evaluate(lastStatus), 'saved', await evaluate(lastAssistant + '.textContent'))
    }
    const retried = await rows(a, '라이브재시도')
    assert.deepEqual(retried.map(row => row.id), [retryId], 'server keeps one row for the retried id')
    steps.push('retry-idempotent-db')

    // 4. History survives reload and re-login, and the other account sees none of it.
    const own = await evaluate(messageCount)
    assert.ok(own >= 6)
    await logout()
    await login(a)
    await evaluate(history + '.click()')
    await wait(panelOpen, 'panel after re-login')
    assert.equal(await evaluate(messageCount), own, 'history after re-login')
    await logout()
    await login(b)
    await evaluate(history + '.click()')
    await wait(panelOpen, 'panel for b')
    assert.equal(await evaluate(messageCount), 0, 'b sees no history of a')
    assert.equal((await rows(b, '라이브')).length, 0, 'b sees no rows of a')
    await logout()
    await login(a)
    await evaluate(history + '.click()')
    await wait(panelOpen, 'panel for a again')
    assert.equal(await evaluate(messageCount), own, 'a history restored')
    steps.push('relogin-isolation')
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(evidence, '01-live-panel.png'), Buffer.from(shot.data, 'base64'))
  }))
  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ surface: 'home-supabase', steps }, null, 2))
  console.log('PASS: ' + steps.join(', '))
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise(resolveStop => browser.once('exit', resolveStop))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-home-chat-live-')) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
