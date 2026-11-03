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
// Same-weekday classes: the weekday carries to the next range, each range keeps its own title and time.
const input = '화요일 오후 14시~16시50분 인공지능프로젝트 수업, 수요일 오전 10~12:50 컴보안 수업, 14:00~16:50분 졸작 수업'
const functionCalls = [], failed = []
const failures = () => Promise.all(failed.map(async row => ({ ...row, body: (await send('Network.getResponseBody', { requestId: row.id }).catch(() => ({ body: '' }))).body.slice(0, 300) })))
const ITEMS = ['weekly-1', 'weekly-2', 'weekly-3']
const exclude = id => click(review(id) + ' ~ label input')
async function analyze() {
  const before = functionCalls.length
  await submit(input)
  await wait('document.querySelectorAll("[data-analysis-item]").length>0 || document.querySelector("[role=alert]")', 'live analysis')
  assert.ok(functionCalls.length > before && functionCalls.at(-1) === 200, 'preview came from the deployed Edge Function')
}
// Onboarding for new accounts has its own 다음 button, so review steps are clicked inside the analysis dialog only.
const reviewButton = text => evaluate('[...document.querySelectorAll("[aria-label=\\"AI 분석 결과\\"] button")].find(b => b.textContent.trim() === ' + q(text) + ' && b.getClientRects().length).click()')
async function saveAll() {
  await reviewButton('다음'); await reviewButton('다음'); await reviewButton('전체 저장')
  await wait('document.body.textContent.includes("전체 저장 완료") || document.querySelector("[role=alert]")', 'batch save')
  assert.ok(await evaluate('document.body.textContent.includes("전체 저장 완료")'), await evaluate('document.querySelector("[role=alert]")?.textContent ?? ""') + ' ' + JSON.stringify(await failures()))
  await reviewButton("닫기"); await wait("!document.querySelector(\"[data-analysis-item]\")", "review closed")
}

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  ws.addEventListener('message', ({ data }) => {
    const m = JSON.parse(data)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(arg => arg.value ?? arg.description ?? '').join(' '))
    if (m.method !== 'Network.responseReceived') return
    if (m.params.response.url.includes('/functions/v1/parse-schedule')) functionCalls.push(m.params.response.status)
    if (m.params.response.status >= 400 && /\/(rest|functions)\/v1\//.test(m.params.response.url)) failed.push({ id: m.params.requestId, status: m.params.response.status, path: new URL(m.params.response.url).pathname })
  })
  await withPlannerTestUser(async session => {
    await navigate(base + '/login'); await wait('document.querySelector("input[type=email]")', 'login form')
    await setValue('input[type=email]', session.email); await setValue('input[type=password]', session.password); await click('button[type=submit]')
    await wait('document.querySelector("#home-entry")', 'authenticated Home')
    const tuesday = next(2), wednesday = next(3)

    // 1. Real app → deployed Edge Function → preview: three weekly items, two of them on Wednesday.
    await analyze()
    const rows = await Promise.all((await evaluate(ids)).map(read))
    console.log('  live preview (today ' + today + '):', JSON.stringify(rows.map(row => [row.title, row.date, row.start, row.end, row.repeat])))
    assert.deepEqual(await evaluate(ids), ITEMS)
    assert.deepEqual(rows.map(row => [row.kind, row.title, row.date, row.start, row.end, row.repeat, row.confirm]), [
      ['event', '인공지능프로젝트 수업', tuesday, '14:00', '16:50', 'weekly', false],
      ['event', '컴보안 수업', wednesday, '10:00', '12:50', 'weekly', false],
      ['event', '졸작 수업', wednesday, '14:00', '16:50', 'weekly', false]])
    assert.equal((await session.client.from('schedules').select('id')).data.length, 0, 'preview does not write')
    console.log('PASS live 1: three weekly previews from the deployed function')

    // 2. Edit the Tuesday class, exclude the morning class, save the rest.
    await setValue(review('weekly-1') + ' input:not([type])', '인공지능프로젝트 수업(수정)')
    await setValue(review('weekly-1') + ' input[type=time]', '16:30', 1)
    await exclude('weekly-2')
    await saveAll()
    // 3. Analyze again and save only the class excluded before.
    await analyze()
    await exclude('weekly-1'); await exclude('weekly-3')
    await saveAll()
    const byDay = (a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2])
    const stored = (await session.client.from('schedules').select('title,date,start_time,end_time,repeat_rule')).data
      .filter(row => /수업(?:\(수정\))?$/.test(row.title))
    console.log('  Supabase rows:', JSON.stringify(stored))
    assert.deepEqual(stored.map(row => [row.title, row.date, row.start_time?.slice(0, 5), row.end_time?.slice(0, 5), row.repeat_rule]).sort(byDay),
      [['인공지능프로젝트 수업(수정)', tuesday, '14:00', '16:30', 'weekly'], ['컴보안 수업', wednesday, '10:00', '12:50', 'weekly'], ['졸작 수업', wednesday, '14:00', '16:50', 'weekly']].sort(byDay))
    console.log('PASS live 2-3: edit, exclusion and Supabase save of each class')

    // 4. The calendar repeats each class on its own weekday the following week.
    await navigate(base + '/schedule')
    const listed = 'document.querySelector("main").innerText'
    for (const [day, present, absent] of [[shift(tuesday, 7), ['인공지능프로젝트 수업(수정)'], ['컴보안 수업', '졸작 수업']], [shift(wednesday, 7), ['컴보안 수업', '졸작 수업'], ['인공지능프로젝트']]]) {
      await wait(`document.querySelector(${q('button[aria-label="' + day + '"]')})`, 'calendar day ' + day)
      await click('button[aria-label="' + day + '"]'); await pause(400)
      for (const title of present) await wait(`${listed}.includes(${q(title)})`, title + ' on ' + day)
      for (const title of absent) assert.ok(!(await evaluate(`${listed}.includes(${q(title)})`)), 'no ' + title + ' on ' + day)
    }
    console.log('PASS live 4: weekly occurrences on Tuesday and Wednesday')

    // 5. Regression with the deployed function: multi-weekday work, single event, compound task; closed without saving.
    await navigate(base + '/'); await wait('document.querySelector("#home-entry")', 'reload Home')
    await evaluate('window.confirm=()=>true')
    for (const [text, check] of [
      ['화요일 오전 9~13시, 목/금 9to6 근로', items => items.length === 3 && items.every(i => i.title === '근로' && i.repeat === 'weekly')],
      ['오늘 오후 3시 검증회의', items => items.length === 1 && items[0].kind === 'event' && items[0].title === '검증회의' && items[0].start === '15:00' && items[0].repeat === 'none'],
      ['내일 오후 3시 회의하고 금요일까지 보고서 제출하기', items => items.length === 2 && items.some(i => i.kind === 'event' && i.start === '15:00') && items.some(i => i.kind === 'task') && items.every(i => i.repeat === 'none')],
    ]) {
      const before = functionCalls.length
      await submit(text)
      await wait('document.querySelectorAll("[data-analysis-item]").length>0 || document.querySelector("[role=alert]")', 'analysis ' + text)
      const items = await Promise.all((await evaluate(ids)).map(read))
      console.log('  ' + text + ' →', JSON.stringify(items.map(i => [i.kind, i.title, i.date, i.start, i.end, i.repeat])))
      assert.ok(functionCalls.length > before, 'Edge Function called for ' + text)
      assert.ok(check(items), text)
      await reviewButton("닫기"); await wait("!document.querySelector(\"[data-analysis-item]\")", "review closed")
    }
    console.log('PASS live 5: work timetable, single event and compound sentence unchanged')
    assert.equal(errors.length, 0, errors.join('\n'))
    // Only parsing and schedule storage are under test; other features' endpoints are reported, not asserted.
    const failedRows = await failures(), scoped = row => row.path.includes('/parse-schedule') || row.path.startsWith('/rest/')
    if (failedRows.some(row => !scoped(row))) console.log('  note: unrelated failed responses', JSON.stringify(failedRows.filter(row => !scoped(row)).map(row => [row.status, row.path])))
    assert.deepEqual(failedRows.filter(scoped), [], 'no failed parse-schedule or REST responses')
    // 204 is the CORS preflight; every analysis itself must be 200.
    const analyses = functionCalls.filter(status => status !== 204)
    assert.ok(analyses.length >= 5 && analyses.every(status => status === 200), 'every parse-schedule analysis returned 200: ' + functionCalls)
    console.log('PASS: no browser console errors, exceptions or failed parse-schedule/REST responses (' + analyses.length + ' parse-schedule analyses, all 200)')
  })
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-ai-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
