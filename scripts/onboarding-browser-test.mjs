// Runs the real app in local mode with a fresh and a legacy account in a disposable Chromium profile.
// Checks that new accounts store no samples, page examples hide once real data exists, and page guides persist.
// Set ONBOARDING_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.ONBOARDING_TEST_URL ?? 'http://127.0.0.1:5181'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.ONBOARDING_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set ONBOARDING_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-onboarding-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''; server.stdout.on('data', data => { serverOutput += data }); server.stderr.on('data', data => { serverOutput += data })
for (let i = 0; i < 60; i++) { try { const res = await fetch(base); if (res.ok) break } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); if (i === 59) throw new Error(serverOutput) }
let targets
for (let i = 0; i < 50; i++) { try { targets = await fetch(browserEndpoint + '/json/list').then(r => r.json()); break } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); if (i === 49) throw new Error(browserOutput) }
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
  if (message.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null }
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
  const result = await send('Page.navigate', { url })
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(expression, label) { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}

const owner = '22222222-2222-4222-8222-222222222222'
const legacy = '33333333-3333-4333-8333-333333333333'
const libraryKey = id => 'blanky.library.' + id
const stored = (id = owner) => evaluate('JSON.parse(localStorage.getItem(' + q(libraryKey(id)) + ') || "null")')
const tours = () => evaluate('document.querySelectorAll("[data-page-tour]").length')
const examples = () => evaluate('document.querySelectorAll("[data-example]").length')
const tourText = () => evaluate('document.querySelector("[data-page-tour] h2")?.textContent ?? ""')
const tourBody = () => evaluate('document.querySelector("[data-page-tour]")?.textContent ?? ""')
const overflow = () => evaluate('document.documentElement.scrollWidth - innerWidth')
async function tourButton(text) { await evaluate('[...document.querySelectorAll("[data-page-tour] button, [data-page-tour] a")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, name + '.png'), Buffer.from(result.data, 'base64')) }
const settle = () => pause(400)
const desktop = () => send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
const mobile = () => send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
const account = (id, name) => ({ id, name, nickname: name, email: name + '@example.test', password: 'test-only', avatar: null })
const legacyLibrary = {
  categories: [{ id: 'school', name: '학교', parentId: null, kind: 'area', color: '#3A62B0', icon: 'GraduationCap' }],
  items: [{ id: 'event-class', kind: 'event', title: '수업', description: '', date: '2026-11-03', startTime: '09:00', endTime: '10:30', duration: 90, categoryId: 'school', priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'none' }],
  captures: [], diaries: [], books: [], logs: [], recordTypes: [], records: [], trash: [],
  memos: [{ id: 'memo-legacy', title: '기존 메모', body: '지우면 안 되는 메모', categoryId: 'school', tags: [], createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }],
  settings: { onboardingDone: true, theme: 'dark', accent: 'green' },
}
// Evidence goes to BLANKY_AUDIT_DIR when set, so runs can keep the checked-in .tmp copies untouched.
const out = process.env.BLANKY_AUDIT_DIR ? join(process.env.BLANKY_AUDIT_DIR, 'onboarding-tests') : '.tmp/onboarding-tests'
await mkdir(out, { recursive: true })
const checks = []
try {
  await send('Page.enable'); await send('Runtime.enable')
  await desktop()
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'if(location.origin === ' + q(base) + ' && !localStorage.getItem("blanky.onboarding.test.seeded")){ localStorage.clear(); localStorage.setItem("blanky.accounts.v1",' + q(JSON.stringify([account(owner, 'fresh'), account(legacy, 'legacy')])) + ');localStorage.setItem("blanky.session.v1",' + q(owner) + ');localStorage.setItem("blanky.onboarding.test.seeded","1"); }' })
  await navigate(base + '/')

  // 1. A fresh account stores nothing sample-like.
  await wait('document.querySelectorAll("[data-page-tour]").length === 1', 'home guide')
  const fresh = await stored()
  for (const key of ['categories', 'items', 'diaries', 'memos', 'books', 'logs']) assert.deepEqual(fresh[key], [], key)
  assert.equal(await evaluate('localStorage.getItem("blanky.reading.v1.' + owner + '")'), null)
  checks.push('New account stores no sample schedules, categories, diaries, memos or books')

  // 2. Home guide: three steps, then done.
  assert.equal(await tourText(), '평소 말하듯 입력하세요')
  assert.match(await tourBody(), /1 \/ 3/)
  await screenshot('desktop-home-guide')
  await tourButton('다음'); await tourButton('다음')
  assert.equal(await tourText(), '대화로 이어서 고쳐요')
  await tourButton('완료'); await settle()
  assert.equal(await tours(), 0)
  let settings = (await stored()).settings
  assert.equal(settings.onboardingDone, true); assert.deepEqual(settings.onboardingPages, ['home'])
  checks.push('Home guide shows 3 steps and records completion')

  // 3. Schedule examples fill the input without saving anything.
  await navigate(base + '/schedule')
  await wait('document.querySelectorAll("[data-example]").length === 2', 'schedule examples')
  await screenshot('desktop-schedule-examples')
  await click('[data-example]'); await settle()
  assert.equal(await evaluate('document.getElementById("schedule-entry").value'), '내일 오후 3시부터 4시까지 팀 회의')
  assert.equal(await examples(), 0, 'examples step aside while typing')
  assert.deepEqual((await stored()).items, [])
  checks.push('Schedule shows 2 examples; pressing one fills the input and saves nothing')

  // 4. Diary: skip the guide, start from the example, the example hides after a real entry.
  await navigate(base + '/diary')
  await wait('document.querySelectorAll("[data-page-tour]").length === 1 && document.querySelectorAll("[data-example]").length === 1', 'diary guide and example')
  assert.match(await tourBody(), /1 \/ 3/)
  await screenshot('desktop-diary-guide')
  await tourButton('건너뛰기'); await settle()
  assert.equal(await tours(), 0)
  await click('[data-example]'); await wait('!!document.querySelector(".diary-body-input")', 'diary editor from example')
  assert.deepEqual((await stored()).diaries, [], 'opening the example writes nothing')
  await fill('.diary-body-input', '처음 남기는 진짜 기록')
  await wait('document.querySelector(".diary-save-footer [role=status]")?.textContent === "저장됨"', 'diary autosave')
  await wait('document.querySelectorAll("[data-example]").length === 0', 'diary example hidden')
  assert.equal((await stored()).diaries.length, 1)
  checks.push('Diary guide skip; example starts a real entry and hides once it exists')

  // 5. Memo: the example starts a real memo, then hides.
  await navigate(base + '/memo')
  await wait('document.querySelectorAll("[data-page-tour]").length === 1 && document.querySelectorAll("[data-example]").length === 1', 'memo guide and example')
  await tourButton('다음'); await tourButton('다음'); await tourButton('완료'); await settle()
  assert.equal(await tours(), 0)
  await click('[data-example]'); await settle()
  assert.equal(await examples(), 0); assert.equal((await stored()).memos.length, 1)
  checks.push('Memo guide complete; example starts a memo and hides')

  // 6. Reading: shelf and book examples open the real actions.
  await navigate(base + '/reading')
  await wait('document.querySelectorAll("[data-example]").length === 2 && document.querySelectorAll("[data-page-tour]").length === 1', 'reading examples')
  await screenshot('desktop-reading-examples')
  await click('.reading-example-shelf'); await wait('[...document.querySelectorAll("h2")].some(h => h.textContent.includes("새 책장"))', 'new shelf dialog')
  assert.equal(JSON.parse(await evaluate('localStorage.getItem("blanky.reading.v1.' + owner + '") || "{\\"shelves\\":[]}"')).shelves.length, 0)
  await navigate(base + '/reading')
  await wait('document.querySelectorAll("[data-page-tour]").length === 1', 'reading guide again')
  await tourButton('건너뛰기'); await settle()
  checks.push('Reading shows shelf + book examples; the shelf example opens the real dialog without saving')

  // 7. Store, custom and settings guides. 내 테마 (/custom?tab=themes) names its tab: the customization guide,
  //    which walks every tab and ends on 레이아웃, waits for a visit without one instead of moving the user.
  await navigate(base + '/custom?tab=themes'); await settle()
  assert.equal(await tours(), 0, 'a named tab defers the customization guide')
  assert.equal(await evaluate('location.search'), '?tab=themes', 'and keeps the tab')
  assert.equal((await stored()).settings.onboardingPages.includes('custom'), false, 'the deferred guide is still to come')
  for (const [path, title] of [['/store', '테마와 템플릿을 둘러봐요'], ['/store?tab=templates', null], ['/custom', '템플릿으로 페이지를 꾸며요'], ['/settings/general', '계정과 캘린더 연동']]) {
    await navigate(base + path)
    if (!title) { await settle(); assert.equal(await tours(), 0, 'one store guide covers both tabs'); continue }
    await wait('document.querySelectorAll("[data-page-tour]").length === 1', path + ' guide')
    assert.equal(await tourText(), title)
    await tourButton('건너뛰기'); await settle()
    assert.equal(await tours(), 0)
  }
  settings = (await stored()).settings
  assert.deepEqual([...settings.onboardingPages].sort(), ['custom', 'diary', 'home', 'memo', 'reading', 'settings', 'store'])
  checks.push('Store, custom and settings guides show once and record completion')

  // 8. Reload, and a device without the local completion keys, keep the synced preference state.
  await evaluate('Object.keys(localStorage).filter(k => k.startsWith("blanky.onboarding.' + owner + '")).forEach(k => localStorage.removeItem(k))')
  for (const path of ['/', '/diary', '/reading', '/memo', '/store', '/custom', '/settings/general']) {
    await navigate(base + path); await settle()
    assert.equal(await tours(), 0, path)
  }
  checks.push('Guides stay finished after reload and without device keys (preference-only state)')

  // 9. Replay from settings and the guide page.
  await navigate(base + '/settings/general')
  await wait('[...document.querySelectorAll("a")].filter(a => a.getAttribute("href")?.endsWith("?tour=1")).length === 8', 'settings replay links')
  await navigate(base + '/diary?tour=1')
  await wait('document.querySelectorAll("[data-page-tour]").length === 1', 'diary replay')
  await tourButton('다음'); await tourButton('다음'); await tourButton('완료'); await settle()
  assert.equal(await tours(), 0); assert.equal(await evaluate('location.search'), '')
  // A replay link still starts the customization guide on a named tab.
  await navigate(base + '/custom?tab=themes&tour=1')
  await wait('document.querySelectorAll("[data-page-tour]").length === 1', 'custom replay on a named tab')
  await tourButton('건너뛰기'); await settle()
  assert.equal(await tours(), 0)
  await navigate(base + '/guide')
  await wait('[...document.querySelectorAll("a")].filter(a => a.getAttribute("href")?.endsWith("?tour=1")).length === 7', 'guide replay links')
  checks.push('Replay links in settings and /guide reopen a page guide; closing clears ?tour')

  // 10. Mobile: guide and examples fit the screen.
  await mobile()
  await navigate(base + '/reading?tour=1')
  await wait('document.querySelectorAll("[data-page-tour]").length === 1 && document.querySelectorAll("[data-example]").length === 2', 'mobile reading')
  assert.ok(await overflow() <= 0, 'no horizontal scroll on mobile reading')
  await screenshot('mobile-reading-guide')
  await tourButton('건너뛰기')
  await navigate(base + '/settings/general?tour=1')
  await wait('document.querySelectorAll("[data-page-tour]").length === 1', 'mobile settings guide')
  assert.ok(await overflow() <= 0, 'no horizontal scroll on mobile settings')
  await screenshot('mobile-settings-guide')
  await tourButton('건너뛰기')
  await navigate(base + '/schedule')
  await wait('document.querySelectorAll("[data-example]").length === 2', 'mobile schedule examples')
  assert.ok(await overflow() <= 0, 'no horizontal scroll on mobile schedule')
  await screenshot('mobile-schedule-examples')
  checks.push('Mobile guide and example layout without horizontal scroll')
  await desktop()

  // Spotlight geometry, tab transitions, keyboard and absent targets in real Chromium.
  for (const width of [1440, 375]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width === 375 ? 812 : 1000, deviceScaleFactor: 1, mobile: width === 375 })
    for (const [path, count] of [['/', 3], ['/diary', 3], ['/reading', 3], ['/memo', 3], ['/store', 2], ['/store?tab=templates', 2], ['/custom', 3], ['/settings/general', 2]]) {
      await navigate(base + path + (path.includes('?') ? '&' : '?') + 'tour=1')
      for (let step = 0; step < count; step++) {
        await wait(`(()=>{const p=document.querySelector('[data-page-tour]');return p && getComputedStyle(p).visibility==='visible' && p.textContent.includes('${step + 1} / ${count}')})()`, path + ' spotlight ' + step)
        await pause(100)
        const geometry = await evaluate(`(()=>{const p=document.querySelector('[data-page-tour]'),r=p.getBoundingClientRect();const t=[...document.querySelectorAll(p.dataset.tourTarget)].find(e=>e.getClientRects().length && e.getBoundingClientRect().width);const a=t.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,overflow:document.documentElement.scrollWidth-innerWidth,overlap:Math.max(0,Math.min(r.right,a.right)-Math.max(r.left,a.left))*Math.max(0,Math.min(r.bottom,a.bottom)-Math.max(r.top,a.top)),focus:p.contains(document.activeElement)}})()`)
        assert.ok(geometry.x >= 0 && geometry.right <= width + 1 && geometry.y >= 0 && geometry.bottom <= (width === 375 ? 812 : 1000) + 1, JSON.stringify({ path, step, width, geometry }))
        assert.equal(geometry.overlap, 0, path + ' must not cover its target')
        assert.equal(geometry.overflow, 0, path + ' horizontal overflow')
        assert.ok(geometry.focus, path + ' keyboard focus')
        if (path === '/' && step === 2) assert.equal(await evaluate('document.querySelector("[aria-controls=home-chat-panel]").getAttribute("aria-expanded")'), 'true')
        await screenshot('spotlight-' + width + '-' + path.replaceAll(/[^a-z]/g, '') + '-' + step)
        if (step === 1) {
          await click('.spotlight-actions .btn-line')
          await wait(`document.querySelector('[data-page-tour]')?.textContent.includes('1 / ${count}')`, 'previous step')
          await click('.spotlight-actions .btn-primary')
          await wait(`document.querySelector('[data-page-tour]')?.textContent.includes('2 / ${count}')`, 'next step again')
        }
        await click('.spotlight-actions .btn-primary')
      }
      await wait('!document.querySelector("[data-page-tour]")', 'tour complete')
    }
  }
  await desktop()
  await navigate(base + '/settings/general?tour=1')
  await wait('!!document.querySelector(".spotlight-popover h2:focus")', 'scroll setup')
  await click('.spotlight-actions .btn-primary')
  await wait('document.querySelector("[data-page-tour]")?.textContent.includes("2 / 2")', 'settings control')
  await pause(100)
  await evaluate('document.querySelector("main[data-theme-slot=page]").scrollBy(0, 40)')
  await pause(100)
  assert.ok(await evaluate('Math.abs(document.querySelector(".spotlight-border").getBoundingClientRect().top - Math.max(4,document.querySelector("[data-tour=settings-body] select").getBoundingClientRect().top - 6)) < 2'), 'highlight follows nested page scrolling')
  await mobile()
  await pause(200)
  assert.ok(await evaluate('document.querySelector(".spotlight-popover").getBoundingClientRect().right <= innerWidth'), 'active tour repositions on resize')
  await click('.spotlight-actions .btn-primary')
  await desktop()
  await navigate(base + '/?tour=1')
  await wait('!!document.querySelector(".spotlight-popover h2:focus")', 'focus on open')
  const inputPoint = await evaluate('(()=>{const r=document.querySelector("#home-entry").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...inputPoint })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...inputPoint })
  assert.equal(await evaluate('document.activeElement.id'), 'home-entry', 'spotlight hole allows real target interaction')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), '안내 닫기')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait('!document.querySelector("[data-page-tour]")', 'ESC exit')
  assert.equal(await evaluate('document.activeElement.id'), 'home-entry', 'focus returns to page input')
  await navigate(base + '/memo?tour=1')
  await wait('!!document.querySelector(".spotlight-popover h2:focus")', 'missing target setup')
  await evaluate('document.querySelector("[data-tour=new-memo]").remove(); document.querySelector(".memo-browse > input").remove()')
  await wait('document.querySelector("[data-page-tour]")?.textContent.includes("3 / 3")', 'missing targets skip safely')
  await click('.spotlight-actions .btn-primary')
  await wait('!document.querySelector("[data-page-tour]")', 'close after missing targets')
  checks.push('All seven tours and both store tabs: every step, previous/next, non-overlapping target geometry, focus, and no overflow at 1440px and 375px; dynamic chat/custom tabs; Tab, ESC, focus restoration, missing-target recovery')

  // 11. Legacy account: existing data and settings are untouched, the legacy home flag is respected.
  await evaluate('localStorage.setItem(' + q(libraryKey(legacy)) + ',' + q(JSON.stringify(legacyLibrary)) + ');localStorage.setItem("blanky.session.v1",' + q(legacy) + ')')
  await navigate(base + '/'); await settle()
  assert.equal(await tours(), 0, 'legacy onboardingDone hides the home guide')
  for (const path of ['/schedule', '/memo', '/diary']) { await navigate(base + path); await settle() }
  await navigate(base + '/memo'); await settle()
  assert.equal(await examples(), 0, 'no examples next to real memos')
  await navigate(base + '/schedule'); await settle()
  assert.equal(await examples(), 0, 'no examples next to real schedules')
  const after = await stored(legacy)
  assert.equal(after.items.length, 1); assert.equal(after.items[0].title, '수업')
  assert.equal(after.memos.length, 1); assert.equal(after.memos[0].body, '지우면 안 되는 메모')
  assert.equal(after.categories[0].name, '학교')
  assert.equal(after.settings.theme, 'dark'); assert.equal(after.settings.accent, 'green')
  checks.push('Legacy account keeps its data and settings; no examples beside real data')

  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(JSON.stringify({ passed: checks, browserErrors: errors }, null, 2))
  await writeFile(join(out, 'results.json'), JSON.stringify({ passed: checks, browserErrors: errors }, null, 2))
} catch (error) {
  await screenshot('failure').catch(() => undefined)
  console.error(JSON.stringify({ passed: checks, browserErrors: errors, url: await evaluate('location.href').catch(() => '') }, null, 2))
  console.error(error)
  process.exitCode = 1
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-onboarding-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
