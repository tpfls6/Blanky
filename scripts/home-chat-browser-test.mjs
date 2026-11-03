import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.HOME_CHAT_TEST_URL ?? 'http://127.0.0.1:5187'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-home-chat-'))
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
const evidence = resolve('.audit/runs/home-chat-panel')
await mkdir(evidence, { recursive: true })
async function shot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(evidence, name + '.png'), Buffer.from(result.data, 'base64')) }
const steps = []

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('home-chat-seeded')) return
    const accounts = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
    localStorage.setItem('blanky.accounts.v1', JSON.stringify(accounts.map((id, index) => ({ id, name: 'T' + index, nickname: 'T' + index, email: 't' + index + '@example.test', password: 'test-only', avatar: null }))))
    localStorage.setItem('blanky.session.v1', accounts[0])
    for (const id of accounts) localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories: [], items: [], settings: { onboardingDone: true } }))
    localStorage.setItem('home-chat-seeded', '1')
  }).toString() + ')()' })
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home loaded')
  assert.equal(await evaluate(panelOpen), false, 'panel starts closed')
  const tomorrow = await evaluate('(()=>{const d=new Date();d.setDate(d.getDate()+1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")})()')

  // 1. Single event saves on its own and the panel opens.
  await say('내일 오후 3시 팀회의')
  await wait(lastStatus + ' === "saved"', 'single saved')
  assert.equal(await evaluate(panelOpen), true, 'panel opened after input')
  assert.deepEqual(await evaluate(items(owner) + '.map(i=>[i.title,i.date,i.startTime])'), [['팀회의', tomorrow, '15:00']])
  assert.ok(await evaluate(lastAssistant + '.querySelector("[data-work-chip]").textContent.includes("15:00")'))
  assert.equal(await evaluate('document.querySelectorAll("[data-analysis-item]").length'), 0, 'no analysis form under the input')
  steps.push('single')

  // 2. Several items in one request, an event and a task.
  await say('내일 오후 5시 회의, 금요일까지 과제 제출')
  await wait(lastStatus + ' === "saved"', 'multi saved')
  assert.equal(await evaluate(lastAssistant + '.querySelectorAll("[data-work-chip]").length'), 2)
  assert.deepEqual(await evaluate(items(owner) + '.map(i=>i.kind).sort()'), ['event', 'event', 'task'])
  steps.push('multi')

  // 3. A weekly series.
  await say('매주 월요일 10시 스터디')
  await wait(lastStatus + ' === "saved"', 'weekly saved')
  assert.equal(await evaluate(items(owner) + '.find(i=>i.title==="스터디").repeat'), 'weekly')
  assert.ok(await evaluate(lastAssistant + '.querySelector("[data-work-chip]").textContent.includes("매주")'))
  steps.push('repeat')

  // 4. An early hour without 오전·오후 waits; the review form saves the corrected time.
  await say('내일 3시 치과')
  await wait(lastStatus + ' === "review"', 'ambiguous waits')
  assert.equal(await evaluate(items(owner) + '.some(i=>i.title==="치과")'), false, 'ambiguous not saved')
  await button('확인 후 저장', '(' + lastAssistant + ')')
  await wait('document.querySelector("#home-chat-panel [data-analysis-item]")', 'review form')
  await fill('#home-chat-panel [data-analysis-item] input[type=time]', '15:00')
  await button('확인 후 저장', 'document.querySelector("#home-chat-panel [data-analysis-item]")')
  await wait(items(owner) + '.some(i=>i.title==="치과")', 'reviewed save')
  assert.equal(await evaluate(items(owner) + '.find(i=>i.title==="치과").startTime'), '15:00')
  await wait(lastStatus + ' === "saved"', 'review settled')
  steps.push('ambiguous')

  // 5. The same request again is a conflict: nothing saves until confirmed, and 저장 안 함 keeps it that way.
  const before = await evaluate(items(owner) + '.length')
  await say('내일 오후 3시 팀회의')
  await wait(lastStatus + ' === "review"', 'duplicate waits')
  assert.ok(await evaluate(lastAssistant + '.textContent.includes("이미 같은 일정")'))
  await button('저장 안 함', '(' + lastAssistant + ')')
  await wait(lastStatus + ' === "done"', 'duplicate dismissed')
  assert.equal(await evaluate(items(owner) + '.length'), before, 'duplicate not saved')
  steps.push('conflict')

  // 6. A delete request waits for 삭제.
  await say('치과 삭제해줘')
  await wait(lastStatus + ' === "confirm"', 'delete asks')
  assert.equal(await evaluate(items(owner) + '.some(i=>i.title==="치과")'), true, 'not deleted before confirm')
  await button('삭제', '(' + lastAssistant + ')')
  await wait('!' + items(owner) + '.some(i=>i.title==="치과")', 'deleted after confirm')
  steps.push('delete-confirm')

  // 7. A chip opens the schedule editor; the edit reaches storage and the chips; ESC closes the modal before the panel.
  const chip = title => '[...document.querySelectorAll("#home-chat-panel [data-work-chip]")].find(b=>!b.disabled&&b.textContent.includes(' + q(title) + '))'
  await evaluate(chip('팀회의') + '.focus()')
  await evaluate('document.activeElement.click()')
  await wait('document.querySelector("dialog[open][data-work-edit]")', 'edit dialog')
  await fill('dialog[open] form input:not([type])', '팀 회의 변경')
  await evaluate('document.querySelector("dialog[open] form").requestSubmit()')
  await wait('!document.querySelector("dialog[open]")', 'dialog closed after save')
  assert.equal(await evaluate(items(owner) + '.filter(i=>i.title==="팀 회의 변경").length'), 1)
  await wait(chip('팀 회의 변경'), 'chip shows edit')
  await wait('[...document.querySelectorAll("[data-home-calendar] [data-work-chip], [data-home-calendar] button")].length > 0', 'calendar rendered')
  await evaluate(chip('팀 회의 변경') + '.click()')
  await wait('document.querySelector("dialog[open][data-work-edit]")', 'edit dialog again')
  await key('Escape')
  await wait('!document.querySelector("dialog[open]")', 'ESC closed modal')
  assert.equal(await evaluate(panelOpen), true, 'ESC with modal open keeps the panel')
  assert.ok(await evaluate('document.activeElement?.hasAttribute("data-work-chip")'), 'focus back on chip')
  await key('Escape')
  await wait('!(' + panelOpen + ')', 'ESC closes panel')
  assert.equal(await evaluate('document.activeElement?.getAttribute("aria-controls")'), 'home-chat-panel', 'focus returns to 기록')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'history reopens')
  assert.equal(await evaluate('document.activeElement?.id'), 'home-chat-title', 'opening from 기록 moves focus into the panel')
  steps.push('edit-esc-focus')

  // 8. Chip delete through the editor and the shared confirm dialog.
  await evaluate(chip('스터디') + '.click()')
  await wait('document.querySelector("dialog[open][data-work-edit]")', 'edit dialog for delete')
  await button('삭제', 'document.querySelector("dialog[open][data-work-edit]")')
  await wait('document.querySelector("dialog.app-confirm-dialog[open]")', 'confirm dialog')
  await evaluate('document.querySelector("dialog.app-confirm-dialog .app-confirm-action").click()')
  await wait('!' + items(owner) + '.some(i=>i.title==="스터디")', 'chip delete reached storage')
  await wait('[...document.querySelectorAll("#home-chat-panel [data-work-chip]")].some(b=>b.disabled&&b.textContent.includes("스터디"))', 'deleted chip disabled')
  steps.push('chip-delete')
  await shot('01-desktop-panel')

  // 9. A save cut off by a reload comes back as a retry; retrying twice still leaves one copy.
  const retryId = '33333333-3333-4333-8333-333333333333'
  const interrupted = { id: 'interrupted', role: 'assistant', text: '분석했어요. 저장하는 중…', createdAt: new Date().toISOString(), status: 'working',
    retry: [{ id: retryId, kind: 'event', title: '재시도 일정', date: tomorrow, startTime: '19:00', endTime: null, description: '', status: 'todo', repeat: 'none', repeatDays: [] }] }
  const inject = row => evaluate('(()=>{const key="blanky.homeChat.' + owner + '";const rows=JSON.parse(localStorage.getItem(key));rows.push(' + JSON.stringify(row) + ');localStorage.setItem(key,JSON.stringify(rows))})()')
  for (const row of [interrupted, { ...interrupted, id: 'interrupted-2' }]) {
    await inject(row)
    await navigate()
    await wait('document.querySelector("#home-entry")', 'reloaded')
    assert.equal(await evaluate(panelOpen), false)
    await evaluate(history + '.click()')
    await wait(lastStatus + ' === "failed"', 'interrupted shows failed')
    await button('다시 시도', '(' + lastAssistant + ')')
    await wait(lastStatus + ' === "saved"', 'retry saved')
  }
  assert.equal(await evaluate(items(owner) + '.filter(i=>i.id===' + q(retryId) + ').length'), 1, 'retry is idempotent')
  steps.push('retry-idempotent')

  // 10. History survives reload; another account sees none of it, and switching back restores it.
  const ownMessages = await evaluate('document.querySelectorAll("#home-chat-panel [data-chat-message]").length')
  assert.ok(ownMessages >= 12, 'own history ' + ownMessages)
  await evaluate('localStorage.setItem("blanky.session.v1",' + q(other) + ')')
  await navigate()
  await wait('document.querySelector("#home-entry")', 'other account')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'other panel')
  assert.equal(await evaluate('document.querySelectorAll("#home-chat-panel [data-chat-message]").length'), 0, 'other account history empty')
  await evaluate('localStorage.setItem("blanky.session.v1",' + q(owner) + ')')
  await navigate()
  await wait('document.querySelector("#home-entry")', 'owner again')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'owner panel')
  assert.equal(await evaluate('document.querySelectorAll("#home-chat-panel [data-chat-message]").length'), ownMessages, 'owner history restored')
  steps.push('reload-account')

  // 11. Mobile: the panel slides over with a backdrop that closes it.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await navigate()
  await wait('document.querySelector("#home-entry")', 'mobile home')
  await say('모레 오후 2시 병원')
  await wait(lastStatus + ' === "review" || ' + lastStatus + ' === "saved"', 'mobile result')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#home-chat-panel")).position'), 'fixed')
  assert.ok(await evaluate('document.querySelector("#home-chat-panel").getBoundingClientRect().right <= 390.5'))
  assert.ok(await evaluate('document.documentElement.scrollWidth <= 391'), 'no horizontal scroll')
  await shot('02-mobile-panel')
  await evaluate('document.querySelector("#home-chat-panel").previousElementSibling.click()')
  await wait('!(' + panelOpen + ')', 'backdrop closes')
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
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-home-chat-')) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
