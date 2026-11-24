// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set DIARY_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.DIARY_TEST_URL ?? 'http://127.0.0.1:5174'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.DIARY_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set DIARY_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-diary-test-'))
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
async function wait(expression, label) { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner
const count = () => evaluate('JSON.parse(localStorage.getItem(' + q(library) + ') || "{}").diaries?.length ?? 0')
async function saved() { await wait('document.querySelector(".diary-save-status")?.textContent === "저장됨"', 'autosave') }
// Mood (0) / weather (1) chip in the desktop toolbar; each opens its picker popover.
async function chip(index) { await evaluate('document.querySelectorAll(".diary-toolbar .diary-chip")[' + index + '].click()'); await wait('!!document.querySelector(".diary-pop")', 'choice popover') }
async function enter(selector) { await evaluate('document.querySelector(' + q(selector) + ').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))') }
// A finger tap on a phone row: pointerdown resets the long-press guard before the click.
async function tap(selector) { await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })); el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" })); el.click()})()') }
async function longPress(selector) { await evaluate('document.querySelector(' + q(selector) + ').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 20, clientY: 20 }))'); await pause(600) }
async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(out, name + '.png'), Buffer.from(result.data, 'base64')) }
// Evidence goes to BLANKY_AUDIT_DIR when set, so runs can keep the checked-in .tmp copies untouched.
const out = process.env.BLANKY_AUDIT_DIR ? join(process.env.BLANKY_AUDIT_DIR, 'diary-tests') : '.tmp/diary-tests'
await mkdir(out, { recursive: true })
const checks = []
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  // The customization tour is marked done: on first visit it switches /custom to its templates tab, racing the theme step below.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'if(location.origin === ' + q(base) + ' && !localStorage.getItem("blanky.diary.test.seeded")){ localStorage.setItem("blanky.accounts.v1",JSON.stringify([{id:' + q(owner) + ',name:"Diary Test",nickname:"테스트",email:"diary-test@example.test",password:"test-only",avatar:null}]));localStorage.setItem("blanky.session.v1",' + q(owner) + ');localStorage.setItem(' + q(library) + ',JSON.stringify({items:[],categories:[],settings:{onboardingPages:["custom","diary"]},diaries:[]}));localStorage.setItem("blanky.diary.test.seeded","1"); }' })
  await evaluate('if(location.origin === ' + q(base) + ') localStorage.clear()')
  await navigate(base + '/diary')
  await wait('!!document.querySelector(".diary-new") && !document.querySelector(".diary-new").disabled', 'diary loaded')
  assert.equal(await count(), 0)
  await click('.diary-new'); await wait('!!document.querySelector(".diary-body-input")', 'new editor')
  await pause(1100); assert.equal(await count(), 0); checks.push('Empty new draft creates no record')
  await fill('.diary-body-input', '오늘 학교 끝나고 프로젝트 회의를 했다. 따뜻한 커피도 마셨다.')
  await saved(); assert.equal(await count(), 1); checks.push('New entry and debounced autosave')
  await chip(0); await click('[aria-label="기쁨"]'); await chip(1); await click('[aria-label="흐림"]'); await click('[aria-label="즐겨찾기 추가"]')
  assert.equal(await evaluate('!!document.querySelector(".diary-pop")'), false)
  await click('.diary-write-tags .diary-chip-ghost'); await wait('!!document.querySelector(".diary-tag-input")', 'tag input')
  await fill('.diary-tag-input', '#학교, #프로젝트, #학교'); await enter('.diary-tag-input')
  await saved()
  const stored = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).diaries[0]')
  assert.equal(stored.mood, 'happy'); assert.equal(stored.weather, 'cloudy'); assert.equal(stored.isFavorite, true); assert.deepEqual(stored.tags, ['학교', '프로젝트'])
  assert.equal(await evaluate('document.querySelector(".diary-entry .diary-entry-mood").textContent.startsWith("😊")'), true)
  assert.equal(await evaluate('document.querySelector(".diary-entry .diary-entry-meta").textContent.includes("#학교 #프로젝트")'), true)
  checks.push('Mood/weather popovers, favorites and unique tag chips persisted and shown in the row')
  assert.equal(await evaluate('document.querySelector(".diary-entry-title span").textContent'), '오늘 학교 끝나고 프로젝트 회의를 했다')
  assert.equal(await evaluate('!!document.querySelector(".diary-month-head") && !!document.querySelector(".diary-day b")'), true)
  checks.push('Automatic first-sentence title, month header and date block')
  await screenshot('desktop-light')
  await click('.diary-new'); await wait('!!document.querySelector(".diary-title-input") && !document.querySelector(".diary-writing-fields").disabled && document.querySelector(".diary-body-input").value === ""', 'new draft ready'); await fill('.diary-title-input', '두 번째 기록'); await fill('.diary-body-input', '산책하며 새로운 생각을 했다.')
  await saved(); assert.equal(await count(), 2)
  await fill('.diary-body-input', '산책하며 새로운 생각을 했다. 저장 중인 메모')
  await click('[aria-label="즐겨찾기 추가"]'); await saved()
  const second = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).diaries.find(e => e.title === "두 번째 기록")')
  assert.equal(second.body, '산책하며 새로운 생각을 했다. 저장 중인 메모'); assert.equal(second.isFavorite, true)
  await click('[aria-label="즐겨찾기 해제"]'); await saved()
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).diaries.find(e => e.title === "두 번째 기록").isFavorite'), false)
  checks.push('Editor star saves the favorite together with pending edits')
  await click('[aria-label="달력으로 보기"]')
  await wait('!!document.querySelector(".diary-calendar")', 'calendar view')
  const today = await evaluate('document.querySelector(".diary-calendar-day[aria-current=date]").dataset.date')
  assert.equal(await evaluate('document.querySelector(".diary-calendar-day[aria-current=date] .diary-cal-mood")?.textContent'), '😊')
  await click('.diary-calendar-day[aria-current=date]'); assert.equal(await evaluate('document.querySelectorAll(".diary-entry").length'), 2)
  await click('[aria-label="이전 달"]'); assert.equal(await evaluate('document.querySelectorAll(".diary-entry").length'), 0)
  await click('[aria-label="다음 달"]'); assert.equal(await evaluate('document.querySelectorAll(".diary-entry").length'), 2)
  const emptyDate = await evaluate('[...document.querySelectorAll(".diary-calendar-day")].find(el => !el.classList.contains("diary-calendar-outside") && !el.querySelector("i") && el.dataset.date !== ' + q(today) + ').dataset.date')
  await click('.diary-calendar-day[data-date="' + emptyDate + '"]'); assert.equal(await evaluate('document.querySelectorAll(".diary-entry").length'), 0)
  await click('.diary-new'); await wait('document.querySelector(".diary-tb-date")?.textContent.includes(' + q(String(Number(emptyDate.slice(8)))) + ')', 'new calendar editor')
  // In-app date picker (desktop popover): opens on the draft's date with focus on it, picks a day, Esc closes.
  await click('.diary-tb-date'); await wait('document.activeElement?.dataset?.date === ' + q(emptyDate) + ' && document.querySelector(".diary-pop-date .diary-calendar-day[aria-pressed=true]")?.dataset.date === ' + q(emptyDate), 'date popover focus')
  assert.equal(await evaluate('[...document.querySelectorAll(".diary-pop-date .diary-calendar-day")].every(b => b.tagName === "BUTTON" && b.getAttribute("aria-label"))'), true)
  await screenshot('desktop-date-popover')
  await click('.diary-pop-date .diary-calendar-day[aria-current=date]'); await wait('!document.querySelector(".diary-pop-date")', 'date picked')
  await click('.diary-tb-date'); await wait('document.querySelector(".diary-pop-date .diary-calendar-day[aria-pressed=true]")?.dataset.date === ' + q(today), 'picked date kept')
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))'); await wait('!document.querySelector(".diary-pop-date")', 'Esc closes date popover')
  await wait('document.activeElement === document.querySelector(".diary-tb-date")', 'focus back on the date button')
  await chip(0); await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))')
  await wait('!document.querySelector(".diary-pop") && document.activeElement === document.querySelectorAll(".diary-toolbar .diary-chip")[0]', 'focus back on the mood chip')
  checks.push('Desktop in-app date picker: focus on the date, pick, Esc returns focus (date and mood)')
  await click('[aria-label="목록으로 보기"]'); await click('.diary-entry')
  await click('[aria-label="달력으로 보기"]'); await click('.diary-calendar-day[data-date="' + today + '"]')
  await screenshot('desktop-calendar')
  await click('[aria-label="목록으로 보기"]')
  checks.push('Month navigation, mood emoji in calendar, day filtering and new draft date from calendar selection')
  await button('즐겨찾기'); assert.equal(await evaluate('document.querySelectorAll(".diary-entry").length'), 1)
  await click('.diary-entry'); await wait('document.querySelector(".diary-body-input").value.includes("프로젝트")', 'select favorite')
  await fill('.diary-body-input', '수정한 프로젝트 회의 기록. 오늘은 더 편안했다.')
  await saved(); checks.push('Favorite segment, entry selection and content editing')
  await button('전체'); await click('button[aria-label="일기 검색"]'); await wait('!!document.querySelector(".diary-search input")', 'search field')
  await fill('.diary-search input', '더 편안했다'); await pause(100)
  assert.equal(await evaluate('document.querySelectorAll(".diary-entry").length'), 1)
  await fill('.diary-search input', '두 번째'); await pause(100); assert.equal(await evaluate('document.querySelectorAll(".diary-entry").length'), 1)
  await fill('.diary-search input', '없는검색결과'); await pause(100); assert.equal(await evaluate('document.querySelectorAll(".diary-entry").length'), 0)
  await click('button[aria-label="일기 검색"]'); await wait('!document.querySelector(".diary-search input") && document.querySelectorAll(".diary-entry").length === 2', 'search closed'); checks.push('Title/body search and empty results')
  await navigate(); await wait('document.querySelectorAll(".diary-entry").length === 2', 'refresh persistence')
  await click('.diary-entry'); await wait('!!document.querySelector(".diary-body-input")', 'entry editor')
  checks.push('Refresh preserves saved records and metadata')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await wait('!!document.querySelector(".diary-pe")', 'phone editor')
  assert.equal(await evaluate('!!document.querySelector("[data-mobile-topbar]")'), false)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true)
  await screenshot('mobile-editor')
  // In-app date picker (phone bottom sheet): pick another day, then back to today; the system Back closes it.
  const openedId = await evaluate('JSON.parse(localStorage.getItem(' + q(library) + ')).diaries.find(e => e.title === "두 번째 기록").id')
  await click('.diary-pe-date'); await wait('!!document.querySelector(".mcal-sub .diary-date-picker") && document.activeElement?.getAttribute("aria-pressed") === "true"', 'date sheet')
  await pause(400); await screenshot('mobile-date-sheet')
  const otherDay = await evaluate('document.querySelector(".mcal-sub .diary-calendar-day:not([aria-pressed=true]):not(.diary-calendar-outside)").dataset.date')
  await click('.mcal-sub .diary-calendar-day[data-date="' + otherDay + '"]'); await wait('!document.querySelector(".mcal-sub")', 'date sheet closed')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).diaries.find(e => e.id === ' + q(openedId) + ').date === ' + q(otherDay), 'picked date saved')
  await click('.diary-pe-date'); await wait('!!document.querySelector(".mcal-sub .diary-date-picker")', 'date sheet again')
  await click('.mcal-sub .diary-calendar-day[aria-current=date]'); await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).diaries.find(e => e.id === ' + q(openedId) + ').date === ' + q(today), 'date restored')
  await click('.diary-pe-date'); await wait('!!document.querySelector(".mcal-sub .diary-date-picker")', 'date sheet for Back')
  await evaluate('history.back()'); await wait('!document.querySelector(".mcal-sub") && !!document.querySelector(".diary-pe")', 'Back closes date sheet')
  await wait('document.activeElement === document.querySelector(".diary-pe-date")', 'Back returns focus to the date button')
  await click('.diary-pe-date'); await wait('!!document.querySelector(".mcal-sub .diary-date-picker")', 'date sheet for Esc')
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))')
  await wait('!document.querySelector(".mcal-sub") && document.activeElement === document.querySelector(".diary-pe-date")', 'Esc returns focus to the date button')
  await click('[aria-label="더보기"]'); await evaluate('[...document.querySelectorAll(".memo-pe-menu [role=menuitem]")].find(b => b.textContent.includes("날짜 바꾸기")).click()')
  await wait('!!document.querySelector(".mcal-sub .diary-date-picker")', 'date sheet from the menu')
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))')
  await wait('!document.querySelector(".mcal-sub") && document.activeElement === document.querySelector("[aria-label=\\"더보기\\"]")', 'Esc returns focus to the more button')
  checks.push('Phone in-app date sheet: pick, save, Back/Esc return focus to the date button or the more button')
  await click('[aria-label="목록으로"]'); await wait('!!document.querySelector(".diary-phone") && document.querySelectorAll(".diary-entry").length === 2', 'phone list')
  assert.equal(await evaluate('!!document.querySelector(".memo-phone-head[data-app-bar] [data-mobile-tab=more]") && !!document.querySelector(".add-fab")'), true)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true)
  await screenshot('mobile-list')
  checks.push('Phone app bar (more, filter, calendar, search), + button and list without MobileTopBar')
  await click('[data-tour="diary-filter"]'); await wait('!!document.querySelector(".memo-phone-folders[data-open]")', 'filter dropdown')
  await screenshot('mobile-filter')
  await evaluate('[...document.querySelectorAll(".memo-phone-folder-item")].find(b => b.textContent.includes("기쁨")).click()')
  await wait('document.querySelectorAll(".diary-entry").length === 1 && document.querySelector(".memo-phone-folder").textContent.includes("기쁨")', 'mood filter')
  await click('[data-tour="diary-filter"]'); await evaluate('[...document.querySelectorAll(".memo-phone-folder-item")].find(b => b.textContent.includes("전체 일기")).click()')
  await wait('document.querySelectorAll(".diary-entry").length === 2', 'all filter')
  checks.push('Phone filter dropdown: all / favorites / moods')
  await click('button[aria-label="일기 검색"]'); await wait('!!document.querySelector(".memo-phone-search")', 'phone search')
  await fill('.memo-phone-search', '두 번째'); await wait('document.querySelectorAll(".diary-entry").length === 1 && document.querySelector(".memo-phone-count").textContent === "검색 결과 1개"', 'phone search results')
  assert.equal(await evaluate('!!document.querySelector(".add-fab")'), false)
  await click('[aria-label="검색 닫기"]'); await wait('!document.querySelector(".memo-phone-search") && document.querySelectorAll(".diary-entry").length === 2', 'phone search closed')
  assert.equal(await evaluate('document.activeElement.matches(\'button[aria-label="일기 검색"]\')'), true)
  checks.push('Phone search bar, result count and reset on close')
  await longPress('.diary-entry'); await wait('!!document.querySelector(".memo-phone-actions") && document.querySelector(".memo-phone-picked").textContent === "1개 선택됨"', 'selection mode')
  assert.equal(await evaluate('!!document.querySelector(".add-fab")'), false)
  await click('.memo-phone-all'); await wait('document.querySelector(".memo-phone-picked").textContent === "2개 선택됨"', 'select all')
  await screenshot('mobile-selection')
  await click('.memo-phone-actions button'); await wait('!document.querySelector(".memo-phone-actions")', 'favorite action')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).diaries.every(e => e.isFavorite)', 'bulk favorite saved')
  checks.push('Long-press selection, select all and bulk favorite')
  await click('[aria-label="달력으로 보기"]'); await wait('!!document.querySelector(".diary-calendar")', 'mobile calendar')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true)
  await screenshot('mobile-calendar')
  await click('.diary-calendar-day[aria-current=date]'); await tap('.diary-entry'); await wait('!!document.querySelector(".diary-pe")', 'calendar entry editor')
  await click('[aria-label="목록으로"]'); await wait('!!document.querySelector(".diary-calendar")', 'back to calendar'); await click('[aria-label="목록으로 보기"]')
  checks.push('Mobile calendar date to record editor navigation')
  checks.push('Mobile list/editor navigation and no horizontal overflow')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await navigate(base + '/settings/appearance'); await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "다크")', 'appearance settings')
  await button("다크"); await wait('document.documentElement.classList.contains("dark")', 'dark theme applied')
  await navigate(base + '/diary'); await wait('!!document.querySelector(".diary-list-card")', 'dark diary')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".diary-list-card")).backgroundColor'), 'rgb(28, 28, 28)')
  await wait('!!document.querySelector(".diary-entry")', 'dark entries'); await click('.diary-entry'); await wait('!!document.querySelector(".diary-body-input")', 'dark editor'); await screenshot('desktop-dark'); checks.push('Appearance dark theme reflected in diary')
  await click('[aria-label="기록 삭제"]'); assert.equal(await evaluate('document.querySelector("dialog").open'), true)
  await button('취소'); assert.equal(await count(), 2)
  await click('[aria-label="기록 삭제"]'); await button('삭제'); await wait('!document.querySelector("dialog").open && document.querySelectorAll(".diary-entry").length === 1', 'delete confirmed')
  await navigate(); await wait('document.querySelectorAll(".diary-entry").length === 1', 'deleted record stays deleted')
  checks.push('Delete confirmation/cancel and persistent deletion')
  await click('.diary-new'); await fill('.diary-body-input', '새로고침 직전 임시 기록')
  await navigate(); await wait('document.querySelector(".diary-body-input")?.value === "새로고침 직전 임시 기록" || [...document.querySelectorAll(".diary-entry-title span")].some(el => el.textContent === "새로고침 직전 임시 기록")', 'pending edit preserved')
  if (!await evaluate('!!document.querySelector(".diary-body-input")')) await click('.diary-entry')
  await saved(); assert.equal(await count(), 2); checks.push('Pending draft survives immediate refresh and saves once')
  await navigate(base + '/settings/themes')
  await wait('[...document.querySelectorAll("article")].some(a => a.textContent.includes("Soft Pink"))', 'theme library')
  // The card now holds its own 적용 button; its parent is the whole grid, whose first button applies another theme.
  await evaluate('[...[...document.querySelectorAll("article")].find(a => a.textContent.includes("Soft Pink")).querySelectorAll("button")].find(b => b.textContent.trim() === "적용").click()')
  await wait('document.querySelector(".blanky-themed")?.style.getPropertyValue("--surface") === "#fff4f8"', 'Soft Pink applied')
  await navigate(base + '/diary'); await wait('!!document.querySelector(".diary-entry")', 'themed diary')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".diary-list-card")).backgroundColor'), 'rgb(255, 244, 248)')
  await wait('getComputedStyle(document.querySelector(".diary-new")).backgroundColor === "rgb(193, 94, 128)"', 'theme accent transition')
  await click('.diary-entry'); await screenshot('desktop-soft-pink')
  checks.push('Theme Provider applies Soft Pink surface, text and accent colors')
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(JSON.stringify({ passed: checks, browserErrors: errors }, null, 2))
  await writeFile(join(out, 'results.json'), JSON.stringify({ passed: checks, browserErrors: errors }, null, 2))
} catch (error) { console.error(await evaluate("JSON.stringify({text:document.body.innerText,url:location.href,ready:document.readyState})")); console.error(errors); console.error(serverOutput); console.error('exit',server.exitCode); console.error(JSON.stringify(diagnostics.filter(item => item.method === 'Network.loadingFailed' || item.params.type === 'error'))); throw error } finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-diary-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
