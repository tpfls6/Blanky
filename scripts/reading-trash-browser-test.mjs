// 책 삭제 → 휴지통 → 복구, on the reading page and a custom reading page, with failures injected midway:
// the row stays with an alert and 다시 시도, a retry (also after a reload) brings every field back, an older
// 기록 row of a custom reading page still restores, and an English custom reading page shows no Korean.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const base = process.env.READING_TRASH_TEST_URL ?? 'http://127.0.0.1:5191'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-reading-trash-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolveEndpoint, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolveEndpoint(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**", "**/.audit/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', data => { serverOutput += data })
server.stderr.on('data', data => { serverOutput += data })
for (let i = 0; i < 100; i++) {
  try { const res = await fetch(base); if (res.ok) break } catch {}
  await new Promise(r => setTimeout(r, 100))
  if (i === 99) throw new Error(serverOutput)
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
  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(' + expression + ')')) return
    await pause(100)
  }
  throw new Error('Timed out: ' + label + '\n' + await evaluate('document.querySelector("main")?.innerText.slice(0, 1500) ?? ""'))
}
const q = value => JSON.stringify(value)
const owner = '11111111-1111-4111-8111-111111111111'
const libraryKey = 'blanky.library.' + owner
const readingKey = 'blanky.reading.v1.' + owner
const library = 'JSON.parse(localStorage.getItem(' + q(libraryKey) + '))'
const reading = 'JSON.parse(localStorage.getItem(' + q(readingKey) + ') ?? "null")'
const evidence = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'reading-trash')
await mkdir(evidence, { recursive: true })
async function shot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(evidence, name + '.png'), Buffer.from(result.data, 'base64')) }
const steps = []
const rowOf = title => '[...document.querySelectorAll("main li")].find(li=>li.querySelector("p")?.textContent===' + q(title) + ')'
const clickIn = (scope, text) => evaluate('(()=>{const b=[...(' + scope + ').querySelectorAll("button")].find(b=>b.textContent.trim()===' + q(text) + '&&!b.disabled);if(!b)throw new Error("no button "+' + q(text) + ');b.click()})()')
// The next `count`th write of the reading store throws once, like a network failure midway through a 복구.
const failReadingWrite = count => evaluate('(()=>{let left=' + count + ';const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===' + q(readingKey) + '&&left>0&&--left===0){Storage.prototype.setItem=set;throw new Error("injected write failure")}return set.call(this,k,v)}})()')
const failNextUuid = () => evaluate('(()=>{const uuid=crypto.randomUUID.bind(crypto);crypto.randomUUID=()=>{crypto.randomUUID=uuid;throw new Error("injected add failure")}})()')
const setLocale = locale => evaluate('(()=>{const lib=' + library + ';lib.settings.locale=' + q(locale) + ';localStorage.setItem(' + q(libraryKey) + ',JSON.stringify(lib));const key="blanky.preferences.' + owner + '",p=JSON.parse(localStorage.getItem(key)??"null");if(p)localStorage.setItem(key,JSON.stringify({...p,locale:' + q(locale) + '}))})()')

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + (() => {
    if (!location.hostname || localStorage.getItem('reading-trash-seeded')) return
    const id = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem('blanky.accounts.v1', JSON.stringify([{ id, name: 'T', nickname: 'T', email: 't@example.test', password: 'test-only', avatar: null }]))
    localStorage.setItem('blanky.session.v1', id)
    localStorage.setItem('blanky.library.' + id, JSON.stringify({ categories: [], items: [], customPages: [], records: [], recordTypes: [], trash: [], settings: { locale: 'ko', onboardingDone: true, onboardingPages: ['memo', 'diary', 'reading', 'custom'], customTemplatesGuideSeen: true } }))
    localStorage.setItem('reading-trash-seeded', '1')
  }).toString() + ')()' })
  await navigate(base + '/trash')
  await wait('document.querySelector("main h1")?.textContent === "휴지통"', 'trash page')

  // 1. Reading page: a fully recorded book imported from 서재 (two logs), on a shelf, with a quote and a note.
  const legacy = { id: 'legacy-demian', title: '데미안', author: '헤세', cover: null, totalPages: 300, currentPage: 120, status: 'reading', startedAt: '2026-10-01', finishedAt: null, createdAt: '2026-10-01T00:00:00.000Z' }
  const logs = [{ id: 'log-a', bookId: legacy.id, date: '2026-10-01', page: 50, note: '', createdAt: '2026-10-01T00:00:00.000Z', previousPage: 0 }, { id: 'log-b', bookId: legacy.id, date: '2026-10-02', page: 120, note: '좋은 장', createdAt: '2026-10-02T00:00:00.000Z', previousPage: 50 }]
  await evaluate('(()=>{const lib=' + library + ';lib.books=[' + q(legacy) + '];lib.logs=' + q(logs) + ';localStorage.setItem(' + q(libraryKey) + ',JSON.stringify(lib))})()')
  const copyId = await evaluate('(async()=>{const m=await import("/src/services/reading/index.ts");await m.importLegacyReading(' + q(owner) + ',[' + q(legacy) + '],' + q(logs) + ');const s=m.readingService(' + q(owner) + ');const shelf=await s.createShelf({name:"인생책",description:"",icon:"★",color:"accent",sort_order:0});const id=(await s.getMyBooks()).books[0].id;await s.addBookToShelf(id,shelf.id);await s.updateBook(id,{rating:4.5,review:"알을 깨는 이야기",tags:["고전","성장"],started_at:"2026-10-01",reading_status:"reading",current_page:120,total_pages:300,progress:40});await s.createHighlight(id,{content:"새는 알에서 나오려고 투쟁한다.",page_number:98,note:"핵심",tags:["명문장"],source_type:"manual",source_url:null,source_title:null});await s.createReadingNote(id,{content:"다시 읽고 싶다",tags:["메모"]});return id})()')
  const snapshot = await evaluate('(()=>{const r=' + reading + ';const b=r.books[0];return JSON.stringify({record:[b.reading_status,b.rating,b.current_page,b.total_pages,b.progress,b.started_at,b.finished_at,b.review,b.tags],shelves:r.memberships.map(m=>m.shelf_id),highlights:r.highlights.map(h=>[h.id,h.content,h.page_number,h.note,h.tags]),notes:r.notes.map(n=>[n.id,n.content,n.tags]).sort()})})()')
  await navigate(base + '/reading/' + copyId)
  await wait('document.querySelector(".reading-remove")', 'book detail')
  await evaluate('document.querySelector(".reading-remove").click()')
  await wait('document.querySelector("[role=dialog]")?.textContent.includes("휴지통")', 'trash confirm')
  await evaluate('document.querySelector("[role=dialog] .btn-primary").click()')
  await wait('location.pathname === "/reading" && ' + reading + '.books.length === 0', 'book deleted')
  assert.equal(await evaluate(library + '.books.length'), 0, '서재 book left with it')
  assert.equal(await evaluate(library + '.trash.filter(t=>t.kind==="book").length'), 1)
  steps.push('reading-delete')

  // 2. 복구 fails midway (after the book was added): the row stays, says so, and keeps what it wrote.
  await navigate(base + '/trash')
  await wait(rowOf('데미안'), 'trash row')
  await failReadingWrite(2)
  await clickIn(rowOf('데미안'), '복구')
  await wait(rowOf('데미안') + '?.querySelector("[role=alert]")', 'restore alert')
  assert.match(await evaluate(rowOf('데미안') + '.querySelector("[role=alert]").textContent'), /복구하지 못했어요.*다시 시도/)
  const progressId = await evaluate(library + '.trash.find(t=>t.kind==="book").payload.copy.restore?.bookId')
  assert.ok(progressId, 'the created book is saved with the row')
  assert.equal(await evaluate(reading + '.books.length'), 1, 'one bare copy so far')
  await shot('01-restore-failed-1440')
  // A reload in between keeps the row and its progress; the next try fails at another step.
  await navigate()
  await wait(rowOf('데미안'), 'row after reload')
  await failReadingWrite(3)
  await clickIn(rowOf('데미안'), '복구')
  await wait(rowOf('데미안') + '?.querySelector("[role=alert]")', 'second alert')
  // 다시 시도 finishes it.
  await clickIn(rowOf('데미안') + '.querySelector("[role=alert]")', '다시 시도')
  await wait('!' + rowOf('데미안'), 'row gone after retry')
  const restored = await evaluate('(()=>{const r=' + reading + ';const b=r.books[0];return JSON.stringify({record:[b.reading_status,b.rating,b.current_page,b.total_pages,b.progress,b.started_at,b.finished_at,b.review,b.tags],shelves:r.memberships.map(m=>m.shelf_id),highlights:r.highlights.map(h=>[h.id,h.content,h.page_number,h.note,h.tags]),notes:r.notes.map(n=>[n.id,n.content,n.tags]).sort()})})()')
  assert.deepEqual(JSON.parse(restored), JSON.parse(snapshot), 'every field back')
  assert.equal(await evaluate(reading + '.books.length'), 1, 'no second copy')
  assert.equal(await evaluate(reading + '.books[0].id'), progressId, 'the book the first try created')
  assert.deepEqual(await evaluate(library + '.books.map(b=>b.id)'), [legacy.id])
  assert.deepEqual(await evaluate(library + '.logs.map(l=>l.id).sort()'), ['log-a', 'log-b'])
  steps.push('reading-restore-retry')

  // 3. Custom reading page: deleting a book goes to the same 책 trash (quotes, notes, shelves), not a 기록 row.
  const pageBook = { id: 'pb-1', user_id: owner, book_id: 'pb-1', reading_status: 'done', rating: 5, current_page: 210, total_pages: 210, progress: 100, started_at: '2026-09-01', finished_at: '2026-09-20', review: '페이지 감상', tags: ['커스텀'], created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', book: { id: 'pb-1', external_source: 'blanky-page', external_id: 'pb-1', title: '커스텀 책', author: '작가', cover_url: null, isbn10: null, isbn13: null, publisher: null, published_date: null, description: null, page_count: 210, created_at: '2026-09-01T00:00:00.000Z' } }
  const state = { shelves: [{ id: 'ps-1', user_id: owner, name: '커스텀 책장', description: '', icon: '📚', color: 'accent', sort_order: 0, created_at: 't', updated_at: 't' }], memberships: [{ user_id: owner, user_book_id: 'pb-1', shelf_id: 'ps-1', created_at: 't' }], highlights: [{ id: 'ph-1', user_id: owner, user_book_id: 'pb-1', content: '커스텀 문장', page_number: 12, note: '', tags: [], source_type: 'manual', source_url: null, source_title: null, created_at: 't', updated_at: 't' }], notes: [{ id: 'pn-1', user_id: owner, user_book_id: 'pb-1', content: '커스텀 노트', tags: ['n'], created_at: 't', updated_at: 't' }] }
  const now = '2026-09-01T00:00:00.000Z'
  await evaluate('(()=>{const lib=' + library + ';lib.customPages=[{id:"pg-read",name:"내 독서",icon:"Library",description:"",sort:0,schemaVersion:1,blocks:[],template:"reading",fieldLabels:{},createdAt:' + q(now) + ',updatedAt:' + q(now) + '}];lib.records=[{id:"pb-1",typeId:"pg-read",title:"커스텀 책",values:{readingBook:' + q(JSON.stringify(pageBook)) + '},templateVersion:1,createdAt:' + q(now) + ',updatedAt:' + q(now) + '},{id:"pg-state",typeId:"pg-read",title:"Reading workspace",values:{kind:"blanky.page.reading-state",readingState:' + q(JSON.stringify(state)) + '},templateVersion:1,createdAt:' + q(now) + ',updatedAt:' + q(now) + '}];localStorage.setItem(' + q(libraryKey) + ',JSON.stringify(lib))})()')
  await navigate(base + '/pages/pg-read?book=pb-1')
  await wait('document.querySelector(".reading-remove")', 'custom book detail')
  await evaluate('document.querySelector(".reading-remove").click()')
  await wait('document.querySelector("[role=dialog]")?.textContent.includes("휴지통")', 'same trash confirm text')
  await evaluate('document.querySelector("[role=dialog] .btn-primary").click()')
  await wait('!' + library + '.records.some(r=>r.id==="pb-1")', 'custom book deleted')
  assert.equal(await evaluate(library + '.trash.filter(t=>t.kind==="record").length'), 0, 'no 기록 row')
  assert.equal(await evaluate(library + '.trash.find(t=>t.kind==="book")?.payload.copy.pageId'), 'pg-read')
  assert.deepEqual(await evaluate('(c=>[c.highlights.length,c.notes.length,c.shelves])(' + library + '.trash.find(t=>t.kind==="book").payload.copy)'), [1, 1, ['ps-1']])
  steps.push('custom-delete')
  await navigate(base + '/trash')
  await wait(rowOf('커스텀 책'), 'custom trash row')
  await failNextUuid()
  await clickIn(rowOf('커스텀 책'), '복구')
  await wait(rowOf('커스텀 책') + '?.querySelector("[role=alert]")', 'custom alert')
  await clickIn(rowOf('커스텀 책') + '.querySelector("[role=alert]")', '다시 시도')
  await wait('!' + rowOf('커스텀 책'), 'custom row gone')
  const pageState = await evaluate('(()=>{const lib=' + library + ';const books=lib.records.filter(r=>r.typeId==="pg-read"&&r.values.kind!=="blanky.page.reading-state").map(r=>JSON.parse(r.values.readingBook));const s=JSON.parse(lib.records.find(r=>r.values.kind==="blanky.page.reading-state").values.readingState);return JSON.stringify({books:books.map(b=>[b.book.title,b.reading_status,b.rating,b.current_page,b.total_pages,b.progress,b.started_at,b.finished_at,b.review,b.tags]),shelf:s.memberships.filter(m=>m.user_book_id===books[0].id).map(m=>m.shelf_id),highlights:s.highlights.map(h=>[h.id,h.content,h.page_number]),notes:s.notes.map(n=>[n.id,n.content,n.tags])})})()')
  assert.deepEqual(JSON.parse(pageState), { books: [['커스텀 책', 'done', 5, 210, 210, 100, '2026-09-01', '2026-09-20', '페이지 감상', ['커스텀']]], shelf: ['ps-1'], highlights: [['ph-1', '커스텀 문장', 12]], notes: [['pn-1', '커스텀 노트', ['n']]] })
  steps.push('custom-restore-retry')

  // 4. A 기록 row a custom reading page left before this change still restores the book.
  const oldBook = { ...pageBook, id: 'pb-old', book_id: 'pb-old', review: '예전 감상', book: { ...pageBook.book, id: 'pb-old', external_id: 'pb-old', title: '예전 책' } }
  await evaluate('(()=>{const lib=' + library + ';lib.trash=[{id:"pb-old",kind:"record",title:"예전 책",deletedAt:"2026-10-01T00:00:00.000Z",payload:{id:"pb-old",typeId:"pg-read",title:"예전 책",values:{readingBook:' + q(JSON.stringify(oldBook)) + '},templateVersion:1,createdAt:' + q(now) + ',updatedAt:' + q(now) + '}},...lib.trash];localStorage.setItem(' + q(libraryKey) + ',JSON.stringify(lib))})()')
  await navigate(base + '/trash')
  await wait(rowOf('예전 책'), 'old record row')
  assert.ok(await evaluate(rowOf('예전 책') + '.textContent.includes("기록")'))
  await clickIn(rowOf('예전 책'), '복구')
  await wait('!' + rowOf('예전 책'), 'old row restored')
  await navigate(base + '/pages/pg-read')
  await wait('[...document.querySelectorAll(".reading-book-card h3")].some(h=>h.textContent==="예전 책")', 'old book on its page')
  steps.push('legacy-record-restore')

  // 5. Touch targets: 36px to the mouse, 44px to touch (the ::before overhang); then the 390px layout.
  await navigate(base + '/trash')
  // Let the page settle first: a save from its own start-up would otherwise write over the seeded row.
  await wait('document.querySelector("main h1")', 'trash before seeding')
  await pause(500)
  await evaluate('(()=>{const lib=' + library + ';lib.trash=[{id:"m-1",kind:"memo",title:"메모 하나",deletedAt:"2026-10-01T00:00:00.000Z",payload:{id:"m-1",title:"메모 하나",body:"",categoryId:null,tags:[],createdAt:"t",updatedAt:"t"}}];localStorage.setItem(' + q(libraryKey) + ',JSON.stringify(lib))})()')
  await navigate()
  await wait(rowOf('메모 하나'), 'memo row')
  assert.ok(await evaluate('[...' + rowOf('메모 하나') + '.querySelectorAll(".trash-action")].every(b=>b.getBoundingClientRect().height>=36)'), 'mouse 36px')
  await shot('02-trash-1440')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await navigate()
  await wait(rowOf('메모 하나'), 'memo row mobile')
  assert.equal(await evaluate('matchMedia("(pointer: coarse)").matches'), true)
  const touch = await evaluate('[...' + rowOf('메모 하나') + '.querySelectorAll(".trash-action")].map(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b,"::before");return [r.height-parseFloat(s.top)-parseFloat(s.bottom),r.width]})')
  for (const [height, width] of touch) { assert.ok(height >= 44, 'touch height ' + height); assert.ok(width >= 44, 'touch width ' + width) }
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'no sideways scroll at 390')
  await shot('03-trash-390')
  await send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  steps.push('touch-targets')

  // 6. English: /trash is translated; a custom reading page made in Korean (stored Korean default labels) and
  //    a new one made in English show no Korean words; a custom label is never pluralized with "s".
  await setLocale('en')
  await navigate(base + '/trash')
  await wait('document.querySelector("main h1")?.textContent === "Trash"', 'english trash')
  const trashText = await evaluate('document.querySelector("main").innerText.replace("메모 하나","")')
  assert.doesNotMatch(trashText, /[가-힣]/, 'english trash has no Korean: ' + trashText)
  assert.ok(trashText.includes('Restore') && trashText.includes('Memo'))
  const koreanDefaults = { title: '책 제목', author: '저자', rating: '평점', note: '독서 감상', image: '이미지', status: '독서 상태', startedAt: '시작일', finishedAt: '완독일', tags: '책 태그', category: '책 종류', item: '책', unit: '권', library: '서재', shelf: '책장', highlight: '문장', memo: '메모', tagline: '읽고, 기억하고, 나만의 책장에 담아요.', statusWant: '읽을 예정', statusReading: '읽는 중', statusDone: '완독', statusStopped: '중단' }
  await evaluate('(()=>{const lib=' + library + ';lib.customPages.push({id:"pg-ko",name:"Old reading",icon:"Library",description:"",sort:1,schemaVersion:1,blocks:[],template:"reading",fieldLabels:' + q(koreanDefaults) + ',createdAt:' + q(now) + ',updatedAt:' + q(now) + '},{id:"pg-box",name:"Boxes",icon:"Library",description:"",sort:2,schemaVersion:1,blocks:[],template:"reading",fieldLabels:{item:"Box",shelf:"Crate"},createdAt:' + q(now) + ',updatedAt:' + q(now) + '});localStorage.setItem(' + q(libraryKey) + ',JSON.stringify(lib))})()')
  await navigate(base + '/pages/pg-ko')
  await wait('document.querySelector(".reading-heading")', 'korean-made page in english')
  const oldText = await evaluate('document.querySelector(".reading-page").innerText')
  assert.doesNotMatch(oldText, /[가-힣]/, 'no Korean on the page: ' + oldText.slice(0, 400))
  for (const expected of ['Add book', 'My shelves', 'Favorite books']) assert.ok(oldText.includes(expected), 'missing ' + expected)
  assert.deepEqual(await evaluate(library + '.customPages.find(p=>p.id==="pg-ko").fieldLabels'), koreanDefaults, 'stored labels unchanged')
  await navigate(base + '/pages/pg-box')
  await wait('document.querySelector(".reading-heading")', 'box page')
  const boxText = await evaluate('document.querySelector(".reading-page").innerText')
  assert.ok(boxText.includes('Favorite Box') && !/Boxs|Crates?s/.test(boxText), 'no plural by "s": ' + boxText.slice(0, 400))
  assert.ok(boxText.includes('My Crate list'))
  await navigate(base + '/custom')
  await wait('document.querySelector("[data-tour=new-page]")', 'custom hub')
  await evaluate('document.querySelector("[data-tour=new-page]").click()')
  await wait('document.querySelector(".page-wizard")', 'wizard')
  await evaluate('document.querySelectorAll(".template-choice-grid .template-card")[1].click()')
  await wait('document.querySelector(".page-wizard .template-preview")', 'reading preview')
  for (let step = 0; step < 2; step++) await evaluate('document.querySelector(".page-wizard .btn-primary").click()')
  await wait('document.querySelector(".page-wizard label input.field")', 'label step')
  assert.doesNotMatch(await evaluate('[...document.querySelectorAll(".page-wizard label span")].map(s=>s.textContent).join(" ")'), /[가-힣]/, 'label captions in English')
  await evaluate('document.querySelector(".page-wizard .btn-primary").click()')
  await evaluate('document.querySelector(".page-wizard .btn-primary").click()')
  await wait('location.pathname.startsWith("/pages/") && !document.querySelector(".page-wizard") && document.querySelector(".custom-user-page .reading-heading")', 'created english reading page')
  const created = await evaluate('JSON.stringify(' + library + '.customPages.at(-1).fieldLabels)')
  assert.doesNotMatch(created, /[가-힣]/, 'no Korean labels stored: ' + created)
  const newText = await evaluate('document.querySelector(".custom-user-page .reading-page").innerText')
  assert.doesNotMatch(newText, /[가-힣]/, 'no Korean on the new page: ' + newText.slice(0, 400))
  assert.ok(newText.includes('Add book') && newText.includes('Favorite books'))
  await shot('04-english-reading-page')
  steps.push('english-custom-page')

  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ surface: 'reading-trash-local', supabase: 'not-configured', steps }, null, 2))
  console.log('PASS: ' + steps.join(', '))
} finally {
  ws.close()
  server.kill()
  const stopped = new Promise(resolveStop => browser.once('exit', resolveStop))
  browser.kill()
  await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('blanky-reading-trash-')) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
