import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'custom-page-ui')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.CUSTOMIZATION_TEST_URL ?? 'http://127.0.0.1:5218'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')
const { mkdtemp } = await import('node:fs/promises')
const profile = await mkdtemp(join(tmpdir(), 'blanky-customization-test-'))

const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolvePromise, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', (data) => {
    browserOutput += data
    const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/)
    if (match) resolvePromise(match[0].replace('ws:', 'http:'))
  })
  browser.on('exit', (code) => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: null } }); await server.listen(); server.printUrls();'], { env: { ...process.env, NODE_ENV: 'production', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', (data) => { serverOutput += data })
server.stderr.on('data', (data) => { serverOutput += data })
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(base)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 100))
  if (i === 79) throw new Error(serverOutput)
}
let targets
for (let i = 0; i < 50; i++) {
  try { targets = await fetch(browserEndpoint + '/json/list').then((r) => r.json()); break } catch {}
  await new Promise((r) => setTimeout(r, 100))
  if (i === 49) throw new Error(browserOutput)
}
const target = targets.find((item) => item.type === 'page')
if (!target) throw new Error('No disposable browser test page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolvePromise, reject) => {
  ws.addEventListener('open', resolvePromise, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
let nextId = 0
let loadResolve = null
const pending = new Map()
const errors = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  const pair = pending.get(message.id)
  if (pair) { pending.delete(message.id); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
function send(method, params = {}) {
  return new Promise((resolvePromise, reject) => {
    const id = ++nextId
    pending.set(id, { resolve: resolvePromise, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function navigate(url) {
  const loaded = new Promise((resolvePromise) => { loadResolve = resolvePromise })
  const result = await send(url ? 'Page.navigate' : 'Page.reload', url ? { url } : {})
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
async function wait(expression, label) {
  for (let i = 0; i < 80; i++) {
    if (await evaluate('Boolean(' + expression + ')')) return
    await pause(100)
  }
  throw new Error('Timed out: ' + label)
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(evidenceDir, name + '.png'), Buffer.from(result.data, 'base64'))
  log('screenshot ' + name + '.png')
}
const q = (value) => JSON.stringify(value)
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner

async function finish(ok, extra) {
  const payload = { started, ended: new Date().toISOString(), ok, log: logLines, errors, extra: extra ?? null, serverTail: serverOutput.slice(-1500) }
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify(payload, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + (() => {
      if (!location.hostname || localStorage.getItem('customization-test-seeded')) return
      const owner = '11111111-1111-4111-8111-111111111111'
      localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: owner, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
      localStorage.setItem('blanky.session.v1', owner)
      localStorage.setItem('blanky.library.' + owner, JSON.stringify({
        categories: [],
        items: [],
        settings: { locale: 'ko', onboardingPages: ['custom','diary','reading','memo'], customTemplatesGuideSeen: true },
        customPages: [],
        pageTemplates: [],
        recordTypes: [],
        records: [],
      }))
      localStorage.setItem('customization-test-seeded', '1')
    }).toString() + ')()',
  })


  await navigate(base + '/custom')
  await wait('document.querySelector("[data-tour=new-page]")', 'hub')
  await evaluate('document.querySelector("[data-tour=new-page]").click()')
  await wait('document.querySelector(".page-wizard")', 'wizard')
  // The create wizard keeps a live preview of the real page for each template kind.
  const samples = ['첫 기록', '읽고 있는 책', '짧은 메모']
  assert.equal(await evaluate('document.querySelectorAll(".template-choice-grid .template-card").length'), 3)
  for (const [index, sample] of samples.entries()) {
    await evaluate(`document.querySelectorAll(".template-choice-grid .template-card")[${index}].click()`)
    await wait(`document.querySelector(".page-wizard .template-preview")?.textContent.includes(${q(sample)})`, 'preview ' + index)
    assert.equal(await evaluate(`[...document.querySelectorAll(".template-choice-grid .template-card")].map((card) => card.getAttribute("aria-pressed")).join()`), [0, 1, 2].map((i) => String(i === index)).join())
    assert.ok(await evaluate('document.querySelector(".page-wizard .template-preview").getBoundingClientRect().height > 200'))
    await new Promise((done) => setTimeout(done, 250)) // let the card transition settle
    await shot('01-wizard-' + index)
  }
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".template-choice-grid")).gridTemplateColumns.split(" ").length'), 3)
  assert.ok(await evaluate('document.querySelector(".page-wizard .template-preview-slot").getBoundingClientRect().left - document.querySelector(".page-wizard").getBoundingClientRect().left >= 16'))
  await evaluate('document.querySelectorAll(".template-choice-grid .template-card")[0].click()')
  await evaluate('document.querySelector(".page-wizard .btn-primary").click()')
  await wait('document.querySelector("input.field")', 'name input')
  await evaluate(`(() => {const e=document.querySelector('input.field'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'UI test page'); e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  await evaluate('document.querySelector(".page-wizard .btn-primary").click()')
  await wait('document.querySelector(".page-wizard .template-preview")?.textContent.includes("UI test page")', 'named preview')
  await evaluate('document.querySelector(".page-wizard .btn-primary").click()')
  await evaluate('document.querySelector(".page-wizard .btn-primary").click()')
  await wait('location.pathname.startsWith("/pages/")', 'created page')
  await wait('document.querySelector(".custom-user-page")', 'page content')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".custom-user-page")).maxWidth'), 'none')
  await shot('02-page-desktop')
  await navigate(base + '/custom')
  await wait('document.querySelector("main article")', 'card')
  assert.equal(await evaluate('!!document.querySelector(".template-preview")'), false)
  // 편집 opens the same editor as creation: steps plus a live preview of the real page.
  const setValue = `const set=(e,v)=>{Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(e,v); e.dispatchEvent(new Event('input',{bubbles:true}));};`
  await evaluate('document.querySelector("main article button").click()')
  await wait('document.querySelector(".page-wizard .template-preview")?.textContent.includes("UI test page")', 'edit wizard preview')
  assert.equal(await evaluate('!!document.querySelector(".page-wizard .theme-editor-tabs")'), false)
  assert.equal(await evaluate('!!document.querySelector(".template-choice-grid")'), false)
  assert.ok(await evaluate('document.querySelector(".page-wizard h1").textContent.includes("UI test page")'))
  // Going back without saving leaves the page as it was.
  await evaluate(`(() => {${setValue} set(document.querySelector('.page-wizard input.field'),'Discarded name');})()`)
  await evaluate('document.querySelector(".page-wizard .btn-ghost").click()')
  await wait('document.querySelector("main article a")?.textContent === "UI test page"', 'cancel edit')
  await evaluate('document.querySelector("main article button").click()')
  await wait('document.querySelector(".page-wizard textarea")', 'edit wizard')
  await evaluate(`(() => {${setValue} set(document.querySelector('.page-wizard input.field'),'Renamed page'); set(document.querySelector('.page-wizard textarea'),'하루 운동 기록');})()`)
  await wait('document.querySelector(".page-wizard .template-preview")?.textContent.includes("Renamed page")', 'preview follows name')
  await shot('03a-edit-name')
  await evaluate('document.querySelector(".page-wizard .btn-primary").click()')
  await wait('document.querySelector(".page-wizard label input.field")', 'label step')
  await evaluate(`(() => {${setValue} const title=[...document.querySelectorAll('.page-wizard label')].find((l)=>l.querySelector('span')?.textContent==='제목').querySelector('input'); set(title,'운동 이름');})()`)
  await shot('03b-edit-labels')
  await evaluate('document.querySelector(".page-wizard .btn-line").click()')
  await wait('document.querySelector("main article a")?.textContent === "Renamed page"', 'rename')
  assert.ok(await evaluate('document.querySelector("main article").textContent.includes("하루 운동 기록")'))
  await shot('03-cards-desktop')
  await navigate()
  await wait('document.querySelector("main article a")?.textContent === "Renamed page"', 'persist rename')
  const saved = await evaluate(`JSON.stringify(JSON.parse(localStorage.getItem(${q(library)})).customPages.find((page)=>page.name==='Renamed page'))`)
  assert.equal(JSON.parse(saved).description, '하루 운동 기록')
  assert.equal(JSON.parse(saved).fieldLabels.title, '운동 이름')
  // A disposable custom page exercises date/time widgets using the same schedule data.
  await evaluate(`(() => {const key=${q(library)}; const d=JSON.parse(localStorage.getItem(key)); d.customPages.push({id:'ui-widget',name:'Timed event',icon:'Calendar',description:'',sort:1,schemaVersion:1,blocks:[{id:'widget',type:'widget-calendar',props:{}}],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});d.items=[{id:'timed',kind:'event',title:'Timed event',date:'2026-11-03',startTime:'09:00',endTime:'10:30',endDate:null,allDay:false,status:'todo',categoryId:null,priority:0},{id:'all-day',kind:'event',title:'Timed event',date:'2026-11-04',startTime:null,endTime:null,allDay:true,status:'todo',categoryId:null,priority:0},{id:'no-time',kind:'event',title:'Date only',date:'2026-11-05',startTime:null,endTime:null,allDay:false,status:'todo',categoryId:null,priority:0}];localStorage.setItem(key,JSON.stringify(d));})()`)
  await navigate(base + '/pages/ui-widget')
  await wait('document.querySelector("main")?.textContent.includes("10:30")', 'time range')
  assert.equal(await evaluate('document.querySelector("main").textContent.includes("\uC885\uC77C")'), true)
  await shot('04-date-time-desktop')
  // A reading page renamed to movies: the page-wide words follow the custom labels.
  await evaluate(`(() => {const key=${q(library)}; const d=JSON.parse(localStorage.getItem(key)); d.customPages.push({id:'ui-movie',name:'영화 기록',icon:'Film',description:'',sort:2,schemaVersion:1,blocks:[],template:'reading',fieldLabels:{title:'영화 제목',author:'감독',item:'영화',unit:'편',library:'영화관',shelf:'컬렉션',statusReading:'보는 중',tagline:'보고, 기억해요.'},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});localStorage.setItem(key,JSON.stringify(d));})()`)
  await navigate(base + '/pages/ui-movie')
  await wait('document.querySelector(".reading-heading")?.textContent.includes("영화 추가")', 'movie page')
  const movieText = await evaluate('document.querySelector(".reading-page").textContent')
  for (const expected of ['+ 영화 추가 · 검색', '보고, 기억해요.', '내 컬렉션', '보는 중', '0편', '내 영화관', '인생영화', '첫 컬렉션 만들기', '첫 영화 추가하기']) assert.ok(movieText.includes(expected), 'missing ' + expected)
  for (const builtin of ['책장', '서재', '읽는 중', '권 ·']) assert.ok(!movieText.includes(builtin), 'still shows ' + builtin)
  assert.equal(await evaluate('document.querySelector(".reading-toolbar input").placeholder'), '내 영화관에서 제목, 감독 검색')
  await shot('04b-reading-custom-words')
  await evaluate('document.querySelector("[data-tour=add-book]").click()')
  await wait('document.querySelector(".reading-modal")', 'movie search modal')
  const modalText = await evaluate('document.querySelector(".reading-modal").textContent + document.querySelector(".reading-modal .reading-toolbar input").placeholder')
  for (const expected of ['영화 검색', '직접 영화 추가', '영화 제목, 감독, ISBN 검색']) assert.ok(modalText.includes(expected), 'modal missing ' + expected)
  await evaluate('document.querySelector(".reading-modal header button").click()')
  await evaluate(`(() => {const key=${q(library)}; const d=JSON.parse(localStorage.getItem(key)); d.customPages=d.customPages.filter((page)=>page.id!=='ui-movie');localStorage.setItem(key,JSON.stringify(d));})()`)
  await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  await shot('05-date-time-mobile')
  await navigate(base + '/custom')
  await wait('document.querySelector("main article")','mobile card')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  await shot('06-cards-mobile')
  await evaluate('document.querySelector("[data-tour=new-page]").click()')
  await wait('document.querySelector(".page-wizard .template-preview")','mobile wizard')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".template-choice-grid")).gridTemplateColumns.split(" ").length'), 1)
  await evaluate('document.querySelectorAll(".template-choice-grid .template-card")[1].click()')
  await wait(`document.querySelector(".page-wizard .template-preview")?.textContent.includes(${q(samples[1])})`, 'mobile preview')
  assert.equal(await evaluate('document.querySelectorAll(".template-choice-grid .template-card")[1].getAttribute("aria-pressed")'), 'true')
  await new Promise((done) => setTimeout(done, 250))
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  await shot('07-wizard-mobile')
  await navigate(base + '/custom')
  await wait('document.querySelector("main article")','back to cards')
  await evaluate('document.querySelectorAll("main article button")[1].click()')
  await wait('document.querySelector("dialog[open]")','delete confirmation')
  await evaluate('document.querySelector(".app-confirm-action").click()')
  await wait('!document.querySelector("main article")','deleted')
  await navigate()
  await wait('document.querySelector("[data-tour=new-page]")','reload')
  assert.equal(await evaluate('!!document.querySelector("main article")'),false)
  await navigate(base + '/schedule')
  await wait('document.querySelector("main")?.textContent.length > 30','schedule')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  await shot('08-schedule-mobile')
  assert.equal(errors.length,0,errors.join('\n'))
  await finish(true)
  log('PASS create, rename, delete, reload persistence, wizard previews, no hub previews, custom reading words, edit with live preview, full width, date/time range, all-day, desktop/mobile overflow')

} catch (error) {
  log('FAIL ' + (error instanceof Error ? error.message : String(error)))
  await finish(false, { error: error instanceof Error ? error.stack : String(error) }).catch(() => undefined)
  throw error
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise((resolvePromise) => browser.once('exit', resolvePromise))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-customization-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}

