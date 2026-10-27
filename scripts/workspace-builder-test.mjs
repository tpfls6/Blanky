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

async function finishOk(extra) {
  assert.equal(errors.length, 0, errors.join('\n'))
  await finish(true, extra)
  log('PASS kanban drop chart bars edit-to-view')
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
  await wait('document.querySelector("[data-tour=starters]")', 'starters')

  await evaluate('[...document.querySelector("[data-tour=starters]").querySelectorAll("button")].find(b => b.textContent.includes("프로젝트 관리"))?.click()')
  await wait('location.pathname.startsWith("/pages/")', 'project page')
  const projectId = await evaluate('location.pathname.split("/")[2]')
  log('opened project starter /pages/' + projectId)
  await wait('[...document.querySelectorAll("[data-kanban-col]")].length>=3', 'kanban columns')
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim()==="추가")', 'collection add')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="추가")?.click()')
  await wait('document.querySelector("input.text-2xl")', 'task title')
  await evaluate('(() => { ' + setFieldSrc() + '; set(document.querySelector("input.text-2xl"), "칸반카드"); [...document.querySelectorAll("button")].find(b => b.textContent.includes("할 일"))?.click(); })()')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="저장")?.click()')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).records.some(r => r.title==="칸반카드")', 'kanban card saved')
  await wait('document.querySelector("[data-kanban-card]")', 'kanban card in column')
  await shot('01-kanban-before-drop')

  const drop = await evaluate(`(() => {
    const card = document.querySelector("[data-kanban-card]")
    const from = card?.closest("[data-kanban-col]")
    const to = [...document.querySelectorAll("[data-kanban-col]")].find((col) => col.querySelector("h3")?.textContent.trim() === "완료")
    if (!card || !to) return { ok: false }
    const dt = new DataTransfer()
    dt.setData("text/plain", card.getAttribute("data-kanban-card"))
    card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }))
    to.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }))
    to.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }))
    return { ok: true, id: card.getAttribute("data-kanban-card"), from: from?.getAttribute("data-kanban-col"), to: to.getAttribute("data-kanban-col") }
  })()`)
  assert.equal(drop.ok, true, 'kanban drop targets missing')
  await wait('(() => { const lib = JSON.parse(localStorage.getItem(' + q(library) + ')); const rec = lib.records.find(r => r.title==="칸반카드"); const type = lib.recordTypes.find(t => t.id===rec.typeId); const field = type.blocks.find(b => b.type==="select"); const done = field.props.options.find(o => o.label==="완료"); return rec.values[field.fieldKey]===done.id; })()', 'select saved as 완료')
  log('kanban drop wrote 완료 ' + JSON.stringify(drop))
  await shot('02-kanban-after-drop')

  await navigate()
  await wait('document.querySelector("[data-kanban-card]")', 'kanban after reload')
  const afterReload = await evaluate(`(() => {
    const lib = JSON.parse(localStorage.getItem(${q(library)}))
    const rec = lib.records.find((r) => r.title === "칸반카드")
    const type = lib.recordTypes.find((t) => t.id === rec.typeId)
    const field = type.blocks.find((b) => b.type === "select")
    const done = field.props.options.find((o) => o.label === "완료")
    const col = document.querySelector("[data-kanban-col=\\"" + done.id + "\\"]")
    return {
      value: rec.values[field.fieldKey],
      doneId: done.id,
      inDoneColumn: Boolean(col?.querySelector("[data-kanban-card=\\"" + rec.id + "\\"]")),
    }
  })()`)
  assert.equal(afterReload.value, afterReload.doneId)
  assert.equal(afterReload.inDoneColumn, true)
  log('kanban kept 완료 after reload')
  await shot('03-kanban-after-reload')

  await navigate(base + '/custom')
  await wait('document.querySelector("[data-tour=starters]")', 'hub for workout')
  await evaluate('[...document.querySelector("[data-tour=starters]").querySelectorAll("button")].find(b => b.textContent.includes("운동 관리"))?.click()')
  await wait('location.pathname.startsWith("/pages/") && location.pathname.split("/")[2]!=="' + projectId + '"', 'workout page')
  const workoutId = await evaluate('location.pathname.split("/")[2]')
  log('opened workout starter /pages/' + workoutId)
  await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim()==="추가")', 'workout add')

  async function addLift(title, date, kg, reps) {
    await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="추가")?.click()')
    await wait('document.querySelector("input.text-2xl")', 'lift title ' + title)
    await evaluate('(() => { ' + setFieldSrc() + '; set(document.querySelector("input.text-2xl"), ' + q(title) + '); set(document.querySelector("input[type=date]"), ' + q(date) + '); const numbers = [...document.querySelectorAll("input[type=number]")]; if (numbers[0]) set(numbers[0], ' + q(String(kg)) + '); if (numbers[1]) set(numbers[1], ' + q(String(reps)) + '); })()')
    await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="저장")?.click()')
    await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).records.some(r => r.title===' + q(title) + ')', title + ' saved')
  }
  await addLift('스쿼트', '2026-10-27', 40, 8)
  await addLift('벤치', '2026-10-27', 20, 6)
  await evaluate('[...document.querySelectorAll("[role=tab]")].find(b => b.textContent.includes("차트"))?.click()')
  await wait('document.querySelector("[data-chart-bar=\\"2026-10-27\\"]")', 'chart bar')
  const chart = await evaluate(`(() => {
    const bar = document.querySelector('[data-chart-bar="2026-10-27"]')
    const row = bar?.closest("li")
    return { text: row?.innerText ?? "", width: bar ? getComputedStyle(bar).width : "0px" }
  })()`)
  assert.match(chart.text, /2026-10-27/)
  assert.match(chart.text, /60/)
  assert.notEqual(chart.width, '0px')
  log('chart 2026-10-27 summed to 60 width=' + chart.width)
  await shot('04-chart-bars')

  await evaluate('(() => { ' + setFieldSrc() + '; const heading = [...document.querySelectorAll("textarea")].find(el => el.value==="운동 관리"); set(heading, "운동 관리 본문"); })()')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).customPages.find(p => p.id==="' + workoutId + '").blocks.some(b => b.props && b.props.text==="운동 관리 본문")', 'heading stored')
  await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim()==="편집")?.click()')
  await wait('[...document.querySelectorAll("p")].some(p => p.textContent==="운동 관리 본문")', 'view mode heading')
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b => b.textContent.trim()==="읽기")'), true)
  log('view mode shows edited heading')
  await shot('05-view-after-edit')

  await navigate(base + '/custom')
  await wait('document.querySelector("h1")', 'hub after edit')
  await evaluate('(() => { const heading = [...document.querySelectorAll("h2")].find(h => h.textContent.includes("내가 만든 페이지")); const link = [...heading.parentElement.querySelectorAll("a")].find(a => a.textContent.includes("운동 관리")); link?.click(); })()')
  await wait('location.pathname==="/pages/' + workoutId + '"', 'reopened workout')
  await wait('JSON.parse(localStorage.getItem(' + q(library) + ')).customPages.find(p => p.id==="' + workoutId + '").blocks.some(b => b.props && b.props.text==="운동 관리 본문")', 'heading after reopen')
  await wait('[...document.querySelectorAll("textarea,p")].some(el => (el.value || el.textContent)==="운동 관리 본문")', 'heading visible after reopen')
  log('reopened workout kept heading')
  await shot('06-reopen-after-edit')

  await finishOk({ projectId, workoutId, drop, afterReload, chart })
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
