import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(resolve('.tmp/pw/package.json'))
const { chromium } = require('playwright')

const started = new Date().toISOString()
const evidenceDir = resolve('c:/Users/serin/Github/Blanky/.audit/runs/workspace-builder-pointer')
await mkdir(evidenceDir, { recursive: true })
const logLines = [`started ${started}`]
function log(line) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  console.log(line)
}

const base = 'http://127.0.0.1:5200'
const chrome = join(homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe')
const owner = '11111111-1111-4111-8111-111111111111'
const library = 'blanky.library.' + owner

const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: 5200, strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(base)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 100))
  if (i === 79) throw new Error('vite did not start')
}
log('vite ' + base)

const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.addInitScript(() => {
  if (localStorage.getItem('workspace-test-seeded')) return
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
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

async function shot(name) {
  await page.screenshot({ path: join(evidenceDir, name + '.png') })
  log('screenshot ' + name + '.png')
}

async function cardState() {
  return page.evaluate((key) => {
    const lib = JSON.parse(localStorage.getItem(key))
    const rec = lib.records.find((row) => row.title === '칸반카드')
    if (!rec) return { present: false }
    const type = lib.recordTypes.find((item) => item.id === rec.typeId)
    const field = type.blocks.find((block) => block.type === 'select')
    const done = field.props.options.find((option) => option.label === '완료')
    const todo = field.props.options.find((option) => option.label === '할 일')
    const col = document.querySelector('[data-kanban-col="' + done.id + '"]')
    return {
      present: true,
      value: rec.values[field.fieldKey],
      doneId: done.id,
      todoId: todo.id,
      inDoneColumn: Boolean(col?.querySelector('[data-kanban-card="' + rec.id + '"]')),
      inTodoColumn: Boolean(document.querySelector('[data-kanban-col="' + todo.id + '"] [data-kanban-card="' + rec.id + '"]')),
    }
  }, library)
}

async function finish(ok, extra) {
  const payload = {
    started,
    ended: new Date().toISOString(),
    ok,
    log: logLines,
    errors,
    extra: extra ?? null,
  }
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify(payload, null, 2))
  await writeFile(join(evidenceDir, 'log.txt'), logLines.join('\n') + '\n')
}

const methods = []
async function record(name, kind, moved, note) {
  const row = { name, kind, moved, note, state: await cardState() }
  methods.push(row)
  log(name + ' moved=' + moved + ' ' + note)
  return row
}

try {
  await page.goto(base + '/custom', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1, input[type=email], [data-tour=starters]', { timeout: 60000 })
  log('landed ' + page.url() + ' h1=' + (await page.locator('h1').first().textContent().catch(() => '')))
  await shot('00-landed')
  if (page.url().includes('/login')) {
    await page.getByLabel(/이메일|email/i).or(page.locator('input[type=email]')).fill('test@example.test')
    await page.locator('input[type=password]').fill('test-only')
    await page.getByRole('button', { name: '로그인', exact: true }).click()
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
    await page.goto(base + '/custom', { waitUntil: 'domcontentloaded' })
  }
  await page.waitForSelector('[data-tour=starters]', { timeout: 30000 })
  await page.locator('[data-tour=starters] button').filter({ hasText: '프로젝트 관리' }).click()
  await page.waitForURL(/\/pages\//)
  await page.waitForSelector('[data-kanban-col]')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '추가')?.click())
  await page.waitForSelector('input.text-2xl')
  await shot('00b-form')
  await page.evaluate(() => {
    const set = (el, value) => {
      if (!el) return
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    set(document.querySelector('input.text-2xl'), '칸반카드')
    ;[...document.querySelectorAll('form button')].find((b) => b.textContent.includes('할 일'))?.click()
  })
  await page.waitForTimeout(150)
  await page.evaluate(() => {
    ;[...document.querySelectorAll('form button')].find((b) => b.textContent.trim() === '저장')?.click()
  })
  const saved = await page.evaluate((key) => {
    const lib = JSON.parse(localStorage.getItem(key) || '{}')
    return { titles: (lib.records || []).map((row) => row.title), values: lib.records?.[0]?.values, types: (lib.recordTypes || []).map((row) => row.name) }
  }, library)
  log('after save ' + JSON.stringify(saved))
  await page.waitForSelector('[data-kanban-card]', { timeout: 10000 })
  await page.waitForSelector('[data-kanban-card]')
  const projectId = page.url().split('/pages/')[1]
  log('opened project ' + projectId)
  await shot('01-before-pointer')

  const card = page.locator('[data-kanban-card]').first()
  const done = page.locator('[data-kanban-col]').filter({ has: page.locator('h3', { hasText: '완료' }) })

  await card.dragTo(done, { force: true })
  await page.waitForTimeout(200)
  let state = await cardState()
  await record('playwright.dragTo', 'pointer', Boolean(state.inDoneColumn), 'Playwright mouse dragTo onto 완료')
  await shot('02-after-dragTo')

  if (!state.inDoneColumn) {
    const from = await card.boundingBox()
    const to = await done.boundingBox()
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + 48, { steps: 24 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    state = await cardState()
    await record('playwright.mouse', 'pointer', Boolean(state.inDoneColumn), 'mousedown move mouseup 24 steps')
    await shot('03-after-mouse')
  }

  if (!state.inDoneColumn) {
    const session = await context.newCDPSession(page)
    const from = await card.boundingBox()
    const to = await done.boundingBox()
    await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x + from.width / 2, y: from.y + from.height / 2, button: 'left', clickCount: 1 })
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to.x + to.width / 2, y: to.y + 48, button: 'left' })
    await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x + to.width / 2, y: to.y + 48, button: 'left', clickCount: 1 })
    await page.waitForTimeout(200)
    state = await cardState()
    await record('cdp.mouse', 'pointer', Boolean(state.inDoneColumn), 'CDP Input.dispatchMouseEvent press move release')
    await shot('04-after-cdp-mouse')
    await session.detach().catch(() => undefined)
  }

  if (!state.inDoneColumn) {
    const session = await context.newCDPSession(page)
    const from = await card.boundingBox()
    const to = await done.boundingBox()
    const id = await card.getAttribute('data-kanban-card')
    const data = { items: [{ mimeType: 'text/plain', data: id }], files: [], dragOperationsMask: 1 }
    await session.send('Input.dispatchDragEvent', { type: 'dragEnter', x: from.x + 8, y: from.y + 8, data })
    await session.send('Input.dispatchDragEvent', { type: 'dragOver', x: to.x + to.width / 2, y: to.y + 48, data })
    await session.send('Input.dispatchDragEvent', { type: 'drop', x: to.x + to.width / 2, y: to.y + 48, data })
    await page.waitForTimeout(200)
    state = await cardState()
    await record('cdp.dispatchDragEvent', 'pointer-protocol', Boolean(state.inDoneColumn), 'CDP Input.dispatchDragEvent drop')
    await shot('05-after-cdp-drag')
    await session.detach().catch(() => undefined)
  }

  if (!state.inDoneColumn) {
    await page.evaluate(() => {
      const cardEl = document.querySelector('[data-kanban-card]')
      const to = [...document.querySelectorAll('[data-kanban-col]')].find((col) => col.querySelector('h3')?.textContent.trim() === '완료')
      const dt = new DataTransfer()
      dt.setData('text/plain', cardEl.getAttribute('data-kanban-card'))
      cardEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    })
    await page.waitForTimeout(200)
    state = await cardState()
    await record('synthetic.DragEvent', 'synthetic', Boolean(state.inDoneColumn), 'same DragEvent path as the previous harness')
    await shot('06-after-synthetic')
  }

  const moved = methods.find((item) => item.moved)
  let afterReload = null
  if (moved) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.builder-canvas, [data-kanban-col]')
    await page.waitForFunction(() => document.querySelector('[data-kanban-card]'), { timeout: 15000 })
    afterReload = await cardState()
    log('reload inDone=' + afterReload.inDoneColumn + ' via ' + moved.name)
    await shot('07-after-reload')
  } else {
    log('no method moved the card')
  }

  const verdict = {
    pointerMoved: methods.some((item) => item.kind.startsWith('pointer') && item.moved),
    syntheticMoved: methods.some((item) => item.kind === 'synthetic' && item.moved),
    reloadKept: Boolean(afterReload?.inDoneColumn),
    cause: methods.some((item) => item.kind.startsWith('pointer') && item.moved)
      ? 'pointer path works'
      : methods.some((item) => item.kind === 'synthetic' && item.moved)
        ? 'test method. pointer mouse does not start HTML5 drag. product onDrop works when DataTransfer arrives'
        : 'product or both. no method moved the card',
  }
  await finish(Boolean(moved && afterReload?.inDoneColumn), { projectId, methods, afterReload, verdict })
  log('done ' + JSON.stringify(verdict))
  if (!moved) process.exitCode = 1
} catch (error) {
  log('FAIL ' + (error instanceof Error ? error.message : String(error)))
  await finish(false, { error: error instanceof Error ? error.stack : String(error), methods }).catch(() => undefined)
  throw error
} finally {
  await browser.close()
  server.kill()
}
