import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { withPlannerTestUser } from './planner-test-user.mjs'
// Opt-in live test: real Supabase, deployed parse-schedule and OpenAI with a disposable test account.
const base = process.env.AI_TEST_URL ?? 'http://127.0.0.1:5192'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-ai-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''; server.stdout.on('data', data => { serverOutput += data }); server.stderr.on('data', data => { serverOutput += data })
for (let i=0; i<60; i++) { try { const res = await fetch(base); if(res.ok) break } catch {} await new Promise(r=>setTimeout(r,100)); if(i===59) throw new Error(serverOutput) }
let targets
for (let i=0;i<50;i++){try{targets=await fetch(browserEndpoint + '/json/list').then(r=>r.json()); break}catch{} await new Promise(r=>setTimeout(r,100));if(i===49)throw new Error(browserOutput)}
const target = targets.find(t => t.type === 'page')
if (!target) throw new Error('No disposable browser test page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0
let loadResolve = null
const pending = new Map()
const errors = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === "Page.loadEventFired" && loadResolve) { loadResolve(); loadResolve = null }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? ''))
  const pair = pending.get(message.id)
  if (pair) { pending.delete(message.id); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function navigate(url) {
  const loaded = new Promise(resolve => { loadResolve = resolve })
  const result = await send(url ? 'Page.navigate' : 'Page.reload', url ? { url } : {})
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const q = value => JSON.stringify(value)
async function wait(expression, label, tries = 300) { for (let i = 0; i < tries; i++) { if (await evaluate('Boolean('+expression+')')) return; await pause(100) } throw new Error('Timed out: ' + label) }
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ' && b.getClientRects().length).click()') }
async function setValue(selector, value, index = 0) {
  await evaluate('(()=>{const el=document.querySelectorAll(' + q(selector) + ')[' + index + ']; const proto=el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input",{bubbles:true}));})()')
}
async function submit(text) { await setValue('#home-entry', text); await click('button[aria-label="보내기"]') }
const review = id => `[data-analysis-item=${q(id)}]`
const read = id => evaluate(`(()=>{const n=document.querySelector(${q(review(id))});const t=n.querySelectorAll('input[type=time]');return {kind:n.querySelector('select').value,title:n.querySelector('input:not([type])').value,date:n.querySelector('input[type=date]').value,start:t[0]?.value ?? '',end:t[1]?.value ?? '',repeat:n.querySelector('select[aria-label="반복"]').value,confirm:n.textContent.includes('시각을 확인했어요')}})()`)
const confirmTime = id => evaluate(`[...document.querySelectorAll(${q(review(id) + ' label')})].find(l=>l.textContent.includes('시각을 확인했어요')).querySelector('input').click()`)
const ids = 'Promise.resolve([...document.querySelectorAll("[data-analysis-item]")].map(n=>n.dataset.analysisItem))'
// Real Seoul date and the next occurrence of an ISO weekday on or after it, as the server computes it.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const weekday = day => new Date(day + 'T00:00:00Z').getUTCDay() || 7
const next = iso => shift(today, (iso - weekday(today) + 7) % 7)
const input = '화요일 오전 9~13시, 목/금 9to6 근로'
const functionCalls = [], failed = []
// Server error bodies (codes/messages only) make a failed save diagnosable.
const failures = () => Promise.all(failed.map(async row => ({ ...row, body: (await send('Network.getResponseBody', { requestId: row.id }).catch(() => ({ body: '' }))).body.slice(0, 300) })))

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  ws.addEventListener('message', ({ data }) => {
    const m = JSON.parse(data)
    if (m.method !== 'Network.responseReceived') return
    if (m.params.response.url.includes('/functions/v1/parse-schedule')) functionCalls.push(m.params.response.status)
    if (m.params.response.status >= 400 && /\/(rest|functions)\/v1\//.test(m.params.response.url)) failed.push({ id: m.params.requestId, status: m.params.response.status, path: new URL(m.params.response.url).pathname })
  })
  await withPlannerTestUser(async session => {
    await navigate(base + '/login'); await wait('document.querySelector("input[type=email]")', 'login form')
    await setValue('input[type=email]', session.email); await setValue('input[type=password]', session.password); await click('button[type=submit]')
    await wait('document.querySelector("#home-entry")', 'authenticated Home')
    const key = 'blanky.library.' + session.userId

    // 1. Real app → Edge Function → rule/AI → preview: exactly three weekly items.
    await submit(input)
    await wait('document.querySelectorAll("[data-analysis-item]").length>0 || document.querySelector("[role=alert]")', 'live analysis')
    assert.deepEqual(await evaluate(ids), ['weekly-1', 'weekly-2', 'weekly-3'])
    assert.ok(functionCalls.includes(200), 'preview came from the deployed Edge Function')
    const expected = [next(2), next(4), next(5)]
    const rows = await Promise.all(['weekly-1', 'weekly-2', 'weekly-3'].map(read))
    console.log('  live preview (today ' + today + '):', JSON.stringify(rows.map(row => [row.title, row.date, row.start, row.end, row.repeat])))
    assert.deepEqual(rows.map(row => [row.kind, row.title, row.date, row.start, row.end, row.repeat]), [
      ['event', '근로', expected[0], '09:00', '13:00', 'weekly'], ['event', '근로', expected[1], '09:00', '18:00', 'weekly'], ['event', '근로', expected[2], '09:00', '18:00', 'weekly']])
    assert.ok(rows.every(row => row.date >= today), 'no first date in the past')
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-analysis-item] [aria-label="반복 요일"] button[aria-pressed=true]')].map(b=>b.getAttribute('aria-label'))`), ['화요일 반복', '목요일 반복', '금요일 반복'])
    assert.equal((await session.client.from('schedules').select('id')).data.length, 0, 'preview does not write')
    console.log('PASS live 1-2: three weekly previews from the deployed function with correct weekdays, times and weekly repeat')

    // 3. Edit Tuesday, exclude Friday, confirm the 9to6 estimate, batch save to Supabase.
    await setValue(review('weekly-1') + ' input[type=time]', '12:00', 1)
    await setValue(review('weekly-1') + ' input:not([type])', '근로(오전)')
    await button('다음'); await confirmTime('weekly-2')
    await click(review('weekly-3') + ' ~ label input')
    await button('다음'); await button('전체 저장')
    await wait('document.body.textContent.includes("전체 저장 완료") || document.querySelector("[role=alert]")', 'batch save')
    assert.ok(await evaluate('document.body.textContent.includes("전체 저장 완료")'), await evaluate('document.querySelector("[role=alert]")?.textContent ?? ""') + ' ' + JSON.stringify(await failures()))
    const stored = (await session.client.from('schedules').select('title,date,start_time,end_time,repeat_rule,repeat_days').order('date')).data
    console.log('  Supabase rows:', JSON.stringify(stored))
    assert.deepEqual(stored.map(row => [row.title, row.date, row.start_time?.slice(0, 5), row.end_time?.slice(0, 5), row.repeat_rule]).sort((a, b) => a[1].localeCompare(b[1])),
      [['근로(오전)', expected[0], '09:00', '12:00', 'weekly'], ['근로', expected[1], '09:00', '18:00', 'weekly']].sort((a, b) => a[1].localeCompare(b[1])))

    // 4. Calendar shows the following week's occurrences, not the excluded Friday or earlier days.
    await navigate(base + '/schedule')
    // New accounts carry sample items, so check each day's own listing for the saved titles.
    const listed = 'document.querySelector("main").innerText'
    for (const [day, title] of [[shift(expected[0], 7), '근로(오전)'], [shift(expected[1], 7), '근로'], [shift(expected[2], 7), null], [shift(today, -1), null], [expected[0], '근로(오전)']]) {
      await wait(`document.querySelector(${q('button[aria-label="' + day + '"]')})`, 'calendar day ' + day)
      await click('button[aria-label="' + day + '"]'); await pause(400)
      if (title) await wait(`${listed}.includes(${q(title)})`, title + ' on ' + day)
      else assert.ok(!(await evaluate(`${listed}.includes("근로")`)), 'no 근로 on ' + day)
      if (title) assert.ok(await evaluate(`document.querySelector(${q('button[aria-label="' + day + '"]')}).dataset.hasEvent === "true"`), day)
    }
    await navigate(base + '/'); await wait('document.querySelector("#home-entry")', 'reload Home')
    await wait('JSON.parse(localStorage.getItem(' + q(key) + ')||"{}").items?.filter(i=>i.title.startsWith("근로")&&i.repeat==="weekly"&&!i.calendarId?.startsWith("local-")).length===2', 'saved rows reload from Supabase')
    console.log('PASS live 3-4: edit, exclusion, confirmation, Supabase save, calendar occurrences, reload')

    // 5. Regression with the deployed function and real AI; previews are closed without saving.
    await evaluate('window.confirm=()=>true')
    for (const [text, check] of [
      ['오늘 오후 3시 검증회의', items => items.length === 1 && items[0].kind === 'event' && items[0].title === '검증회의' && items[0].date === today && items[0].start === '15:00' && items[0].repeat === 'none'],
      ['금요일까지 발표자료 만들기', items => items.length === 1 && items[0].kind === 'task' && items[0].repeat === 'none'],
      ['내일 오후 3시 회의하고 금요일까지 보고서 제출하기', items => items.length === 2 && items.some(i => i.kind === 'event' && i.date === shift(today, 1) && i.start === '15:00') && items.some(i => i.kind === 'task') && items.every(i => i.repeat === 'none')],
    ]) {
      const before = functionCalls.length
      await submit(text)
      await wait('document.querySelectorAll("[data-analysis-item]").length>0 || document.querySelector("[role=alert]")', 'analysis ' + text)
      const items = await Promise.all((await evaluate(ids)).map(read))
      console.log('  ' + text + ' →', JSON.stringify(items.map(i => [i.kind, i.title, i.date, i.start, i.end, i.repeat])))
      assert.ok(functionCalls.length > before, 'Edge Function called for ' + text)
      assert.ok(check(items), text)
      await button('닫기')
      await wait('!document.querySelector("[data-analysis-item]")', 'review closed')
    }
    assert.equal((await session.client.from('schedules').select('id')).data.length, 2, 'regression previews did not write')
    console.log('PASS live 5: single event, deadline task and compound sentence unchanged')
    await mkdir(resolve('.tmp/ai-tests'), { recursive: true })
    assert.equal(errors.length, 0, errors.join('\n'))
  })
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-ai-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
