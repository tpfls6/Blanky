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
// A real pointer press, so the page gets user activation (Chrome only honours history entries pushed after one).
async function tap(expression) {
  const point = await evaluate('(()=>{const r=(' + expression + ').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 })
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
const evidence = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'home-chat-panel')
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
    // Page tours are done too: the memo tour would otherwise return the page to its list on arrival.
    for (const id of accounts) localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories: [], items: [], settings: { onboardingDone: true, onboardingPages: ['memo', 'diary', 'reading'] } }))
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
  // A saved result is a row with 보기 and 삭제 only.
  assert.ok(await evaluate(lastAssistant + '.querySelector("[data-saved-row]").textContent.includes("15:00")'))
  assert.deepEqual(await evaluate('[...' + lastAssistant + '.querySelectorAll("[data-saved-row] button")].map(b=>b.textContent.trim())'), ['보기', '삭제'])
  assert.equal(await evaluate('document.querySelectorAll("[data-analysis-item]").length'), 0, 'no analysis form under the input')
  steps.push('single')

  // 2. Several items in one request, an event and a task.
  await say('내일 오후 5시 회의, 금요일까지 과제 제출')
  await wait(lastStatus + ' === "saved"', 'multi saved')
  assert.equal(await evaluate(lastAssistant + '.querySelectorAll("[data-saved-row]").length'), 2, 'one row per saved item')
  assert.deepEqual(await evaluate(items(owner) + '.map(i=>i.kind).sort()'), ['event', 'event', 'task'])
  steps.push('multi')

  // 3. A weekly series.
  await say('매주 월요일 10시 스터디')
  await wait(lastStatus + ' === "saved"', 'weekly saved')
  assert.equal(await evaluate(items(owner) + '.find(i=>i.title==="스터디").repeat'), 'weekly')
  assert.ok(await evaluate(lastAssistant + '.querySelector("[data-saved-row]").textContent.includes("매주")'))
  steps.push('repeat')

  // 4. An early hour without 오전·오후 waits; the review form saves the corrected time.
  await say('내일 3시 치과')
  await wait(lastStatus + ' === "review"', 'ambiguous waits')
  assert.equal(await evaluate(items(owner) + '.some(i=>i.title==="치과")'), false, 'ambiguous not saved')
  await button('확인 후 저장', '(' + lastAssistant + ')')
  await wait('document.querySelector("#home-chat-panel [data-analysis-item]")', 'review form')
  await fill('#home-chat-panel [data-analysis-item] input[type=time]', '15:00')
  // A single item saves from the review dialog's footer, outside the item fieldset.
  await button('확인 후 저장', 'document.querySelector("dialog[data-analysis-review]")')
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

  // 7. 보기 opens the schedule editor; the edit reaches storage and the rows; ESC closes the modal before the panel.
  const savedRow = title => '[...document.querySelectorAll("#home-chat-panel [data-saved-row][data-saved-state=saved]")].find(li=>li.textContent.includes(' + q(title) + '))'
  const chip = title => savedRow(title) + '?.querySelector(".home-saved-view")'
  await evaluate(chip('팀회의') + '.focus()')
  await evaluate('document.activeElement.click()')
  await wait('document.querySelector("dialog[open][data-work-edit]")', 'edit dialog')
  await fill('dialog[open] form input:not([type])', '팀 회의 변경')
  await evaluate('document.querySelector("dialog[open] form").requestSubmit()')
  await wait('!document.querySelector("dialog[open]")', 'dialog closed after save')
  assert.equal(await evaluate(items(owner) + '.filter(i=>i.title==="팀 회의 변경").length'), 1)
  await wait(chip('팀 회의 변경'), 'chip shows edit')
  await evaluate(chip('팀 회의 변경') + '.click()')
  await wait('document.querySelector("dialog[open][data-work-edit]")', 'edit dialog again')
  await key('Escape')
  await wait('!document.querySelector("dialog[open]")', 'ESC closed modal')
  assert.equal(await evaluate(panelOpen), true, 'ESC with modal open keeps the panel')
  assert.ok(await evaluate('document.activeElement?.classList.contains("home-saved-view")'), 'focus back on 보기')
  await key('Escape')
  await wait('!(' + panelOpen + ')', 'ESC closes panel')
  assert.equal(await evaluate('document.activeElement?.getAttribute("aria-controls")'), 'home-chat-panel', 'focus returns to 기록')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'history reopens')
  assert.equal(await evaluate('document.activeElement?.id'), 'home-chat-title', 'opening from 기록 moves focus into the panel')
  steps.push('edit-esc-focus')

  // 8. Delete through the editor and the shared confirm dialog; the row then reads 삭제됨.
  await evaluate(chip('스터디') + '.click()')
  await wait('document.querySelector("dialog[open][data-work-edit]")', 'edit dialog for delete')
  await button('삭제', 'document.querySelector("dialog[open][data-work-edit]")')
  await wait('document.querySelector("dialog.app-confirm-dialog[open]")', 'confirm dialog')
  await evaluate('document.querySelector("dialog.app-confirm-dialog .app-confirm-action").click()')
  await wait('!' + items(owner) + '.some(i=>i.title==="스터디")', 'chip delete reached storage')
  await wait('[...document.querySelectorAll("#home-chat-panel [data-saved-row][data-saved-state=deleted]")].some(li=>li.textContent.includes("스터디"))', 'deleted row marked')
  steps.push('chip-delete')

  // 8b. 삭제 on one of several saved items removes only that one, from storage too, and the row reads 삭제됨.
  const deleteRow = title => evaluate('(()=>{const b=' + savedRow(title) + '?.querySelector("button:not(.home-saved-view)");if(!b)return false;b.focus();b.click();return true})()')
  await evaluate('(' + savedRow('과제') + ').closest("[data-chat-message]").setAttribute("data-test-multi","")')
  const itemCount = await evaluate(items(owner) + '.length')
  assert.ok(await deleteRow('과제'), 'task row has 삭제')
  await wait('!' + items(owner) + '.some(i=>i.title.includes("과제"))', 'row delete reached storage')
  await wait('[...document.querySelectorAll("#home-chat-panel [data-saved-row][data-saved-state=deleted]")].some(li=>li.textContent.includes("과제"))', 'row reads 삭제됨')
  assert.equal(await evaluate('document.activeElement?.textContent.trim()'), '삭제됨', 'focus stays on the button, now 삭제됨')
  assert.equal(await evaluate('document.activeElement?.getAttribute("aria-disabled")'), 'true')
  assert.equal(await evaluate(items(owner) + '.length'), itemCount - 1, 'only that item is deleted')
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-test-multi] [data-saved-row]")].map(li=>li.dataset.savedState).sort()'), ['deleted', 'saved'], 'the other row from the same message keeps 보기 and 삭제')
  assert.ok(await evaluate('JSON.parse(localStorage.getItem("blanky.library.' + owner + '")).trash.some(t=>t.title.includes("과제"))'), 'deleted item is in the trash')
  steps.push('row-delete')

  // 8c. Memo, diary and reading captures save on their own and get the same rows.
  const library = 'JSON.parse(localStorage.getItem("blanky.library.' + owner + '"))'
  await say('블로그 아이디어 메모 여행 사진 정리')
  await wait(lastAssistant + '?.querySelector("[data-saved-row]")', 'memo row')
  const memoId = await evaluate(lastAssistant + '.querySelector("[data-saved-row]").dataset.savedRow')
  assert.ok(await evaluate(library + '.memos.some(m=>m.id===' + q(memoId) + ')'), 'row names the stored memo')
  assert.ok(await deleteRow('블로그'), 'memo row has 삭제')
  await wait('!' + library + '.memos.some(m=>m.id===' + q(memoId) + ')', 'memo deleted')
  await wait(lastAssistant + '.querySelector("[data-saved-row]").dataset.savedState === "deleted"', 'memo row 삭제됨')
  await say('노르웨이의 숲 130페이지까지 읽음')
  await wait(lastAssistant + '?.querySelector("[data-saved-row]")', 'reading row')
  const logId = await evaluate(lastAssistant + '.querySelector("[data-saved-row]").dataset.savedRow')
  assert.ok(await evaluate(library + '.logs.some(l=>l.id===' + q(logId) + ')'), 'row names the stored reading log')
  assert.ok(await deleteRow('노르웨이'), 'reading row has 삭제')
  // The log goes; the book it started stays (back at page 0) and nothing goes to the trash.
  await wait('!' + library + '.logs.some(l=>l.id===' + q(logId) + ')', 'reading log deleted')
  assert.deepEqual(await evaluate('(b=>b&&[b.status,b.currentPage])(' + library + '.books.find(b=>b.title.includes("노르웨이")))'), ['reading', 0], 'the book it started stays')
  assert.equal(await evaluate(library + '.trash.some(t=>t.title.includes("노르웨이"))'), false, 'the book is not in the trash')
  await say('블로그 아이디어 메모 홈 화면 문구')
  await wait(lastAssistant + '?.querySelector("[data-saved-row]")', 'second memo row')
  const memoTwo = await evaluate(lastAssistant + '.querySelector("[data-saved-row]").dataset.savedRow')
  await shot('01-desktop-panel')
  await evaluate(chip('블로그') + '.click()')
  await wait('location.pathname === "/memo"', '보기 opens the memo page')
  await wait('document.querySelector("input.memo-title")?.value.includes("홈 화면 문구")', 'the saved memo is selected')
  assert.ok(await evaluate(library + '.memos.some(m=>m.id===' + q(memoTwo) + ')'))
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'back home')
  await say('오늘 날씨가 좋아서 기분이 좋았다')
  await wait(lastAssistant + '?.querySelector("[data-saved-row]")', 'diary row')
  const diaryId = await evaluate(lastAssistant + '.querySelector("[data-saved-row]").dataset.savedRow')
  await evaluate(lastAssistant + '.querySelector(".home-saved-view").click()')
  await wait('location.pathname === "/diary" && document.querySelector(".diary-editor-open")', '보기 opens the diary editor')
  assert.ok(await evaluate(library + '.diaries.some(d=>d.id===' + q(diaryId) + ')'))
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'back home after diary')
  steps.push('records')

  // 8d. Changing a saved event: the created row keeps 보기 and 삭제, the change row offers 보기 only,
  //     and changing the same event again still leaves one change row (also after a reload).
  await say('내일 오후 6시 디자인 리뷰')
  await wait(lastStatus + ' === "saved"', 'club saved')
  const clubId = await evaluate(lastAssistant + '.querySelector("[data-saved-row]").dataset.savedRow')
  const clubRows = '[...document.querySelectorAll(' + q('#home-chat-panel [data-saved-row="' + clubId + '"]') + ')]'
  const clubButtons = 'JSON.stringify(' + clubRows + '.map(li=>[li.hasAttribute("data-saved-change"),[...li.querySelectorAll("button")].map(b=>b.textContent.trim())]))'
  const change = async (text, time) => {
    await say(text)
    await wait(lastStatus + ' === "saved" || ' + lastStatus + ' === "confirm"', 'change answered: ' + text)
    if (await evaluate(lastStatus + ' === "confirm"')) { await button('실행', '(' + lastAssistant + ')'); await wait(lastStatus + ' === "saved"', 'change ran') }
    await wait(items(owner) + '.find(i=>i.id===' + q(clubId) + ')?.startTime === ' + q(time), 'change stored ' + time)
  }
  await change('디자인 리뷰 오후 7시로 바꿔줘', '19:00')
  assert.equal(await evaluate(clubButtons), JSON.stringify([[false, ['보기', '삭제']], [true, ['보기']]]), 'change row has 보기 only')
  await change('디자인 리뷰 오후 8시로 바꿔줘', '20:00')
  assert.equal(await evaluate(clubButtons), JSON.stringify([[false, ['보기', '삭제']], [true, ['보기']]]), 'changing again keeps one change row')
  assert.ok(await evaluate('Boolean(' + lastAssistant + '.querySelector(' + q('[data-saved-row="' + clubId + '"][data-saved-change]') + '))'), 'the change row sits under the latest change')
  await evaluate(lastAssistant + '.querySelector(".home-saved-view").click()')
  await wait('document.querySelector("dialog[open][data-work-edit]")', 'change row 보기 opens the editor')
  await key('Escape')
  await wait('!document.querySelector("dialog[open]")', 'editor closed')
  await navigate()
  await wait('document.querySelector("#home-entry")', 'reload after changes')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'panel after reload')
  assert.equal(await evaluate(clubButtons), JSON.stringify([[false, ['보기', '삭제']], [true, ['보기']]]), 'saved history keeps one change row with 보기 only')
  assert.equal(await evaluate(items(owner) + '.filter(i=>i.id===' + q(clubId) + ').length'), 1, 'the original event is still there')
  // The created row shows the event as it is now (20:00), not as it was created (18:00); its 보기 and 삭제 act on it.
  const createdRow = clubRows + '.find(li=>!li.hasAttribute("data-saved-change"))'
  assert.ok(await evaluate(createdRow + '.textContent.includes("20:00") && !' + createdRow + '.textContent.includes("18:00")'), 'created row shows the latest time: ' + await evaluate(createdRow + '.textContent'))
  await evaluate(createdRow + '.querySelector(".home-saved-view").click()')
  await wait('document.querySelector("dialog[open][data-work-edit]")', 'created row 보기 opens the editor')
  assert.ok(await evaluate('[...document.querySelectorAll("dialog[open] input[type=time]")].some(i=>i.value==="20:00")'), 'the editor holds the changed time')
  await key('Escape')
  await wait('!document.querySelector("dialog[open]")', 'editor closed again')
  await evaluate(createdRow + '.querySelector("button:not(.home-saved-view)").click()')
  await wait('!' + items(owner) + '.some(i=>i.id===' + q(clubId) + ')', 'created row 삭제 removes the changed event')
  await wait(clubRows + '.every(li=>li.dataset.savedState==="deleted")', 'created and change rows read 삭제됨')
  steps.push('change-rows')

  // 8e. A reading log's 보기 opens that book's detail; deleting a later log returns the book to the earlier page.
  await say('데미안 50페이지까지 읽음')
  await wait(lastAssistant + '?.querySelector("[data-saved-row]")', 'demian row')
  await evaluate(lastAssistant + '.querySelector(".home-saved-view").click()')
  await wait('/^\\/reading\\/[^/]+$/.test(location.pathname) && document.querySelector(".reading-detail h2")?.textContent.includes("데미안")', '보기 opens the book detail')
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'back home after reading')
  const demian = library + '.books.find(b=>b.title.includes("데미안"))'
  await say('데미안 120페이지까지 읽음')
  await wait(lastAssistant + '?.querySelector("[data-saved-row]")', 'second demian row')
  assert.equal(await evaluate(demian + '.currentPage'), 120)
  assert.ok(await evaluate('(()=>{const b=' + lastAssistant + '.querySelector("[data-saved-row] button:not(.home-saved-view)");if(!b)return false;b.click();return true})()'), 'second reading row has 삭제')
  await wait(lastAssistant + '.querySelector("[data-saved-row]").dataset.savedState === "deleted"', 'second log deleted')
  assert.equal(await evaluate(demian + '.currentPage'), 50, 'progress follows the log that is left')
  // Reading rows name the page that log recorded, also once deleted.
  const demianRows = '[...document.querySelectorAll("#home-chat-panel [data-saved-row]")].filter(li=>li.textContent.includes("데미안"))'
  assert.deepEqual(await evaluate(demianRows + '.map(li=>li.querySelector("p").textContent.trim())'), ['독서 기록 데미안 · 50쪽', '독서 기록 데미안 · 120쪽'])
  steps.push('reading-view-progress')

  // 8f. Deleting a book's logs in either order, in quick succession, or while the reading library is
  //     importing the book, always lands on the page the book had before them.
  const momo = library + '.books.find(b=>b.title==="모모")'
  const momoCopy = '(JSON.parse(localStorage.getItem("blanky.reading.v1.' + owner + '"))?.books ?? []).find(b=>b.book.title==="모모")'
  const momoRow = page => '[...document.querySelectorAll("#home-chat-panel [data-saved-row]")].filter(li=>li.textContent.includes("모모 · ' + page + '쪽")).at(-1)'
  const momoDelete = page => momoRow(page) + '.querySelector("button:not(.home-saved-view)")'
  const momoDeleted = async page => { await evaluate(momoDelete(page) + '.click()'); await wait(momoRow(page) + '.dataset.savedState === "deleted"', 'deleted ' + page) }
  for (const page of [10, 50, 120]) await say('모모 ' + page + '페이지까지 읽음')
  await wait(momoRow(120), 'momo rows')
  await momoDeleted(50)
  assert.equal(await evaluate(momo + '.currentPage'), 120, 'a log below the page changes nothing')
  await momoDeleted(120)
  assert.equal(await evaluate(momo + '.currentPage'), 10, '50 then 120 ends where 120 then 50 does')
  for (const page of [60, 90]) await say('모모 ' + page + '페이지까지 읽음')
  await wait(momoRow(90), 'momo rows again')
  // The second 삭제 lands while the first runs (ignored) and again the moment the row is enabled.
  assert.ok(await evaluate('(async()=>{const first=' + momoDelete(90) + ',second=' + momoDelete(60) + ';first.click();second.click();for(let i=0;i<400;i++){await new Promise(r=>setTimeout(r,0));if(second.getAttribute("aria-disabled")!=="true"){second.click();return true}}return false})()'), 'second 삭제 ran')
  await wait(momoRow(60) + '.dataset.savedState === "deleted" && ' + momoRow(90) + '.dataset.savedState === "deleted"', 'quick deletes settled')
  assert.equal(await evaluate(momo + '.currentPage'), 10, 'quick deletes end on the starting page')
  for (const page of [70, 130]) await say('모모 ' + page + '페이지까지 읽음')
  await wait(momoRow(130), 'momo rows for import')
  assert.equal(await evaluate(momoCopy), undefined, 'not imported yet')
  // The reading page's import (it keeps running after you leave) starts with 130, and 삭제 lands mid-import.
  await evaluate('(async()=>{const m=await import("/src/services/reading/index.ts");const lib=' + library + ';window.__momoImport=m.importLegacyReading(' + q(owner) + ',lib.books,lib.logs);' + momoDelete(130) + '.click();await window.__momoImport})()')
  await wait(momoRow(130) + '.dataset.savedState === "deleted"', 'deleted during import')
  await wait(momoCopy + '?.current_page === 70', 'imported copy follows the delete')
  assert.equal(await evaluate(momo + '.currentPage'), 70)
  await momoDeleted(70)
  await wait(momoCopy + '?.current_page === 10', 'imported copy back to the starting page')
  assert.equal(await evaluate(momo + '.currentPage'), 10)
  steps.push('reading-delete-order')

  // 8g. 보기 when the import fails: the reading page says so and stays; 다시 시도 then opens the book.
  //     A book missing from the reading library opens the list with a note instead.
  const importedKey = q('blanky.reading.imported.' + owner)
  await say('연금술사 40페이지까지 읽음')
  await wait(lastAssistant + '?.querySelector("[data-saved-row]")', 'alchemist row')
  const importedList = await evaluate('localStorage.getItem(' + importedKey + ')')
  await evaluate('localStorage.setItem(' + importedKey + ',"{broken")')
  await evaluate(lastAssistant + '.querySelector(".home-saved-view").click()')
  await wait('location.pathname === "/reading" && document.querySelector(".reading-error[role=alert]")?.textContent.includes("상세를 열 수 없어요")', 'import failure is reported')
  assert.doesNotMatch(await evaluate('document.querySelector(".reading-error").textContent'), /JSON|Expected|property/, 'the storage error stays out of the alert')
  await pause(300)
  assert.equal(await evaluate('location.pathname'), '/reading', 'a failed import stays put')
  await evaluate('localStorage.setItem(' + importedKey + ',' + q(importedList) + ')')
  await evaluate('[...document.querySelectorAll(".reading-error button")].find(b=>b.textContent.trim()==="다시 시도").click()')
  await wait('/^\\/reading\\/[^/]+$/.test(location.pathname) && document.querySelector(".reading-detail h2")?.textContent.includes("연금술사")', '다시 시도 opens the book detail')
  assert.equal(await evaluate('Boolean(document.querySelector(".reading-error"))'), false, 'the alert is gone')
  await evaluate('(()=>{const key="blanky.reading.v1.' + owner + '",store=JSON.parse(localStorage.getItem(key));store.books=store.books.filter(b=>b.book.title!=="연금술사");localStorage.setItem(key,JSON.stringify(store))})()')
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home after alchemist')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'panel for alchemist')
  await evaluate('[...document.querySelectorAll("#home-chat-panel [data-saved-row]")].filter(li=>li.textContent.includes("연금술사")).at(-1).querySelector(".home-saved-view").click()')
  await wait('location.pathname === "/reading" && document.querySelector(".reading-content [role=status]")?.textContent.includes("목록을 열었어요")', 'missing book opens the list with a note')
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home after missing book')
  steps.push('reading-view-fallback')

  // 8h. A book its logs finished (완독) reopens, imported copy included, once that log is deleted; a finished
  //     book with no recorded source keeps its status and page.
  const bookOf = title => library + '.books.find(b=>b.title===' + q(title) + ')'
  const copyOf = title => '(JSON.parse(localStorage.getItem("blanky.reading.v1.' + owner + '"))?.books ?? []).find(b=>b.book.title===' + q(title) + ')'
  const lastRowOf = title => '[...document.querySelectorAll("#home-chat-panel [data-saved-row]")].filter(li=>li.textContent.includes(' + q(title) + ')).at(-1)'
  const deleteLastRow = async title => { await evaluate(lastRowOf(title) + '.querySelector("button:not(.home-saved-view)").click()'); await wait(lastRowOf(title) + '.dataset.savedState === "deleted"', 'deleted ' + title) }
  await say('어린왕자 100페이지까지 읽음')
  await say('어린왕자 완독 총 300쪽')
  await wait(bookOf('어린왕자') + '?.status === "done"', 'prince finished')
  assert.deepEqual(await evaluate('(b=>[b.currentPage,b.finishedBy])(' + bookOf('어린왕자') + ')'), [300, 'auto'])
  await evaluate('(async()=>{const m=await import("/src/services/reading/index.ts");const lib=' + library + ';await m.importLegacyReading(' + q(owner) + ',lib.books,lib.logs)})()')
  await wait(copyOf('어린왕자') + '?.reading_status === "done"', 'prince copy finished')
  await deleteLastRow('어린왕자')
  await wait(bookOf('어린왕자') + '?.status === "reading"', 'prince reopened')
  assert.deepEqual(await evaluate('(b=>[b.finishedAt,b.finishedBy??null,b.currentPage])(' + bookOf('어린왕자') + ')'), [null, null, 100])
  await wait('(c=>c?.reading_status === "reading" && c.finished_at === null && c.current_page === 100)(' + copyOf('어린왕자') + ')', 'prince copy reopened')
  // Deleting the book's last log keeps the book (it started with that log) and its imported copy: back to
  // page 0 and still on /reading. Only deleting the book itself moves it to the trash.
  const princeRow = '[...document.querySelectorAll("#home-chat-panel [data-saved-row]")].filter(li=>li.textContent.includes("어린왕자 · 100쪽") && li.dataset.savedState==="saved").at(-1)'
  await evaluate(princeRow + '.querySelector("button:not(.home-saved-view)").click()')
  await wait('!' + princeRow, 'prince last log deleted')
  await wait('(c=>c?.current_page === 0)(' + copyOf('어린왕자') + ')', 'prince copy back to 0')
  assert.deepEqual(await evaluate('(b=>b&&[b.status,b.currentPage])(' + bookOf('어린왕자') + ')'), ['reading', 0], 'the book stays')
  assert.equal(await evaluate(library + '.logs.filter(l=>l.bookId===' + bookOf('어린왕자') + '.id).length'), 0)
  assert.equal(await evaluate(library + '.trash.some(t=>t.title==="어린왕자")'), false, 'nothing went to the trash')
  await navigate(base + '/reading')
  await wait('[...document.querySelectorAll(".reading-book-card h3")].some(h=>h.textContent==="어린왕자")', 'prince still on /reading')
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home after prince')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'panel after prince')
  await say('코스모스 100페이지까지 읽음')
  await say('코스모스 완독 총 300쪽')
  await wait(bookOf('코스모스') + '?.status === "done"', 'cosmos finished')
  // A book finished before the source was kept: drop finishedBy and reload so the app reads it that way.
  await evaluate('(()=>{const key="blanky.library.' + owner + '",lib=JSON.parse(localStorage.getItem(key));lib.books=lib.books.map(b=>b.title==="코스모스"?{...b,finishedBy:undefined}:b);localStorage.setItem(key,JSON.stringify(lib))})()')
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home after cosmos')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'panel for cosmos')
  await deleteLastRow('코스모스')
  assert.deepEqual(await evaluate('(b=>[b.status,typeof b.finishedAt,b.currentPage])(' + bookOf('코스모스') + ')'), ['done', 'string', 300], 'unknown source changes nothing')
  steps.push('reading-finish-source')

  // 8i. In English a failed import reads in English with no raw storage error, and Try again recovers:
  //     보기 on a book not imported yet gets the open-failed note, the reading page itself the load-failed one.
  const prefKey = q('blanky.preferences.' + owner)
  const setLocale = locale => evaluate('(()=>{const key="blanky.library.' + owner + '",lib=JSON.parse(localStorage.getItem(key));lib.settings.locale=' + q(locale) + ';localStorage.setItem(key,JSON.stringify(lib));const p=JSON.parse(localStorage.getItem(' + prefKey + ')??"null");if(p)localStorage.setItem(' + prefKey + ',JSON.stringify({...p,locale:' + q(locale) + '}))})()')
  const rawError = /JSON|Expected|property|quota|불러오지|다시 시도|가져오지/
  await say('싯다르타 30페이지까지 읽음')
  await wait(lastAssistant + '?.querySelector("[data-saved-row]")', 'siddhartha row')
  const savedImports = await evaluate('localStorage.getItem(' + importedKey + ')')
  await setLocale('en')
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'english home')
  await evaluate(history + '.click()')
  await wait(panelOpen, 'english panel')
  await evaluate('localStorage.setItem(' + importedKey + ',"{broken")')
  await evaluate(lastRowOf('싯다르타') + '.querySelector(".home-saved-view").click()')
  await wait('document.querySelector(".reading-error[role=alert]")?.textContent.includes("details can" + String.fromCharCode(39) + "t open")', 'english open failure')
  assert.doesNotMatch(await evaluate('document.querySelector(".reading-error").textContent'), rawError, 'no raw error and no Korean')
  assert.equal(await evaluate('document.querySelector(".reading-error button").textContent.trim()'), 'Try again')
  await evaluate('localStorage.setItem(' + importedKey + ',' + q(savedImports) + ')')
  await evaluate('document.querySelector(".reading-error button").click()')
  await wait('/^\\/reading\\/[^/]+$/.test(location.pathname) && document.querySelector(".reading-detail h2")?.textContent.includes("싯다르타")', 'Try again opens the book')
  assert.equal(await evaluate('Boolean(document.querySelector(".reading-error"))'), false)
  await evaluate('localStorage.setItem(' + importedKey + ',"{broken")')
  await navigate(base + '/reading')
  await wait('document.querySelector(".reading-error[role=alert]")', 'english load failure')
  const alertText = await evaluate('document.querySelector(".reading-error").textContent')
  assert.match(alertText, /Couldn't load your reading library\./)
  assert.doesNotMatch(alertText, rawError, 'no raw error and no Korean')
  // Try again while it still fails keeps the same English message.
  await evaluate('document.querySelector(".reading-error button").click()')
  await pause(300)
  assert.match(await evaluate('document.querySelector(".reading-error")?.textContent ?? ""'), /^Couldn't load your reading library\./)
  await evaluate('localStorage.setItem(' + importedKey + ',' + q(savedImports) + ')')
  await evaluate('document.querySelector(".reading-error button").click()')
  await wait('!document.querySelector(".reading-error")', 'Try again recovers')
  // The English reading page, its dialogs and a book's tabs show no Korean beyond what the reader typed
  // (titles, authors, notes, shelf names come from the saved data and are taken out before checking).
  const hangulLeft = () => evaluate('(()=>{const store=JSON.parse(localStorage.getItem("blanky.reading.v1.' + owner + '")??"{}");const typed=[...(store.books??[]).flatMap(b=>[b.book.title,b.book.author,b.review,...(b.tags??[])]),...(store.shelves??[]).flatMap(s=>[s.name,s.description]),...(store.notes??[]).flatMap(n=>[n.content,...n.tags]),...(store.highlights??[]).flatMap(h=>[h.content,h.note,...h.tags])].filter(Boolean).sort((a,b)=>b.length-a.length);let text=[...document.querySelectorAll(".reading-page,[role=dialog]")].map(e=>e.innerText).join(" ");for(const value of typed)text=text.split(value).join("");return (text.match(/[가-힣]+/g)??[]).join(",")})()')
  await wait('document.querySelector(".reading-book-grid")', 'english reading list')
  assert.equal(await hangulLeft(), '', 'english reading list')
  await evaluate('document.querySelector("[data-tour=add-book]").click()')
  await wait('document.querySelector(".reading-modal")', 'english search dialog')
  assert.equal(await hangulLeft(), '', 'english search dialog')
  await key('Escape')
  await wait('!document.querySelector(".reading-modal")', 'search dialog closed')
  await evaluate('document.querySelector(".reading-shelf-heading button").click()')
  await wait('document.querySelector(".reading-modal .reading-icon-picker")', 'english shelf dialog')
  await evaluate('document.querySelector(".reading-icon-picker > button").click()')
  await wait('document.querySelector(".reading-icon-panel")', 'english icon picker')
  assert.equal(await hangulLeft(), '', 'english shelf dialog and icon picker')
  await key('Escape')
  await key('Escape')
  await wait('!document.querySelector(".reading-modal")', 'shelf dialog closed')
  await evaluate('[...document.querySelectorAll(".reading-book-card a")].find(a=>a.textContent.includes("싯다르타")).click()')
  await wait('document.querySelector(".reading-detail [role=tablist]")', 'english book detail')
  for (let at = 0; at < 4; at++) {
    await evaluate('document.querySelectorAll(".reading-detail [role=tab]")[' + at + '].click()')
    await pause(150)
    assert.equal(await hangulLeft(), '', 'english detail tab ' + at)
  }
  await navigate(base + '/reading')
  await wait('document.querySelector(".reading-book-grid")', 'english list again')
  await setLocale('ko')
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")', 'home back in Korean')
  steps.push('reading-failure-english')

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

  // 11. Mobile: sending keeps the sheet closed and reports through a toast; 기록 보기 opens a modal bottom sheet.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await navigate()
  await wait('document.querySelector("#home-entry")', 'mobile home')
  await say('모레 오후 2시 병원')
  await wait(lastStatus + ' === "review" || ' + lastStatus + ' === "saved"', 'mobile result')
  assert.equal(await evaluate(panelOpen), false, 'sending on a phone does not open the sheet')
  await wait('document.querySelector("[data-status-toast] button")', 'result toast')
  await tap('document.querySelector("[data-status-toast] button")')
  await wait(panelOpen + ' && document.querySelector("#home-chat-panel").dataset.state === "open"', 'toast opens the sheet')
  assert.equal(await evaluate('document.querySelector("#home-chat-panel").getAttribute("role")'), 'dialog')
  assert.equal(await evaluate('document.querySelector("#home-chat-panel").getAttribute("aria-modal")'), 'true')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#home-chat-panel")).position'), 'fixed')
  assert.ok(await evaluate('document.querySelector("#home-chat-panel").getBoundingClientRect().right <= 390.5'))
  assert.equal(await evaluate('document.activeElement?.id'), 'home-chat-title', 'sheet moves focus to its title')
  assert.ok(await evaluate('Boolean(document.querySelector(".mobile-nav").closest("[inert]"))'), 'tab bar is inert behind the sheet')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= 391'), 'no horizontal scroll')
  await shot('02-mobile-panel')
  await key('Escape')
  await wait('!(' + panelOpen + ')', 'ESC closes the sheet')
  assert.equal(await evaluate('document.activeElement?.id'), 'home-entry', 'opened from the toast, focus returns to the composer')
  await wait('!history.state?.blankyChatSheet', 'closing drops the pushed history entry')
  await tap(history)
  await wait(panelOpen + ' && document.querySelector("#home-chat-panel").dataset.state === "open"', 'history opens the sheet')
  await evaluate('document.querySelector("#home-chat-panel").previousElementSibling.click()')
  await wait('!(' + panelOpen + ')', 'backdrop closes')
  assert.equal(await evaluate('document.activeElement?.getAttribute("aria-controls")'), 'home-chat-panel', 'focus returns to 기록')
  await wait('!history.state?.blankyChatSheet', 'history entry dropped after backdrop close')
  await tap(history)
  await wait('history.state?.blankyChatSheet === true', 'sheet pushed a history entry')
  await evaluate('history.back()')
  await wait('!(' + panelOpen + ')', 'Back closes the sheet')
  assert.equal(await evaluate('location.pathname'), '/', 'Back stays on home')
  steps.push('mobile')

  // 12. Toasts close with X (44px target) or ESC.
  await say('블로그 아이디어 메모 토스트 닫기')
  await wait('document.querySelector("[data-status-toast] .status-toast-close")', 'toast with X')
  assert.equal(await evaluate('document.querySelector(".status-toast-close").getAttribute("aria-label")'), '알림 닫기')
  assert.ok(await evaluate('(()=>{const b=document.querySelector(".status-toast-close"),r=b.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2;return [[cx,cy-21],[cx,cy+21],[cx-21,cy],[cx+21,cy]].every(([x,y])=>b.contains(document.elementFromPoint(x,y)))})()'), 'X takes taps 44px wide')
  await tap('document.querySelector(".status-toast-close")')
  await wait('!document.querySelector("[data-status-toast]")', 'X closes the toast')
  await say('블로그 아이디어 메모 ESC 닫기')
  await wait('document.querySelector("[data-status-toast]")', 'second toast')
  await key('Escape')
  await wait('!document.querySelector("[data-status-toast]")', 'ESC closes the toast')
  steps.push('toast-close')

  // 13. 보기 from the phone sheet leaves home; Back returns to home, not to the closed sheet.
  await tap(history)
  await wait(panelOpen + ' && document.querySelector("#home-chat-panel").dataset.state === "open"', 'sheet for 보기')
  await pause(400) // let the 280ms slide-in settle before tapping by coordinates
  await tap('[...document.querySelectorAll("#home-chat-panel [data-saved-row][data-saved-state=saved]")].at(-1).querySelector(".home-saved-view")')
  await wait('location.pathname === "/memo" && document.querySelector(".memo-layout")', '보기 from the sheet')
  assert.equal(await evaluate('Boolean(document.querySelector("[inert]"))'), false, 'nothing stays inert: ' + await evaluate('[...document.querySelectorAll("[inert]")].map(e=>e.tagName+"."+e.className).join(";")'))
  await evaluate('history.back()')
  await wait('location.pathname === "/" && document.querySelector("#home-entry")', 'Back returns home')
  assert.equal(await evaluate(panelOpen), false, 'the sheet stays closed')
  steps.push('sheet-view')

  // 14. A phone that has not seen the memo tour: 보기 still shows that memo; the tour waits for the list.
  for (const storeKey of ['blanky.preferences.' + owner, 'blanky.library.' + owner]) {
    await evaluate('(()=>{const key=' + q(storeKey) + ',v=JSON.parse(localStorage.getItem(key));if(!v)return;const s=v.settings??v;s.onboardingPages=(s.onboardingPages??[]).filter(p=>p!=="memo");localStorage.setItem(key,JSON.stringify(v))})()')
  }
  await evaluate('localStorage.removeItem(' + q('blanky.onboarding.' + owner + '.memo') + ')')
  await navigate()
  await wait('document.querySelector("#home-entry")', 'home without the memo tour')
  await tap(history)
  await wait(panelOpen + ' && document.querySelector("#home-chat-panel").dataset.state === "open"', 'sheet for memo 보기')
  await pause(400)
  await tap('[...document.querySelectorAll("#home-chat-panel [data-saved-row][data-saved-state=saved]")].at(-1).querySelector(".home-saved-view")')
  await wait('location.pathname === "/memo" && document.querySelector("input.memo-title")?.getClientRects().length', 'the viewed memo opens')
  await pause(800)
  assert.ok(await evaluate('document.querySelector("input.memo-title").value.includes("ESC 닫기") && document.querySelector("input.memo-title").getClientRects().length > 0'), 'the tour leaves the viewed memo open')
  assert.equal(await evaluate('Boolean(document.querySelector("[data-page-tour]"))'), false, 'no tour over the viewed memo')
  await evaluate('document.querySelector("[data-tour=memo-back]").click()')
  await wait('document.querySelector("[data-page-tour]")', 'the tour starts on the list')
  await button('건너뛰기', 'document.querySelector("[data-page-tour]")')
  await wait('!document.querySelector("[data-page-tour]")', 'tour closed')
  steps.push('memo-view-tour')

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
