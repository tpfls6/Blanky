import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'category-picker')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.CUSTOMIZATION_TEST_URL ?? 'http://127.0.0.1:5221'
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
        categories: [{id:"project",name:"Project",parentId:null,color:"#3C8664",icon:"Folder"},{id:"backend",name:"Backend",parentId:"project",color:"#3A62B0",icon:"Code"},{id:"personal",name:"Personal",parentId:null,color:"#A85050",icon:"Heart"}],
        items: [],
        settings: { locale: 'ko', onboardingPages: ['home','custom','diary','reading','memo'], customTemplatesGuideSeen: true },
        customPages: [],
        pageTemplates: [],
        recordTypes: [],
        records: [],
      }))
      const d=JSON.parse(localStorage.getItem('blanky.library.'+owner)); const date=new Date().toLocaleDateString('en-CA'); const item={id:'category-task',kind:'task',title:'Category test',description:'',date,startTime:null,endTime:null,duration:30,categoryId:'backend',priority:'medium',status:'todo',dueDate:null,endDate:null,allDay:false,repeat:'none'}; d.items=[item];d.settings.onboardingDone=true;localStorage.setItem('blanky.library.'+owner,JSON.stringify(d));localStorage.setItem('blanky.homeChat.'+owner,JSON.stringify([{id:'saved',role:'assistant',text:'Saved',createdAt:new Date().toISOString(),status:'saved',items:[item]}]));
      localStorage.setItem('customization-test-seeded', '1')
    }).toString() + ')()',
  })



  const click = async selector => {
    await evaluate(`document.querySelector(${q(selector)}).scrollIntoView({block:'center'})`)
    const point = await evaluate(`(() => {const r=document.querySelector(${q(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`)
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1})
  }
  const fill = (selector,value) => evaluate(`(() => {const e=document.querySelector(${q(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${q(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  const storedCategory = `JSON.parse(localStorage.getItem(${q(library)})).items.find(i=>i.id==='category-task').categoryId`
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")','home')
  await click('[aria-controls="home-chat-panel"]')
  await wait('document.querySelector("[data-work-chip]")','saved chip')
  await click('[data-work-chip]')
  await wait('document.querySelector("dialog[open] [aria-haspopup=listbox]")','home editor')
  assert.match(await evaluate('document.querySelector("dialog[open] [aria-haspopup=listbox]").textContent'),/Project.*Backend/)
  await click('dialog[open] [aria-haspopup=listbox]')
  await wait('document.querySelector("[popover]:popover-open")','popover in top layer')
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'카테고리 검색')
  assert.equal(await evaluate('!!document.querySelector("dialog[open] [popover]:popover-open")'),true,'menu belongs to modal')
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[role=option]")].map(e=>e.textContent.trim())'),['없음','Project','Backend','Personal'])
  await shot('01-home-dialog-desktop')
  await fill('[popover] input','Personal')
  await wait('document.querySelectorAll("[role=option]").length === 1','category search')
  await click('[role=option]')
  assert.match(await evaluate('document.querySelector("dialog[open] [aria-haspopup=listbox]").textContent'),/Personal/)
  await evaluate('document.querySelector("dialog[open] form").requestSubmit()')
  await wait(storedCategory + ' === "personal"','saved home category')
  await navigate(base + '/schedule')
  await wait('[...document.querySelectorAll("main button")].some(b=>b.textContent.trim()==="Category test")','schedule task')
  await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent.trim()==="Category test").click()')
  await wait('document.querySelector("form [aria-haspopup=listbox]")','schedule editor')
  await click('form [aria-haspopup=listbox]')
  await wait('document.querySelector("[popover]:popover-open")','schedule menu')
  await shot('02-schedule-desktop')
  await fill('[popover] input','Project')
  await wait('document.querySelectorAll("[role=option]").length === 2','parent search includes children')
  await click('[role=option]:last-child')
  await evaluate('document.querySelector("form [aria-haspopup=listbox]").closest("form").requestSubmit()')
  await wait(storedCategory + ' === "backend"','saved schedule category')
  await navigate(base + '/')
  await wait('document.querySelector("#home-entry")','mobile home')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await click('[aria-controls="home-chat-panel"]')
  await wait('document.querySelector("[data-work-chip]")','mobile chip')
  await click('[data-work-chip]')
  await wait('document.querySelector("dialog[open] [aria-haspopup=listbox]")','mobile modal')
  await click('dialog[open] [aria-haspopup=listbox]')
  await wait('document.querySelector("[popover]:popover-open")','mobile category menu')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  assert.equal(await evaluate('(() => {const r=document.querySelector("[popover]").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;})()'),true)
  await shot('03-home-dialog-mobile')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await wait('!document.querySelector("[popover]:popover-open")','escape closes category only')
  assert.equal(await evaluate('!!document.querySelector("dialog[open]")'),true)
  await click('dialog[open] [aria-haspopup=listbox]')
  await wait('document.querySelector("[popover]:popover-open")','reopen category')
  await click('[role=option]')
  await evaluate('document.querySelector("dialog[open] form").requestSubmit()')
  await wait(storedCategory + ' === null','clear category saved')
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await fill('#home-entry','내일 3시 치과')
  await click('[aria-label="보내기"]')
  await wait('document.querySelector("[data-chat-status=review]")','home analysis review')
  await evaluate('[...document.querySelectorAll("[data-chat-status=review] button")].find(b=>b.textContent.trim()==="확인 후 저장").click()')
  await wait('document.querySelector("[data-analysis-item] [aria-haspopup=listbox]")','shared picker in analysis')
  await click('[data-analysis-item] [aria-haspopup=listbox]')
  await wait('document.querySelector("[popover]:popover-open")','analysis popover')
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[role=option]")].map(e=>e.textContent.trim())'),['없음','Project','Backend','Personal'])
  await fill('[popover] input','Backend')
  await wait('document.querySelectorAll("[role=option]").length === 1','analysis search')
  await click('[role=option]')
  assert.match(await evaluate('document.querySelector("[data-analysis-item] [aria-haspopup=listbox]").textContent'),/Project.*Backend/)
  await shot('04-home-analysis-category')
  assert.equal(errors.length,0,errors.join('\n'))
  await finish(true)
  log('PASS home modal and schedule category hierarchy, real pointer selection/search, save/reload, mobile top layer/viewport, Escape, clearing category')

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

