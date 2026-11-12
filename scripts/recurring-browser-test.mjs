// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.SCHEDULE_TEST_URL ?? 'http://127.0.0.1:5186'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.SCHEDULE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set SCHEDULE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-recurring-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''; server.stdout.on('data', data => { serverOutput += data }); server.stderr.on('data', data => { serverOutput += data })
for (let i=0; i<300; i++) { try { const res = await fetch(base); if(res.ok) break } catch {} await new Promise(r=>setTimeout(r,100)); if(i===299) throw new Error(serverOutput) }
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
const diagnostics = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === "Page.loadEventFired" && loadResolve) { loadResolve(); loadResolve = null }
  if (message.method === 'Network.loadingFailed' || message.method === 'Runtime.consoleAPICalled') diagnostics.push(message)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? ''))
  const pair = pending.get(message.id)
  if (pair) { pending.delete(message.id); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).catch(error => { throw new Error(error.message + ' in: ' + expression.slice(0, 160)) })
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
async function wait(expression, label) { for (let i = 0; i < 300; i++) { if (await evaluate('!!(' + expression + ')')) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner
const items = `JSON.parse(localStorage.getItem(${q(library)})).items`
const row = id => evaluate(`${items}.find(i=>i.id===${q(id)})`)
const series = title => evaluate(`${items}.filter(i=>i.title===${q(title)}).sort((a,b)=>a.date.localeCompare(b.date)).map(i=>({date:i.date,startTime:i.startTime,repeat:i.repeat,repeatDays:i.repeatDays,repeatUntil:i.repeatUntil??null,endDate:i.endDate}))`)
const setValue = (finder, value, proto = 'HTMLInputElement', event = 'input') => evaluate(`(()=>{const el=${finder};Object.getOwnPropertyDescriptor(${proto}.prototype,'value').set.call(el,${q(value)});el.dispatchEvent(new Event(${q(event)},{bubbles:true}))})()`)
const setSelect = (label, value) => setValue(`document.querySelector('select[aria-label=${q(label)}]')`, value, 'HTMLSelectElement', 'change')
const field = label => `[...document.querySelectorAll('label')].find(l=>l.firstChild?.textContent===${q(label)})?.querySelector('input')`
const setField = (label, value) => setValue(field(label), value)
const scope = label => evaluate(`[...document.querySelectorAll('[role=radiogroup][aria-label="수정 범위"] button')].find(b=>b.textContent===${q(label)}).click()`)
const save = () => evaluate(`document.querySelector('section[aria-label="반복 일정 수정"] button[type=submit]').click()`)
const confirmDelete = async label => {
  await button('삭제'); await wait(`document.querySelector('dialog[open]')`, 'confirm ' + label)
  await evaluate(`document.querySelector('dialog[open] .app-confirm-action').click()`)
}
const openSeries = async (id, date) => {
  await navigate(base + '/schedule/recurring?id=' + id + (date ? '&date=' + date : ''))
  await wait(`document.querySelector('section[aria-label="반복 일정 수정"] form')`, 'editor ' + id)
}
const listRows = `[...document.querySelectorAll('section[aria-label="반복 일정 목록"] li')]`
const shots = resolve('.tmp/recurring-series')
const shoot = async (name, full = true) => writeFile(join(shots, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full })).data, 'base64'))

try {
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Seoul' })
  // Today is Wednesday 2026-11-04.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    const fixed = new Date('2026-11-04T10:30:00+09:00').getTime(); const NativeDate = Date
    window.Date = class extends NativeDate { constructor(...args) { if (args.length) super(...args); else super(fixed) } static now() { return fixed } }
  }).toString() + ')()' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('recurring-seed')) return
    const id = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', id)
    const base = { description: '', priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, categoryId: null, kind: 'event', duration: null, repeatDays: [] }
    const items = [
      { ...base, id: 'gym', title: '헬스', date: '2026-11-02', startTime: '07:00', endTime: '08:00', repeat: 'weekly', repeatDays: [1, 3], categoryId: 'health' },
      { ...base, id: 'standup', title: '스탠드업', date: '2026-10-01', startTime: '09:00', endTime: '09:15', repeat: 'daily' },
      { ...base, id: 'rent', title: '월세', date: '2026-10-25', startTime: null, endTime: null, allDay: true, repeat: 'monthly' },
      { ...base, id: 'old', title: '지난 스터디', date: '2026-09-01', startTime: '20:00', endTime: '21:00', repeat: 'weekly', repeatDays: [2], repeatUntil: '2026-10-01' },
      { ...base, id: 'single', title: '병원', date: '2026-11-09', startTime: '07:00', endTime: '08:00', repeat: 'none' },
    ]
    localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories: [{ id: 'health', name: '건강', parentId: null, color: '#3a9a6a' }], items, settings: {} }))
    localStorage.setItem('recurring-seed', '1')
  }).toString() + ')()' })
  await mkdir(shots, { recursive: true })

  // Entry point from the existing schedule page: the link sits in the draft sheet's header on desktop.
  await navigate(base + '/schedule')
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='직접 추가')`, 'add button')
  await button('직접 추가')
  await wait(`[...document.querySelectorAll('a')].some(a=>a.textContent==='반복 일정')`, 'schedule link')
  await evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent==='반복 일정').click()`)
  await wait(`location.pathname==='/schedule/recurring' && ${listRows}.length===3`, 'list')
  const list = await evaluate(`${listRows}.map(li=>li.innerText.replace(/\\s+/g,' ').trim())`)
  assert.match(list[1], /^스탠드업 다음 11\/4 \(수\) 매일 · 09:00–09:15 2026-10-01 ~ 종료일 없음 · 미분류$/, list[1])
  assert.match(list[0], /^헬스 다음 11\/4 \(수\) 매주 월·수 · 07:00–08:00 2026-11-02 ~ 종료일 없음 · 건강$/, list[0])
  assert.match(list[2], /^월세 다음 11\/25 \(수\) 매월 25일 · 종일/, list[2])
  assert.equal(list.some(text => text.includes('병원')), false, 'one-off item is not listed')
  await button('종료'); await wait(`${listRows}.length===1`, 'ended filter')
  assert.match(await evaluate(`${listRows}[0].innerText`), /지난 스터디[\s\S]*종료됨[\s\S]*2026-09-01 ~ 2026-10-01/)
  await button('진행 중'); await wait(`${listRows}.length===3`, 'active filter')

  // 1) This occurrence only: 11/9 gym moves to 18:00, everything else untouched.
  await evaluate(`${listRows}.find(li=>li.innerText.trim().startsWith('헬스')).querySelector('button').click()`)
  await wait(`new URLSearchParams(location.search).get('id')==='gym' && document.querySelector('section[aria-label="반복 일정 수정"] h2')?.textContent==='헬스'`, 'select gym')
  await scope('이번 일정만'); await setSelect('기준 일정', '2026-11-09')
  assert.equal(await evaluate(`document.querySelector('section[aria-label="반복 일정 수정"] fieldset').disabled`), true, 'rule locked for a single occurrence')
  await setField('시작', '18:00'); await setField('종료', '19:00')
  await wait(`document.querySelector('[data-status=changed]')`, 'preview')
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('section[aria-label="적용 미리보기"] li')].slice(0,3).map(li=>li.dataset.status+':'+li.firstChild.textContent)`), ['changed:11/9 (월)', 'same:11/11 (수)', 'same:11/16 (월)'])
  await shoot('desktop-this.png')
  await save()
  await wait(`${items}.filter(i=>i.title==='헬스').length===3`, 'this saved')
  assert.deepEqual(await series('헬스'), [
    { date: '2026-11-02', startTime: '07:00', repeat: 'weekly', repeatDays: [1, 3], repeatUntil: '2026-11-08', endDate: null },
    { date: '2026-11-09', startTime: '18:00', repeat: 'none', repeatDays: [], repeatUntil: null, endDate: null },
    { date: '2026-11-11', startTime: '07:00', repeat: 'weekly', repeatDays: [1, 3], repeatUntil: null, endDate: null },
  ])
  // The split reads as one series: one list row with a change summary, and a timeline in the editor.
  await wait(`${listRows}.filter(li=>li.innerText.includes('헬스')).length===1 && document.querySelectorAll('section[aria-label="반복 구간"] li').length===3`, 'gym grouped')
  assert.match(await evaluate(`${listRows}.find(li=>li.innerText.includes('헬스')).querySelector('[data-series-changes]').textContent`), /^개별 변경 1건$/)
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('section[aria-label="반복 구간"] li')].map(li=>li.dataset.segment+':'+li.innerText.replace(/\\s+/g,' ').trim())`), [
    'rule:11/2 (월) ~ 11/8 (일) 매주 월·수 · 07:00–08:00 수정 중',
    'single:11/9 (월) 이 날만 · 18:00–19:00 개별 변경',
    'rule:11/11 (수) ~ 계속 매주 월·수 · 07:00–08:00',
  ])
  await shoot('desktop-grouped.png')

  // 2) From this occurrence on: standup from 11/10 becomes Mon/Wed/Fri 10:00 and ends 11/30.
  await openSeries('standup')
  await scope('이번 일정부터 이후'); await setSelect('기준 일정', '2026-11-10')
  await setSelect('반복', 'weekly'); await wait(`document.querySelector('[role=group][aria-label="반복 요일"]')`, 'weekday chips')
  for (const day of ['월', '수', '금']) await evaluate(`document.querySelector('[aria-label="${day}요일 반복"][aria-pressed=false]')?.click()`)
  await evaluate(`document.querySelector('[aria-label="화요일 반복"][aria-pressed=true]')?.click()`)
  await setField('시작', '10:00'); await setField('종료', '10:15')
  await evaluate(`[...document.querySelectorAll('label')].find(l=>l.textContent==='종료일 없음').querySelector('input').click()`)
  await setValue(`document.querySelector('input[aria-label=종료일]')`, '2026-11-30')
  await wait(`document.querySelector('[data-status=removed]')`, 'future preview')
  await shoot('desktop-future.png')
  await save()
  await wait(`${items}.filter(i=>i.title==='스탠드업').length===2`, 'future saved')
  assert.deepEqual(await series('스탠드업'), [
    { date: '2026-10-01', startTime: '09:00', repeat: 'daily', repeatDays: [], repeatUntil: '2026-11-09', endDate: null },
    { date: '2026-11-10', startTime: '10:00', repeat: 'weekly', repeatDays: [1, 3, 5], repeatUntil: '2026-11-30', endDate: null },
  ])
  await wait(`${listRows}.filter(li=>li.innerText.includes('스탠드업')).length===1`, 'standup grouped')
  assert.match(await evaluate(`${listRows}.find(li=>li.innerText.includes('스탠드업')).innerText`), /2026-10-01 ~ 2026-11-30[\s\S]*규칙 변경 1회/)

  // Whole-series edit on a split series reaches both periods.
  await openSeries('standup'); await scope('전체 반복 일정'); await setField('제목', '데일리')
  await wait(`document.querySelectorAll('section[aria-label="적용 미리보기"] [data-status=changed]').length>0`, 'group preview')
  await save(); await wait(`${items}.filter(i=>i.title==='데일리').length===2`, 'group all saved')
  assert.deepEqual((await series('데일리')).map(row => row.startTime), ['09:00', '10:00'], 'each period keeps its own time')

  // 3) Whole series: rename the rent in place, same row id.
  await openSeries('rent')
  await scope('전체 반복 일정'); await setField('제목', '관리비')
  await save(); await wait(`${items}.find(i=>i.id==='rent')?.title==='관리비'`, 'all saved')
  assert.equal((await row('rent')).date, '2026-10-25')

  // 4) Deletes by scope. Opening with a date (the daily-board link) starts on "this occurrence".
  const continuation = await evaluate(`${items}.find(i=>i.title==='헬스'&&i.date==='2026-11-11').id`)
  await openSeries(continuation, '2026-11-11')
  assert.equal(await evaluate(`document.querySelector('[role=radiogroup][aria-label="수정 범위"] [aria-checked=true]').textContent`), '이번 일정만')
  await confirmDelete('this')
  await wait(`${items}.find(i=>i.id===${q(continuation)})?.date==='2026-11-16'`, 'this deleted (start moved)')
  await openSeries(continuation, '2026-11-23')
  await scope('이번 일정부터 이후'); await confirmDelete('future')
  await wait(`${items}.find(i=>i.id===${q(continuation)})?.repeatUntil==='2026-11-22'`, 'future deleted')
  await openSeries('old'); await scope('전체 반복 일정'); await confirmDelete('all')
  await wait(`!${items}.some(i=>i.id==='old') && JSON.parse(localStorage.getItem(${q(library)})).trash?.some(t=>t.title==='지난 스터디')`, 'all deleted to trash')

  // The untouched one-off row keeps its exact data.
  // calendarId/createdByUserId are the existing legacy-load normalization; no recurrence field is added.
  const { calendarId, createdByUserId, ...single } = await row('single')
  assert.ok(calendarId && createdByUserId)
  assert.deepEqual(single, { description: '', priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, categoryId: null, kind: 'event', duration: null, repeatDays: [], id: 'single', title: '병원', date: '2026-11-09', startTime: '07:00', endTime: '08:00', repeat: 'none' })

  // Mobile: list → editor → back, no horizontal overflow.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await navigate(base + '/schedule/recurring')
  await wait(`${listRows}.length>0`, 'mobile list')
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'), true, 'mobile list fits')
  await shoot('mobile-list.png', false)
  await evaluate(`${listRows}[0].querySelector('button').click()`)
  await wait(`document.querySelector('section[aria-label="반복 일정 수정"] form') && getComputedStyle(document.querySelector('section[aria-label="반복 일정 목록"]')).display==='none'`, 'mobile editor only')
  await scope('이번 일정부터 이후'); await setField('시작', '06:30')
  await wait(`document.querySelector('[data-status=changed]')`, 'mobile preview')
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'), true, 'mobile editor fits')
  await shoot('mobile-editor.png')
  await evaluate(`document.querySelector('button[aria-label="목록으로"]').click()`)
  await wait(`getComputedStyle(document.querySelector('section[aria-label="반복 일정 목록"]')).display!=='none'`, 'back to list')

  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: recurring list/filters, this/future/all edits and deletes with preview, untouched one-off rows, schedule entry link, mobile list/editor.')
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-recurring-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
