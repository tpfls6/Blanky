// Activity history delete E2E: real app in local mode, isolated account, disposable Chromium profile.
// Set SCHEDULE_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.SCHEDULE_TEST_URL ?? 'http://127.0.0.1:5241'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.SCHEDULE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set SCHEDULE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-activity-delete-test-'))
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
const owner = '11111111-1111-4111-8111-111111111111'
const library = `JSON.parse(localStorage.getItem('blanky.library.${owner}'))`
const items = `${library}.items`
const activities = `${library}.activities`
const seriesOf = key => evaluate(`${items}.filter(i=>(i.seriesId??i.id)===${q(key)}).sort((a,b)=>a.date.localeCompare(b.date)).map(i=>({date:i.date,repeat:i.repeat,repeatUntil:i.repeatUntil??null}))`)
const dialog = `document.querySelector('dialog[open][data-remove-record]')`
const shots = resolve('.tmp/activity-delete')
const shoot = async name => writeFile(join(shots, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
const openActivity = async () => { await navigate(base + '/activity'); await wait(`document.querySelector('#activity-panel li')`, 'activity list') }
const openRemove = async id => {
  await evaluate(`document.querySelector('[data-remove-activity=${q(id)}]').click()`)
  await wait(dialog, 'dialog ' + id)
}
const pickMode = index => evaluate(`${dialog}.querySelectorAll('input[name=remove-mode]')[${index}].click()`)
const pickScope = label => evaluate(`[...${dialog}.querySelectorAll('[role=radio]')].find(b=>b.textContent===${q(label)}).click()`)
const setDay = value => evaluate(`(()=>{const el=${dialog}.querySelector('input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${q(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
const confirm = () => evaluate(`${dialog}.querySelector('.app-confirm-action').click()`)
const dialogText = () => evaluate(`${dialog}.innerText`)

try {
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Seoul' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    const fixed = new Date('2026-11-04T10:30:00+09:00').getTime(); const NativeDate = Date
    window.Date = class extends NativeDate { constructor(...args) { if (args.length) super(...args); else super(fixed) } static now() { return fixed } }
  }).toString() + ')()' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('activity-seed')) return
    const id = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', id)
    const base = { description: '', priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, categoryId: null, kind: 'event', duration: null, repeatDays: [], repeat: 'none' }
    const items = [
      { ...base, id: 'single', title: '병원', date: '2026-11-09', startTime: '07:00', endTime: '08:00' },
      { ...base, id: 'task', title: '보고서 제출', kind: 'task', date: '2026-11-06', startTime: null, endTime: null, allDay: true, dueDate: '2026-11-06' },
      { ...base, id: 'gym', title: '헬스', date: '2026-11-02', startTime: '07:00', endTime: '08:00', repeat: 'weekly', repeatDays: [1, 3] },
      { ...base, id: 'standup', title: '스탠드업', date: '2026-10-01', startTime: '09:00', endTime: '09:15', repeat: 'daily' },
      { ...base, id: 'rent', title: '월세', kind: 'task', date: '2026-10-25', startTime: null, endTime: null, allDay: true, repeat: 'monthly' },
      { ...base, id: 'keep', title: '독서 모임', date: '2026-11-12', startTime: '19:00', endTime: '20:00' },
    ]
    const activities = items.map((item, index) => ({ id: 'act-' + item.id, entityId: item.id, action: 'created', source: 'manual', before: null, after: item, createdAt: new Date(Date.UTC(2026, 10, 3, 9, index)).toISOString() }))
    const gone = { ...base, id: 'gone', title: '취소된 회의', date: '2026-11-01', startTime: '10:00', endTime: '11:00' }
    activities.push({ id: 'act-gone', entityId: 'gone', action: 'deleted', source: 'manual', before: gone, after: null, createdAt: new Date(Date.UTC(2026, 10, 3, 8)).toISOString() })
    const memos = [{ id: 'memo1', title: '장보기', body: '우유', categoryId: null, tags: [], createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z' }]
    localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories: [], items, activities, memos, settings: {} }))
    localStorage.setItem('activity-seed', '1')
  }).toString() + ')()' })
  await mkdir(shots, { recursive: true })

  // Card layout: a trash button on every card, and clicking it never toggles the card open.
  await openActivity()
  assert.equal(await evaluate(`document.querySelectorAll('#activity-panel [data-remove-activity]').length`), 7)
  await openRemove('act-single')
  assert.equal(await evaluate(`document.querySelector('[data-remove-activity="act-single"]').closest('li').querySelector('[aria-expanded]').getAttribute('aria-expanded')`), 'false', 'trash click does not open the card')
  await shoot('01-desktop-dialog.png')
  assert.match(await dialogText(), /일정 삭제[\s\S]*이 기록만 삭제/)

  // Failure: the save throws, an error shows in the dialog and nothing changes.
  await evaluate(`window.__uuid = crypto.randomUUID.bind(crypto); crypto.randomUUID = () => { throw new Error('저장소 오류') }`)
  await confirm()
  await wait(`${dialog}?.querySelector('[role=alert]')`, 'failure alert')
  assert.match(await evaluate(`${dialog}.querySelector('[role=alert]').textContent`), /삭제하지 못했습니다\. 기존 데이터는 그대로 유지됩니다\. \(저장소 오류\)/)
  assert.equal(await evaluate(`${items}.some(i=>i.id==='single')`), true, 'item kept after failure')
  assert.equal(await evaluate(`${activities}.length`), 7, 'history kept after failure')
  await evaluate(`crypto.randomUUID = window.__uuid`)

  // 1) One-off event: deleted for real, moved to trash, history gains a "deleted" row.
  await confirm()
  await wait(`!${dialog} && !${items}.some(i=>i.id==='single')`, 'event deleted')
  assert.equal(await evaluate(`${library}.trash.some(t=>t.title==='병원')`), true, 'event in trash')
  assert.equal(await evaluate(`${activities}.filter(a=>a.entityId==='single').map(a=>a.action).sort().join()`), 'created,deleted')
  assert.match(await evaluate('document.body.innerText'), /'병원' 삭제를 완료했습니다/)

  // 2) Task: deleted for real.
  await openRemove('act-task')
  assert.match(await dialogText(), /할 일 삭제/)
  await confirm()
  await wait(`!${dialog} && !${items}.some(i=>i.id==='task')`, 'task deleted')

  // 3) Already deleted item (also the oldest row, still on page 1 here): only the record can go.
  await openRemove('act-gone')
  assert.equal(await evaluate(`${dialog}.querySelectorAll('input[name=remove-mode]').length`), 1)
  assert.match(await dialogText(), /이미 삭제되어 기록만/)
  await confirm()
  await wait(`!${dialog} && !${activities}.some(a=>a.id==='act-gone')`, 'gone record removed')

  // 4) Recurring: this one / this and later / all.
  await openRemove('act-gym')
  assert.equal(await evaluate(`${dialog}.querySelectorAll('[role=radio]').length`), 3, 'scope choices')
  await setDay('2026-11-10')
  await wait(`${dialog}.querySelector('.app-confirm-action').disabled`, 'non-occurrence blocks delete')
  assert.match(await dialogText(), /반복되지 않습니다/)
  await setDay('2026-11-09')
  await shoot('02-desktop-scope.png')
  await confirm()
  await wait(`!${dialog} && ${items}.filter(i=>(i.seriesId??i.id)==='gym').length===2`, 'gym this')
  assert.deepEqual(await seriesOf('gym'), [
    { date: '2026-11-02', repeat: 'weekly', repeatUntil: '2026-11-08' },
    { date: '2026-11-11', repeat: 'weekly', repeatUntil: null },
  ])
  await openRemove('act-standup')
  await pickScope('이후 전체'); await setDay('2026-11-10')
  await confirm()
  await wait(`!${dialog} && ${items}.find(i=>i.id==='standup')?.repeatUntil==='2026-11-09'`, 'standup future')
  await openRemove('act-rent')
  await pickScope('전체')
  assert.match(await dialogText(), /지난 반복을 포함한 전체/)
  await confirm()
  await wait(`!${dialog} && !${items}.some(i=>i.id==='rent')`, 'rent all')
  assert.equal(await evaluate(`${library}.trash.some(t=>t.title==='월세')`), true, 'series in trash')

  // 5) Record only: history row goes, the event stays.
  await openRemove('act-keep')
  await pickMode(1)
  await confirm()
  await wait(`!${dialog} && !${activities}.some(a=>a.id==='act-keep')`, 'record removed')
  assert.equal(await evaluate(`${items}.some(i=>i.id==='keep')`), true, 'event kept')
  assert.equal(await evaluate(`!!document.querySelector('[data-remove-activity="act-keep"]')`), false, 'list updated')

  // Other screens follow: the deleted task is off the schedule, memos untouched.
  await navigate(base + '/schedule')
  await wait(`document.body.innerText.includes('헬스') || document.body.innerText.includes('스탠드업')`, 'schedule loaded')
  assert.equal(/보고서 제출|병원/.test(await evaluate('document.body.innerText')), false, 'deleted items gone from schedule')
  assert.equal(await evaluate(`${library}.memos.some(m=>m.id==='memo1')`), true, 'memo untouched')

  // Regression: summary toggle and detail view still work.
  await openActivity()
  assert.equal(await evaluate(`!!document.querySelector('[data-remove-activity="act-keep"]')`), false, 'record-only delete survives reload')
  await evaluate(`document.querySelector('#activity-panel li [aria-expanded]').click()`)
  await wait(`document.querySelector('#activity-panel li [aria-expanded=true]')`, 'card opens')
  await evaluate(`document.getElementById('activity-tab-detail').click()`)
  await wait(`document.querySelectorAll('#activity-panel [data-remove-activity]').length && !document.querySelector('#activity-panel [aria-expanded]')`, 'detail view')

  // Mobile: button fits, no horizontal scroll, dialog works and cancel keeps data.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await openActivity()
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'), true, 'mobile list fits')
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('#activity-panel [data-remove-activity]').getBoundingClientRect();return r.right<=window.innerWidth&&r.width>=24})()`), true, 'mobile trash visible')
  await shoot('03-mobile-list.png')
  const target = await evaluate(`[...document.querySelectorAll('[data-remove-activity]')].find(b=>b.getAttribute('aria-label').includes('헬스')).dataset.removeActivity`)
  await openRemove(target)
  await shoot('04-mobile-dialog.png')
  assert.equal(await evaluate(`(()=>{const r=${dialog}.getBoundingClientRect();return r.left>=0&&r.right<=window.innerWidth})()`), true, 'mobile dialog fits')
  await evaluate(`${dialog}.querySelector('.btn-ghost').click()`)
  await wait(`!${dialog}`, 'cancel closes')
  assert.equal(await evaluate(`${items}.filter(i=>(i.seriesId??i.id)==='gym').length`), 2, 'cancel keeps data')

  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: activity delete — event, task, recurring this/future/all, record-only, gone item, failure keeps data, schedule sync, toggle/detail regression, mobile.')
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-activity-delete-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
