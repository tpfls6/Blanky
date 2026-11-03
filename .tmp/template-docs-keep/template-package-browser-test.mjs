import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.TEMPLATE_TEST_URL ?? 'http://127.0.0.1:5198'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.TEMPLATE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set TEMPLATE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-template-test-'))
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
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
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
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? ''))
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
  throw new Error('Timed out: ' + label + '\n' + (await evaluate('location.href + "\\n" + document.body.innerText.slice(0, 800)')) + '\n' + serverOutput.slice(-800))
}
const q = (value) => JSON.stringify(value)
async function button(text) {
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()')
}
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.type==="textarea"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true}));})()')
}
async function upload(label, file) {
  const doc = await send('DOM.getDocument')
  const found = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[aria-label=' + q(label) + ']' })
  assert.ok(found.nodeId, label)
  await send('DOM.setFileInputFiles', { nodeId: found.nodeId, files: [file] })
}

const owner = '44444444-4444-4444-8444-444444444444'
const outDir = resolve('.tmp/template-package-tests')
await mkdir(outDir, { recursive: true })
const diary = {
  formatVersion: 1,
  kind: 'blanky.template-package',
  id: 'my-diary-file',
  name: '파일 일기',
  description: '일기 템플릿',
  author: 'tester',
  version: '1.0.0',
  pageType: 'diary',
  icon: 'BookOpen',
  fieldLabels: { mood: '오늘의 컨디션' },
}
const packagePath = resolve('examples/workout-record.blankytpl')
const diaryPath = join(outDir, 'Diary.blankytpl')
const badPath = join(outDir, 'Bad.blankytpl')
await writeFile(diaryPath, JSON.stringify(diary, null, 2))
await writeFile(badPath, '<script>alert(1)</script>')
const screenshot = async (name) => {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  await writeFile(join(outDir, name + '.png'), Buffer.from(result.data, 'base64'))
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'if(location.origin === ' + q(base) + ' && !localStorage.getItem("blanky.template.test.seeded")){localStorage.setItem("blanky.accounts.v1",JSON.stringify([{id:' + q(owner) + ',name:"Template Test",nickname:"템플릿 테스트",email:"template-test@example.test",password:"test-only",avatar:null}]));localStorage.setItem("blanky.session.v1",' + q(owner) + ');localStorage.setItem("blanky.library.' + owner + '",JSON.stringify({items:[],categories:[],settings:{locale:"ko",customTemplatesGuideSeen:true,nav:[{id:"home",visible:true},{id:"schedule",visible:true},{id:"custom",visible:true}]},diaries:[],recordTypes:[],customPages:[],pageTemplates:[],records:[]}));localStorage.setItem("blanky.template.test.seeded","1");}',
  })
  await navigate(base + '/custom')
  await wait('document.querySelector("h1")', 'custom page')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.includes("건너뛰기"))?.click()')
  await wait('!!document.querySelector(".theme-dropzone")', 'import dropzone')
  assert.match(await evaluate('document.body.innerText'), /커스텀 템플릿/)
  await screenshot('import-dropzone')

  await upload('.blankytpl 파일 가져오기', badPath)
  await wait('document.body.innerText.includes("HTML") || document.body.innerText.includes("JSON") || document.body.innerText.includes("실패")', 'bad file')
  await screenshot('bad-file')

  await upload('.blankytpl 파일 가져오기', packagePath)
  await wait('!!document.querySelector(".theme-import-review")', 'package review')
  assert.match(await evaluate('document.querySelector(".theme-import-review").innerText'), /운동 기록/)
  assert.match(await evaluate('document.querySelector(".theme-import-review").innerText'), /blanky/)
  await screenshot('import-review')
  await button('템플릿 추가')
  await wait('document.body.innerText.includes("내 템플릿에 저장") || document.body.innerText.includes("운동 기록")', 'installed')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "기록 만들기")', 'create record button')

  await upload('.blankytpl 파일 가져오기', packagePath)
  await wait('document.body.innerText.includes("이미 설치된 템플릿")', 'conflict')
  await screenshot('import-conflict')
  await button('별도 저장')
  await wait('[...document.querySelectorAll("li")].filter(li => li.innerText.includes("운동 기록")).length >= 2', 'copy saved')

  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "기록 만들기").click()')
  await wait('location.pathname.startsWith("/records/")', 'record page')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "추가")', 'add record')
  await button('추가')
  await wait('document.querySelector("input[placeholder=\\"스쿼트\\"]")', 'title field')
  await wait('document.body.innerText.includes("세트") && document.body.innerText.includes("횟수") && document.body.innerText.includes("중량") && document.body.innerText.includes("메모")', 'workout fields')
  await fill('input[placeholder="스쿼트"]', '스쿼트')
  await evaluate('[...document.querySelectorAll("input[type=\\"number\\"]")].forEach((el, i) => { const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"); proto.set.call(el, String([4, 8, 60][i] ?? 1)); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); })')
  await evaluate('(()=>{const el=document.querySelector("textarea"); const proto=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value"); proto.set.call(el,"무릎이 살짝 아팠음"); el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true}));})()')
  await button('저장')
  await wait('document.body.innerText.includes("스쿼트")', 'saved row')
  const typeId = await evaluate('location.pathname.split("/")[2]')
  await navigate(base + '/records/' + typeId)
  await wait('document.body.innerText.includes("스쿼트")', 'reload record')

  await navigate(base + '/custom')
  await wait('!!document.querySelector(".theme-dropzone")', 'back to custom')
  const before = await evaluate('JSON.parse(localStorage.getItem("blanky.library.' + owner + '")).records.filter(r => r.title === "스쿼트").length')
  assert.equal(before, 1)
  await evaluate('[...document.querySelectorAll("li")].find(li => li.innerText.includes("운동 기록") && !li.innerText.includes("복사본")).querySelector("button:last-of-type").click()')
  await wait('!!document.querySelector(".app-confirm-action")', 'delete confirm')
  await evaluate('document.querySelector(".app-confirm-action").click()')
  await pause(400)
  const after = await evaluate('JSON.parse(localStorage.getItem("blanky.library.' + owner + '")).records.filter(r => r.title === "스쿼트").length')
  assert.equal(after, 1, 'records survive template delete')

  await upload('.blankytpl 파일 가져오기', diaryPath)
  await wait('document.querySelector(".theme-import-review") && document.querySelector(".theme-import-review").innerText.includes("파일 일기")', 'diary review')
  await button('템플릿 추가')
  await wait('[...document.querySelectorAll("li")].some(li => li.innerText.includes("파일 일기"))', 'diary installed')
  await evaluate('[...document.querySelectorAll("li")].find(li => li.innerText.includes("파일 일기")).querySelector("button").click()')
  await wait('location.pathname.startsWith("/pages/")', 'diary page')
  await wait('document.body.innerText.includes("일기형") || document.body.innerText.includes("파일 일기")', 'diary page body')

  await navigate(base + '/custom')
  await wait('!!document.querySelector(".theme-dropzone")', 'custom after diary')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await pause(200)
  await screenshot('mobile-library')
  assert.equal(await evaluate('!!document.querySelector(".theme-dropzone")'), true)
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: import, preview, install, conflict, records, refresh, delete-keeps-records, diary page, mobile.')
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise((resolvePromise) => browser.once('exit', resolvePromise))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-template-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
