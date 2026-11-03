import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.AI_TEST_URL ?? 'http://127.0.0.1:5191'
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
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
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
async function wait(expression, label) { for (let i = 0; i < 80; i++) { if (await evaluate('Boolean('+expression+')')) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ' && b.getClientRects().length).click()') }
async function setValue(selector, value, index = 0) {
  await evaluate('(()=>{const el=document.querySelectorAll(' + q(selector) + ')[' + index + ']; const proto=el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input",{bubbles:true}));})()')
}
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner
const items = 'JSON.parse(localStorage.getItem(' + q(library) + ')).items'
const input = '화요일 오전 9~13시, 목/금 9to6 근로'
// Each scenario pins the page clock to a reference moment, then starts from an empty schedule library.
// Analysis previews are checked on the schedule page quick input, which still reviews before saving;
// Home saves clear items on its own and is covered at the end.
let surface = '/schedule'
async function reset(now, path = '/schedule') {
  surface = path
  await evaluate(`(()=>{localStorage.clear();localStorage.setItem('test-now',${q(now)});
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{id:${q(owner)},name:'Test',nickname:'Test',email:'test@example.test',password:'test-only',avatar:null}]));
    localStorage.setItem('blanky.session.v1', ${q(owner)});
    localStorage.setItem(${q(library)}, JSON.stringify({categories:[],items:[],settings:{}}));})()`)
  await navigate(base + path)
  await wait(path === '/' ? 'document.querySelector("#home-entry")' : 'document.querySelector("form.composer-line input")', 'page loaded')
}
async function submit(text) {
  if (surface === '/') {
    await setValue('#home-entry', text)
    await click('button[aria-label="보내기"]')
    return
  }
  await setValue('form.composer-line input', text)
  await click('form.composer-line button[type=submit]')
}
const review = id => `[data-analysis-item=${q(id)}]`
const read = id => evaluate(`(()=>{const n=document.querySelector(${q(review(id))});const t=n.querySelectorAll('input[type=time]');return {title:n.querySelector('input:not([type])').value,date:n.querySelector('input[type=date]').value,start:t[0]?.value ?? '',end:t[1]?.value ?? '',repeat:n.querySelector('select[aria-label="반복"]').value,confirm:n.textContent.includes('시각을 확인했어요')}})()`)
const confirmTime = id => evaluate(`[...document.querySelectorAll(${q(review(id) + ' label')})].find(l=>l.textContent.includes('시각을 확인했어요')).querySelector('input').click()`)

try {
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    const iso = localStorage.getItem('test-now'); if (!iso) return
    const Real = Date, offset = Real.parse(iso) - Real.now()
    class Pinned extends Real { constructor(...args) { if (args.length) super(...args); else super(Real.now() + offset) } static now() { return Real.now() + offset } }
    globalThis.Date = Pinned
  }).toString() + ')()' })
  await navigate(base + '/')

  // 1–3. Three previews, per-weekday times, weekly repeat, and first dates never before the reference day.
  for (const [now, today, expected] of [
    ['2026-10-15T10:00:00+09:00', '2026-10-15', ['2026-10-20', '2026-10-15', '2026-10-16']], // Thursday
    ['2026-10-17T10:00:00+09:00', '2026-10-17', ['2026-10-20', '2026-10-22', '2026-10-23']], // Saturday
    ['2026-10-20T23:30:00+09:00', '2026-10-20', ['2026-10-20', '2026-10-22', '2026-10-23']], // Tuesday late night
    ['2026-12-31T10:00:00+09:00', '2026-12-31', ['2027-01-05', '2026-12-31', '2027-01-01']], // year boundary
  ]) {
    await reset(now)
    await submit(input)
    await wait('document.querySelectorAll("[data-analysis-item]").length===3', 'three previews ' + today)
    assert.equal(await evaluate(items + '.length'), 0, 'preview must not auto-save')
    assert.ok(await evaluate('document.body.textContent.includes("1 / 3 · 총 3개")'))
    const rows = await Promise.all(['weekly-1', 'weekly-2', 'weekly-3'].map(read))
    assert.deepEqual(rows.map(row => row.date), expected, today)
    assert.ok(rows.every(row => row.date >= today), 'first date before reference day ' + today)
    assert.deepEqual(rows.map(row => [row.title, row.start, row.end, row.repeat]), [['근로', '09:00', '13:00', 'weekly'], ['근로', '09:00', '18:00', 'weekly'], ['근로', '09:00', '18:00', 'weekly']])
    assert.deepEqual(rows.map(row => row.confirm), [false, true, true], '9to6 estimate needs confirmation')
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-analysis-item] [aria-label="반복 요일"] button[aria-pressed=true]')].map(b=>b.getAttribute('aria-label'))`), ['화요일 반복', '목요일 반복', '금요일 반복'])
  }
  console.log('PASS 1-3: three weekly previews, per-weekday times, first dates on/after Thu, Sat, Tue 23:30 and year-end reference days')

  // 4. Edit one, exclude one, batch save, then the calendar shows next week's occurrences only.
  await reset('2026-10-15T10:00:00+09:00')
  await submit(input)
  await wait('document.querySelectorAll("[data-analysis-item]").length===3', 'previews for save')
  await setValue(review('weekly-1') + ' input[type=time]', '12:00', 1)
  await setValue(review('weekly-1') + ' input:not([type])', '근로(오전)')
  await button('다음')
  await click(review('weekly-3') + ' ~ label input')
  await button('다음')
  await button('전체 저장')
  await wait('document.querySelector("[role=alert]")?.textContent.includes("추정")', 'unconfirmed estimate blocks save')
  assert.equal(await evaluate(items + '.length'), 0)
  // A failed save jumps back to the item that needs attention.
  assert.ok(await evaluate('document.body.textContent.includes("2 / 3")'))
  await confirmTime('weekly-2')
  await button('다음')
  await button('전체 저장')
  await wait('document.body.textContent.includes("전체 저장 완료")', 'batch saved')
  const saved = await evaluate(items)
  assert.deepEqual(saved.map(row => [row.title, row.date, row.startTime, row.endTime, row.repeat]).sort((a, b) => a[1].localeCompare(b[1])), [['근로', '2026-10-15', '09:00', '18:00', 'weekly'], ['근로(오전)', '2026-10-20', '09:00', '12:00', 'weekly']])
  await navigate(base + '/schedule')
  for (const [day, has] of [['2026-10-27', true], ['2026-10-22', true], ['2026-10-23', false], ['2026-10-14', false], ['2026-10-13', false]]) {
    await wait(`document.querySelector(${q('button[aria-label="' + day + '"]')})`, 'calendar day ' + day)
    assert.equal(await evaluate(`document.querySelector(${q('button[aria-label="' + day + '"]')}).dataset.hasEvent`), String(has), day)
  }
  await click('button[aria-label="2026-10-27"]')
  await wait('document.body.textContent.includes("근로(오전)")', 'repeated Tuesday on calendar')
  console.log('PASS 4: edit, exclusion, estimate confirmation, batch save, weekly occurrences on calendar, no past or excluded days')

  // 5. Meridiem-less 3시~5시 is a visible estimate that must be confirmed.
  await reset('2026-10-15T10:00:00+09:00')
  await submit('내일 3시~5시 회의')
  await wait('document.querySelector("[data-analysis-item]")', 'ambiguous review')
  const ambiguous = await read('item-1')
  console.log('  3시~5시 preview:', JSON.stringify(ambiguous))
  assert.equal(ambiguous.confirm, true, '3시~5시 must ask for AM/PM confirmation')
  await button('확인 후 저장')
  await wait('document.querySelector("[role=alert]")', 'ambiguous save blocked')
  assert.equal(await evaluate(items + '.length'), 0)
  await confirmTime('item-1')
  await button('확인 후 저장')
  await wait(items + '.length===1', 'confirmed ambiguous save')
  console.log('PASS 5: 3시~5시 requires confirmation before save')

  // 6. Single and compound sentences keep their previous behaviour.
  await reset('2026-10-15T10:00:00+09:00')
  await submit('오늘 오후 3시 검증회의')
  await wait('document.querySelector("[data-analysis-item]")', 'single review')
  assert.equal(await evaluate('document.querySelectorAll("[data-analysis-item]").length'), 1)
  assert.deepEqual(await read('item-1'), { title: '검증회의', date: '2026-10-15', start: '15:00', end: '', repeat: 'none', confirm: false })
  await reset('2026-10-15T10:00:00+09:00')
  await submit('오늘 오후 3시부터 5시까지 회의')
  await wait('document.querySelector("[data-analysis-item]")', 'range review')
  assert.deepEqual(await read('item-1'), { title: '회의', date: '2026-10-15', start: '15:00', end: '17:00', repeat: 'none', confirm: true })
  await reset('2026-10-15T10:00:00+09:00')
  await submit('화요일 9-13시 회의, 목요일 오후 3시~5시 병원')
  await wait('document.querySelectorAll("[data-analysis-item]").length===2', 'two dated clauses')
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-analysis-item]")].map(n=>[n.querySelector("input:not([type])").value,n.querySelector("select[aria-label=반복]").value])'), [['회의', 'none'], ['병원', 'none']])
  await reset('2026-10-15T10:00:00+09:00')
  await submit('금요일까지 발표자료 만들기')
  await wait('document.querySelector("[data-analysis-item]")', 'deadline task review')
  assert.equal(await evaluate('document.querySelectorAll("[data-analysis-item]").length'), 1)
  assert.equal(await evaluate('document.querySelector("[data-analysis-item] select").value'), 'task')
  await reset('2026-10-15T10:00:00+09:00', '/')
  await submit('내일 오후 3시 회의하고 5시 운동')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).memos?.some(row=>row.body==="내일 오후 3시 회의하고 5시 운동")', 'compound sentence keeps offline memo fallback')
  assert.equal(await evaluate(items + '.length'), 0)
  console.log('PASS 6: single event, range, mixed dated clauses, deadline task, compound sentence fallback')

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await reset('2026-10-15T10:00:00+09:00')
  await submit(input)
  await wait('document.querySelectorAll("[data-analysis-item]").length===3', 'mobile previews')
  assert.ok(await evaluate('document.querySelector("[role=dialog]").getBoundingClientRect().width<=390'))
  await mkdir(resolve('.tmp/ai-tests'), { recursive: true })
  await writeFile(resolve('.tmp/ai-tests/weekly-timetable.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  console.log('PASS: mobile preview')

  // 7. Home: the estimate-free Tuesday saves as a weekly series on its own; the two 9to6 estimates wait in the chat panel.
  await send('Emulation.clearDeviceMetricsOverride')
  await reset('2026-10-15T10:00:00+09:00', '/')
  await submit(input)
  await wait('[...document.querySelectorAll("#home-chat-panel [data-chat-message]")].at(-1)?.dataset.chatStatus==="review"', 'home partial save')
  assert.deepEqual(await evaluate(items + '.map(row=>[row.title,row.date,row.startTime,row.endTime,row.repeat])'), [['근로', '2026-10-20', '09:00', '13:00', 'weekly']])
  await button('확인 후 저장')
  await wait('document.querySelectorAll("[data-analysis-item]").length===2', 'home review of the estimates')
  assert.equal(await evaluate(items + '.length'), 1, 'estimates wait for confirmation')
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS 7: home auto-saves the clear weekday and holds the estimates, no browser errors')
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-ai-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
