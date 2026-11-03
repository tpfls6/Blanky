import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve('.audit/runs/custom-page-features')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.CUSTOMIZATION_TEST_URL ?? 'http://127.0.0.1:5219'
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
        categories: [{id:"cat-a",name:"Category A",parentId:null,color:"#3C8664",icon:"Folder",kind:"general",sort:0}],
        items: [],
        settings: { locale: 'ko', onboardingPages: ['custom','diary','reading','memo'], customTemplatesGuideSeen: true },
        customPages: [{"id":"reading-a","name":"reading-a","template":"reading","icon":"BookOpen","description":"","sort":0,"schemaVersion":1,"blocks":[],"fieldLabels":{},"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"},{"id":"reading-b","name":"reading-b","template":"reading","icon":"BookOpen","description":"","sort":1,"schemaVersion":1,"blocks":[],"fieldLabels":{},"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"},{"id":"diary-a","name":"diary-a","template":"diary","icon":"BookOpen","description":"","sort":2,"schemaVersion":1,"blocks":[],"fieldLabels":{},"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"},{"id":"memo-a","name":"memo-a","template":"memo","icon":"BookOpen","description":"","sort":3,"schemaVersion":1,"blocks":[],"fieldLabels":{},"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"}],
        pageTemplates: [],
        recordTypes: [{"id":"reading-a","name":"reading-a","template":"reading","icon":"BookOpen","description":"","sort":0,"schemaVersion":1,"blocks":[],"fieldLabels":{},"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z","version":1,"color":"#3C8664"},{"id":"reading-b","name":"reading-b","template":"reading","icon":"BookOpen","description":"","sort":1,"schemaVersion":1,"blocks":[],"fieldLabels":{},"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z","version":1,"color":"#3C8664"},{"id":"diary-a","name":"diary-a","template":"diary","icon":"BookOpen","description":"","sort":2,"schemaVersion":1,"blocks":[],"fieldLabels":{},"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z","version":1,"color":"#3C8664"},{"id":"memo-a","name":"memo-a","template":"memo","icon":"BookOpen","description":"","sort":3,"schemaVersion":1,"blocks":[],"fieldLabels":{},"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z","version":1,"color":"#3C8664"}],
        records: [{"id":"book-a","typeId":"reading-a","title":"Legacy book","values":{"title":"Legacy book","author":"Author","note":"Old review","rating":4,"image":""},"templateVersion":1,"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"},{"id":"memo-row","typeId":"memo-a","title":"Page memo","values":{"title":"Page memo","body":"Existing memo","categoryId":"cat-a","tags":["tag"]},"templateVersion":1,"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"},{"id":"diary-row","typeId":"diary-a","title":"Page diary","values":{"manualTitle":"Page diary","body":"Diary body","date":"2026-11-03","isFavorite":false,"tags":["diary"]},"templateVersion":1,"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"}],
      }))
      localStorage.setItem('customization-test-seeded', '1')
    }).toString() + ')()',
  })


  const click = (text, scope = 'main') => evaluate(`[...document.querySelectorAll(${q(scope + ' button')})].find(b => b.textContent.trim() === ${q(text)})?.click()`)
  const setValue = (selector, value) => evaluate(`(() => {const el=document.querySelector(${q(selector)}); const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${q(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  const stored = expression => evaluate(`(() => {const d=JSON.parse(localStorage.getItem(${q(library)}));return ${expression};})()`)
  await navigate(base + '/reading')
  await wait('document.querySelector(".reading-toolbar")','builtin reading')
  const builtinTools = await evaluate('[...document.querySelectorAll(".reading-toolbar select")].map(e=>e.getAttribute("aria-label"))')
  await navigate(base + '/pages/reading-a')
  await wait('document.querySelector(".reading-book-card")','legacy book')
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".reading-toolbar select")].map(e=>e.getAttribute("aria-label"))'),builtinTools)
  await evaluate('document.querySelector("[aria-label=\\\"새 책장\\\"]").click()')
  await wait('document.querySelector(".reading-modal input")','shelf create')
  await setValue('.reading-modal input','Shelf A')
  await evaluate('document.querySelector(".reading-modal form").requestSubmit()')
  await wait('document.querySelector("[data-reading-shelf-id]")','shelf saved')
  await evaluate('document.querySelector(".reading-edit").click()')
  await wait('document.querySelector(".reading-modal input")','shelf edit')
  await setValue('.reading-modal input','Shelf renamed')
  await evaluate('document.querySelector(".reading-modal form").requestSubmit()')
  await wait('!document.querySelector(".reading-modal")','shelf updated')
  const rects=await evaluate('(() => {const a=document.querySelector(".reading-book-drag-handle").getBoundingClientRect(),b=document.querySelector("[data-reading-shelf-id]").getBoundingClientRect();return {ax:a.x+a.width/2,ay:a.y+a.height/2,bx:b.x+b.width/2,by:b.y+b.height/2};})()')
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rects.ax,y:rects.ay})
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:rects.ax,y:rects.ay,button:'left',clickCount:1})
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rects.bx,y:rects.by,buttons:1})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rects.bx,y:rects.by,button:'left',clickCount:1})
  await pause(100)
  await wait('document.querySelector("[data-reading-shelf-id] .reading-nav > span:last-child").textContent === "1"','book shelf membership')
  await pause(450)
  await evaluate('document.querySelector(".reading-book-card a").click()')
  await wait('document.querySelector("[aria-label=\\\"책 종류 편집\\\"]")','book detail stays on page')
  assert.equal(await evaluate('location.pathname'),'/pages/reading-a')
  await setValue('[aria-label="책 종류 편집"]','Custom category, Science')
  await evaluate('document.querySelector("[aria-label=\\\"책 종류 편집\\\"]").closest("form").requestSubmit()')
  await wait('!document.querySelector(".reading-modal") && !document.querySelector(".reading-record button:disabled")','metadata saved')
  await evaluate('document.querySelector(".reading-back").click()')
  await wait('document.querySelector("[aria-label=\\\"책 종류 필터\\\"] option[value=\\\"Custom category\\\"]")','category created')
  await setValue('[aria-label="책 종류 필터"]','Custom category')
  assert.equal(await evaluate('document.querySelectorAll(".reading-book-card").length'),1)
  await evaluate('document.querySelector(".reading-book-card a").click()')
  await wait('document.querySelector("[aria-label=\\\"책 종류 편집\\\"]")','category edit')
  await setValue('[aria-label="책 종류 편집"]','Updated category')
  await evaluate('document.querySelector("[aria-label=\\\"책 종류 편집\\\"]").closest("form").requestSubmit()')
  await wait('document.querySelector("[aria-label=\\\"책 종류 편집\\\"]").value === "Updated category"','category updated')
  await setValue('[aria-label="책 종류 편집"]','')
  await evaluate('document.querySelector("[aria-label=\\\"책 종류 편집\\\"]").closest("form").requestSubmit()')
  await evaluate('document.querySelector(".reading-back").click()')
  await wait('document.querySelector("[aria-label=\\\"책 종류 필터\\\"]")','back from detail')
  assert.equal(await evaluate('!!document.querySelector("option[value=\\\"Custom category\\\"]")'),false)
  await shot('01-reading-desktop')
  await evaluate('document.querySelector("[data-tour=add-book]").click()')
  await wait('document.querySelector(".reading-modal details")','book manual entry')
  await evaluate('document.querySelector(".reading-modal details").open=true')
  await setValue('.reading-modal details input','New manual book')
  await evaluate('document.querySelector(".reading-modal details form").requestSubmit()')
  await wait('document.querySelectorAll(".reading-book-card").length === 2','book created')
  await evaluate('document.querySelector(".reading-modal header button").click()')
  await navigate()
  await wait('document.querySelectorAll(".reading-book-card").length === 2','books retained')
  await navigate(base + '/pages/reading-b')
  await wait('document.querySelector(".reading-toolbar")','second page')
  assert.equal(await evaluate('document.querySelectorAll(".reading-book-card").length'),0)
  assert.equal(await evaluate('document.querySelectorAll("[data-reading-shelf-id]").length'),0)
  await navigate(base + '/pages/reading-a')
  await wait('document.querySelector(".reading-edit")','return to shelf')
  await evaluate('document.querySelector(".reading-edit").click()')
  await wait('document.querySelector(".reading-modal")','shelf dialog')
  await click('책장 삭제','.reading-modal')
  await wait('document.querySelector(".reading-modal h2")?.textContent === "삭제할까요?"','shelf deletion confirmation')
  await click('삭제','.reading-modal')
  await wait('!document.querySelector("[data-reading-shelf-id]")','shelf deleted')
  assert.equal(await evaluate('document.querySelectorAll(".reading-book-card").length'),2)
  await navigate(base + '/pages/memo-a')
  await wait('document.querySelector(".memo-folders")','memo category folders')
  assert.equal(await evaluate('document.querySelector(".memo-folders").textContent.includes("Category A")'),true)
  await evaluate('document.querySelector(".memo-editor [aria-haspopup=listbox]").click()')
  await wait('document.querySelector("[role=listbox]")','memo category picker')
  await evaluate('[...document.querySelectorAll("[role=option]")].find(e=>e.textContent.includes("없음")).click()')
  await evaluate('document.querySelector(".memo-editor").requestSubmit()')
  await wait(`JSON.parse(localStorage.getItem(${q(library)})).records.find(r=>r.id==='memo-row').values.categoryId === ''`,'memo category saved')
  await shot('02-memo-desktop')
  await navigate(base + '/pages/diary-a')
  await wait('document.querySelector(".diary-list-star")','diary')
  await evaluate('document.querySelector(".diary-list-star").click()')
  await wait('document.querySelector(".diary-list-star").getAttribute("aria-pressed") === "true"','diary favorite')
  await evaluate('document.querySelector(".diary-view-toggle").click()')
  await wait('document.querySelector(".diary-calendar")','diary calendar')
  await shot('03-diary-desktop')
  await navigate(base + '/custom')
  await wait('document.querySelector("[data-tour=new-page]")','customization')
  await evaluate('document.querySelector("[data-tour=new-page]").click()')
  await wait('document.querySelector(".template-choice-grid")','three choices')
  assert.ok(await evaluate('parseFloat(getComputedStyle(document.querySelector(".template-choice-grid")).gap) >= 16'))
  await shot('04-choices-desktop')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".template-choice-grid")).gridTemplateColumns.split(" ").length'),1)
  await shot('05-choices-mobile')
  await navigate(base + '/pages/reading-a')
  await wait('document.querySelector(".reading-book-card")','mobile reading')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  await shot('06-reading-mobile')
  await navigate(base + '/pages/memo-a')
  await wait('document.querySelector(".memo-layout")','mobile memo')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  await shot('07-memo-mobile')
  assert.equal(errors.length,0,errors.join('\n'))
  await finish(true)
  log('PASS builtin/custom reading controls, shelf CRUD and drag membership, category CRUD and filtering, manual book creation/reload/isolation, memo category persistence, diary favorite/calendar, desktop/mobile choice spacing and overflow')

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

