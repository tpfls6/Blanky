import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const started = new Date().toISOString()
const evidenceDir = resolve('c:/Users/serin/Github/Blanky/.audit/runs/workspace-builder-views')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:5199'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtempSafe()
async function mkdtempSafe() {
  const { mkdtemp } = await import('node:fs/promises')
  return mkdtemp(join(tmpdir(), 'blanky-workspace-test-'))
}

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
for (let i = 0; i < 150; i++) {
  try { if ((await fetch(base)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 200))
  if (i === 149) throw new Error(serverOutput || 'vite did not start on ' + base)
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
  const payload = {
    started,
    ended: new Date().toISOString(),
    ok,
    log: logLines,
    errors,
    extra: extra ?? null,
    serverTail: serverOutput.slice(-1500),
  }
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify(payload, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
}

function setFieldSrc() {
  return `const set = (el, value) => { if (!el) return; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }`
}

async function clickText(text) {
  const ok = await evaluate(`(() => {
    const node = [...document.querySelectorAll("button,a")].find((el) => el.textContent.replace(/\\s+/g, " ").includes(${q(text)}))
    node?.click()
    return Boolean(node)
  })()`)
  assert.equal(ok, true, 'missing click target ' + text)
}

async function setInput(selector, value) {
  await evaluate(`(() => { ${setFieldSrc()}; set(document.querySelector(${q(selector)}), ${q(value)}); })()`)
}

async function setLabeled(label, value) {
  await evaluate(`(() => {
    ${setFieldSrc()}
    const lab = [...document.querySelectorAll("label")].find((el) => (el.querySelector("span")?.textContent || el.textContent).trim().startsWith(${q(label)}))
    set(lab?.querySelector("input,textarea"), ${q(value)})
  })()`)
}

async function createPage(kind, name, labels) {
  await navigate(base + '/custom')
  await wait('document.querySelector("h1")?.textContent.includes("커스텀 템플릿")', 'custom hub')
  await evaluate('document.querySelector("[data-tour=new-page]")?.click()')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.includes("일기형"))', 'wizard kinds')
  await clickText(kind)
  await wait('document.querySelector(\'input[aria-label="페이지 이름"]\')', 'name field')
  await setInput('input[aria-label="페이지 이름"]', name)
  await clickText('다음')
  await wait('document.querySelector("label input")', 'field labels')
  for (const [from, to] of labels) await setLabeled(from, to)
  await clickText('다음')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim()==="페이지 만들기")', 'preview')
  await clickText('페이지 만들기')
  await wait('location.pathname.startsWith("/pages/")', name + ' route')
  await wait('document.querySelector("h1")?.textContent.trim()===' + q(name), name + ' heading')
  const id = await evaluate('location.pathname.split("/")[2]')
  log('created ' + kind + ' ' + name + ' ' + id)
  return id
}

function titlesOf(name) {
  return `(() => {
    const lib = JSON.parse(localStorage.getItem(${q(library)}))
    const page = lib.customPages.find((item) => item.name === ${q(name)})
    return lib.records.filter((item) => item.typeId === page.id).map((item) => item.title)
  })()`
}

async function finishOk(extra) {
  assert.equal(errors.length, 0, errors.join('\n'))
  await finish(true, extra)
  log('PASS template pages crud isolation builtins')
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + (() => {
      if (!location.hostname || localStorage.getItem('workspace-test-seeded')) return
      const owner = '11111111-1111-4111-8111-111111111111'
      localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id: owner, name: 'Test', nickname: 'Test', email: 'test@example.test', password: 'test-only', avatar: null }]))
      localStorage.setItem('blanky.session.v1', owner)
      localStorage.setItem('blanky.library.' + owner, JSON.stringify({
        categories: [],
        items: [],
        settings: { locale: 'ko', customTemplatesGuideSeen: true },
        customPages: [],
        pageTemplates: [],
        recordTypes: [],
        records: [],
      }))
      localStorage.setItem('workspace-test-seeded', '1')
    }).toString() + ')()',
  })

  await navigate(base + '/custom')
  await wait('localStorage.getItem("blanky.session.v1")==="' + owner + '"', 'seeded session')
  log('logged in as seeded local user')
  await wait('document.querySelector("h1")?.textContent.includes("커스텀 템플릿")', 'custom hub')
  await wait('document.querySelector("[data-tour=new-page]")', 'new record')
  await shot('01-custom-hub')

  const workoutId = await createPage('일기형', '운동', [['오늘의 기분', '운동 컨디션']])
  await wait('[...document.querySelectorAll("nav a")].some(a => a.textContent.includes("운동"))', 'sidebar workout')
  await clickText('새 기록')
  await wait('document.querySelector(".diary-title-input")', 'diary editor')
  await wait('![...document.querySelectorAll("summary")].some(el => el.textContent.includes("페이지 설정"))', 'no in-page settings')
  await wait('[...document.querySelectorAll("legend")].some(el => el.textContent.trim()==="운동 컨디션")', 'renamed mood')
  await setInput('.diary-title-input', '스쿼트')
  await setInput('.diary-body-input', '하체')
  await wait(titlesOf('운동') + '.includes("스쿼트")', 'workout record')
  await navigate(base + '/custom')
  await wait('document.querySelector("h1")?.textContent.includes("커스텀 템플릿")', 'custom hub settings')
  await clickText('페이지 설정')
  await setLabeled('제목', '운동 이름')
  await navigate(base + '/pages/' + workoutId)
  await wait('document.querySelector(".diary-title-input")?.getAttribute("aria-label")==="운동 이름"', 'title label updated')
  await wait(titlesOf('운동') + '.includes("스쿼트")', 'record kept after rename')
  await shot('02-diary-custom')

  const tripId = await createPage('일기형', '여행', [])
  await clickText('새 기록')
  await wait('document.querySelector(".diary-title-input")', 'trip editor')
  await setInput('.diary-title-input', '제주')
  await setInput('.diary-body-input', '바다')
  await wait(titlesOf('여행') + '.includes("제주")', 'trip record')

  const movieId = await createPage('독서형', '영화', [['책 제목', '영화 제목'], ['저자', '감독'], ['독서 감상', '영화 감상']])
  await clickText('기록 추가')
  await wait('[...document.querySelectorAll("label")].some(el => el.textContent.includes("영화 제목"))', 'reading labels')
  await setLabeled('영화 제목', '기생충')
  await setLabeled('감독', '봉준호')
  await evaluate('document.querySelector("form.reading-form button.btn-primary")?.click()')
  await wait(titlesOf('영화') + '.includes("기생충")', 'movie record')
  await shot('03-reading-custom')

  const ideaId = await createPage('메모형', '아이디어', [])
  await clickText('메모 작성')
  await wait('document.querySelector(".memo-title")', 'memo editor')
  await setInput('.memo-title', '새 프로젝트')
  await evaluate('document.querySelector(".memo-editor button[type=submit]")?.click()')
  await wait(titlesOf('아이디어') + '.includes("새 프로젝트")', 'memo record')
  await shot('04-memo-custom')

  const isolation = await evaluate(`(() => {
    const lib = JSON.parse(localStorage.getItem(${q(library)}))
    const titles = (name) => {
      const page = lib.customPages.find((item) => item.name === name)
      return lib.records.filter((item) => item.typeId === page.id).map((item) => item.title)
    }
    return {
      pages: lib.customPages.map((page) => [page.name, page.template]),
      workout: titles('운동'),
      trip: titles('여행'),
      movie: titles('영화'),
      idea: titles('아이디어'),
      mood: lib.customPages.find((page) => page.name === '운동').fieldLabels.mood,
    }
  })()`)
  assert.deepEqual(isolation.pages, [['운동', 'diary'], ['여행', 'diary'], ['영화', 'reading'], ['아이디어', 'memo']])
  assert.deepEqual(isolation.workout, ['스쿼트'])
  assert.deepEqual(isolation.trip, ['제주'])
  assert.deepEqual(isolation.movie, ['기생충'])
  assert.deepEqual(isolation.idea, ['새 프로젝트'])
  assert.equal(isolation.mood, '운동 컨디션')
  log('isolation ' + JSON.stringify(isolation))

  await navigate()
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).customPages.length===4', 'pages after reload')
  await wait(titlesOf('운동') + '.includes("스쿼트") && ' + titlesOf('영화') + '.includes("기생충")', 'records after reload')
  await wait('document.querySelector("h1")?.textContent.trim()==="아이디어"', 'reopened memo')
  log('reload kept pages and records')
  await shot('05-after-reload')

  await navigate(base + '/diary')
  await wait('document.querySelector(".diary-page")', 'builtin diary')
  await wait('!JSON.parse(localStorage.getItem(' + q(library) + ')).diaries?.some(d => d.title==="스쿼트")', 'builtin diary isolated')
  await navigate(base + '/reading')
  await wait('document.querySelector(".reading-page")', 'builtin reading')
  await navigate(base + '/memo')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.includes("메모 작성"))', 'builtin memo')
  await navigate(base + '/schedule')
  await wait('document.querySelector(\'input[aria-label="일정 또는 할 일"]\')', 'schedule')
  log('builtin diary reading memo schedule ok')
  await shot('06-schedule')

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await navigate(base + '/custom')
  await wait('document.querySelector("[data-tour=new-page]")', 'mobile hub')
  await evaluate('document.querySelector("[data-tour=new-page]")?.click()')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.includes("메모형"))', 'mobile wizard')
  await shot('07-mobile-wizard')

  await finishOk({ workoutId, tripId, movieId, ideaId, isolation })
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
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-workspace-test-')) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}
