// Shared calendar E2E: real accounts on the LOCAL Supabase stack, one headless Chromium per account.
// Owner (desktop) creates and manages a calendar, a member (phone viewport) accepts an email invite,
// a guest joins by link through the login round trip, and an outsider is checked through the API.
// Requires `supabase start`. Refuses anything that is not loopback, so production is never touched.
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const base = process.env.SHARED_CALENDAR_TEST_URL ?? 'http://127.0.0.1:5191'
const out = resolve(process.env.BLANKY_AUDIT_DIR ?? '.audit/runs', 'shared-calendar')
const status = JSON.parse(execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'supabase.cmd status -o json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }))
const api = status.API_URL, anonKey = status.ANON_KEY, serviceKey = status.SERVICE_ROLE_KEY
for (const url of [base, api]) if (new URL(url).hostname !== '127.0.0.1') throw new Error('Loopback only: ' + url)

const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.AI_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set AI_TEST_CHROMIUM to an installed Chromium executable')

const pause = ms => new Promise(r => setTimeout(r, ms))
const q = value => JSON.stringify(value)
const results = []
const step = async (name, run) => {
  const started = Date.now()
  try { await run(); results.push({ name, ok: true, ms: Date.now() - started }); console.log('ok   ' + name) }
  catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) })
    console.log('FAIL ' + name + ' :: ' + (error?.message ?? error))
    for (const page of browsers) {
      await page.shot('fail-' + page.label + '.png').catch(() => undefined)
      const alerts = await page.evaluate('[...document.querySelectorAll("[role=alert],[role=status]")].map(n => n.textContent).join(" | ") + " @ " + location.pathname').catch(() => '')
      console.log('  ' + page.label + ': ' + alerts + ' errors=' + JSON.stringify(page.errors.slice(0, 3)))
    }
    throw error
  }
}

// Accounts -------------------------------------------------------------------------------------
const admin = createClient(api, serviceKey, { auth: { persistSession: false } })
const run = crypto.randomUUID().slice(0, 8)
const people = {}
for (const [key, name] of [['owner', '오너'], ['member', '멤버'], ['guest', '게스트'], ['outsider', '외부인']]) {
  const email = `${key}-${run}@shared-e2e.test`, password = crypto.randomUUID() + 'Aa!9'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
  if (error) throw error
  const client = createClient(api, anonKey, { auth: { persistSession: false } })
  const signed = await client.auth.signInWithPassword({ email, password })
  if (signed.error) throw signed.error
  people[key] = { id: data.user.id, email, password, name, client }
}

// Vite against the local stack; process env outranks .env for VITE_ variables.
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**", "**/.audit/**"] } } }); await server.listen();'],
  { env: { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_ANON_KEY: anonKey }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', d => { serverOutput += d }); server.stderr.on('data', d => { serverOutput += d })
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break } catch { /* starting */ } await pause(150); if (i === 99) throw new Error(serverOutput) }

// Browsers -------------------------------------------------------------------------------------
const browsers = []
async function openBrowser(label, viewport) {
  const profile = await mkdtemp(join(tmpdir(), 'blanky-shared-' + label + '-'))
  const proc = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, `--window-size=${viewport.width},${viewport.height}`, 'about:blank'], { windowsHide: true, stdio: 'pipe' })
  let log = ''
  const endpoint = await new Promise((ok, fail) => {
    proc.on('error', fail)
    proc.stderr.on('data', d => { log += d; const m = log.match(/ws:\/\/127\.0\.0\.1:\d+/); if (m) ok(m[0].replace('ws:', 'http:')) })
  })
  let targets
  for (let i = 0; i < 50; i++) { try { targets = await fetch(endpoint + '/json/list').then(r => r.json()); break } catch { await pause(100) } }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((ok, fail) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', fail, { once: true }) })
  let id = 0
  const pending = new Map(), errors = []
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.exception?.description ?? 'exception')
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
  })
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const n = ++id
    pending.set(n, m => m.error ? fail(new Error(method + ': ' + m.error.message)) : ok(m.result))
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: Boolean(viewport.mobile) })
  if (viewport.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true })
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(label + ' eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
    return r.result.value
  }
  const page = {
    label, errors, send, evaluate,
    async go(path) { await send('Page.navigate', { url: base + path }); await pause(300); await page.wait('document.readyState === "complete"', 'load ' + path) },
    async wait(expression, what, timeout = 15000) {
      for (let t = 0; t < timeout; t += 150) { if (await evaluate('Boolean(' + expression + ')').catch(() => false)) return; await pause(150) }
      throw new Error(label + ' timed out: ' + what)
    },
    has: text => `document.body.innerText.includes(${q(text)})`,
    async click(selector) { await evaluate(`(() => { const el = document.querySelector(${q(selector)}); if (!el) throw new Error('missing ' + ${q(selector)}); el.click() })()`) },
    async clickText(text, scope = 'document') {
      await evaluate(`(() => { const el = [...${scope}.querySelectorAll('button, a')].find(b => b.textContent.trim() === ${q(text)}); if (!el) throw new Error('no button ' + ${q(text)}); el.click() })()`)
    },
    async fill(selector, value) {
      await evaluate(`(() => { const el = document.querySelector(${q(selector)}); if (!el) throw new Error('missing ' + ${q(selector)});
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(value)});
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    },
    async shot(name) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(out, name), Buffer.from(data, 'base64'))
    },
    async login(person) {
      await page.go('/login')
      await page.wait('document.querySelector("input[type=email]")', 'login form')
      await page.fill('input[type=email]', person.email)
      await page.fill('input[type=password]', person.password)
      await evaluate('document.querySelector("form").requestSubmit()')
      await page.wait('location.pathname !== "/login"', 'signed in')
    },
    async close() { ws.close(); proc.kill(); await pause(200); await rm(profile, { recursive: true, force: true }).catch(() => undefined) },
  }
  browsers.push(page)
  return page
}

const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
const title = 'E2E 공유 회의 ' + run
const renamed = title + ' (수정)'
const calendarName = 'E2E 팀 ' + run
let calendarId, token
await mkdir(out, { recursive: true })
let failed = false
try {
  const owner = await openBrowser('owner', { width: 1440, height: 1000 })
  const member = await openBrowser('member', { width: 390, height: 844, mobile: true })

  await step('owner and member sign in (desktop / phone)', async () => {
    await owner.login(people.owner)
    await member.login(people.member)
  })

  await step('owner creates a shared calendar from the sidebar', async () => {
    await owner.go('/schedule')
    await owner.wait('document.querySelector("[data-create-shared]")', 'calendar list in sidebar')
    await owner.click('[data-create-shared]')
    await owner.wait('document.querySelector("[data-shared-calendar-dialog=new] input")', 'create dialog')
    await owner.fill('[data-shared-calendar-dialog=new] input', calendarName)
    await owner.evaluate('document.querySelector("[data-shared-calendar-dialog] form").requestSubmit()')
    await owner.wait('document.querySelector("[data-invite-email]")', 'invite tab after create')
    calendarId = await owner.evaluate('document.querySelector("[data-shared-calendar-dialog]").getAttribute("data-shared-calendar-dialog")')
    assert.match(calendarId, /^[0-9a-f-]{36}$/)
  })

  await step('owner invites the member by email and issues a viewer link', async () => {
    await owner.fill('[data-invite-email]', people.member.email.toUpperCase())
    await owner.evaluate('document.querySelector("[data-invite-email]").form.requestSubmit()')
    await owner.wait(`document.querySelector('[data-pending-invite=${q(people.member.email)}]')`, 'pending email invite')
    await owner.fill('[data-invite-role]', 'viewer')
    await owner.click('[data-issue-link]')
    await owner.wait('document.querySelector("[data-invite-link]")?.value', 'invite link')
    token = await owner.evaluate('document.querySelector("[data-invite-link]").value.split("/invite/")[1]')
    assert.equal(decodeURIComponent(token).length, 64)
    await owner.shot('01-desktop-invite-tab.png')
    await owner.evaluate('document.querySelector("[data-shared-calendar-dialog] button[aria-label=\\"닫기\\"]").click()')
  })

  await step('member is notified on the phone and accepts', async () => {
    await member.go('/schedule')
    await member.wait('document.querySelector("[data-notification-bell] [data-unread]")', 'unread badge', 20000)
    await member.click('[data-notification-bell] button')
    await member.wait('document.querySelector(".notification-panel [data-invitation]")', 'invitation in panel')
    await member.shot('02-mobile-invitation.png')
    await member.clickText('수락', 'document.querySelector(".notification-panel")')
    await member.wait('!document.querySelector(".notification-panel [data-invitation]")', 'invitation answered')
    await member.click('[data-notification-bell] button')
    const role = await people.member.client.rpc('calendar_role', { p_calendar: calendarId })
    assert.equal(role.data, 'editor')
  })

  await step('owner adds a schedule to the shared calendar through the editor', async () => {
    await owner.wait(owner.has('E2E 팀'), 'shared calendar in sidebar')
    await owner.clickText('직접 추가')
    await owner.wait('document.querySelector("[data-calendar-field] select")', 'calendar picker in editor')
    await owner.fill('[data-calendar-field] select', calendarId)
    await owner.evaluate(`(() => { const label = [...document.querySelectorAll('form label')].find(l => l.textContent.trim().startsWith('제목')); const el = label.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(title)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await owner.clickText('저장')
    await owner.wait('!document.querySelector("[data-calendar-field]")', 'editor closed after save', 15000)
    await owner.wait(owner.has(title), 'saved shared schedule', 15000)
    const row = await admin.from('schedules').select('calendar_id, user_id, created_by_user_id').eq('title', title).single()
    assert.ok(row.data, 'row saved: ' + row.error?.message)
    assert.equal(row.data.calendar_id, calendarId)
    assert.equal(row.data.created_by_user_id, people.owner.id)
  })

  await step('member sees the new schedule in real time without reloading', async () => {
    await member.wait(member.has(title), 'realtime insert on member', 15000)
    await member.shot('03-mobile-shared-schedule.png')
  })

  await step('member edits it; owner receives the change and a notification', async () => {
    await member.evaluate(`[...document.querySelectorAll('button:not(.notification-item)')].find(b => b.textContent.includes(${q(title)})).click()`)
    await member.wait('document.querySelector("[data-calendar-info]")', 'calendar info in editor')
    await member.evaluate(`(() => { const label = [...document.querySelectorAll('form label')].find(l => l.textContent.trim().startsWith('제목')); const el = label.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(renamed)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await member.clickText('저장')
    await member.wait('!document.querySelector("[data-calendar-field]")', 'member editor closed', 15000)
    await member.wait(member.has(renamed), 'member saved')
    await owner.wait(owner.has(renamed), 'realtime update on owner', 15000)
    await owner.wait('document.querySelector("[data-notification-bell] [data-unread]")', 'owner unread badge', 15000)
    await owner.click('[data-notification-bell] button')
    await owner.wait(owner.has('변경했어요'), 'change notification text')
    await owner.shot('04-desktop-notifications.png')
    await owner.click('[data-notification-bell] button')
  })

  await step('detail shows owning calendar, creator and last editor', async () => {
    await owner.evaluate(`[...document.querySelectorAll('button:not(.notification-item)')].find(b => b.textContent.includes(${q(renamed)})).click()`)
    await owner.wait('document.querySelector("[data-created-by]")?.textContent.includes("마지막 수정 멤버")', 'last editor name')
    const text = await owner.evaluate('document.querySelector("[data-created-by]").textContent')
    assert.match(text, /만든 사람 오너/)
    assert.match(text, /마지막 수정 멤버/)
    await owner.shot('05-desktop-detail.png')
    await owner.clickText('취소')
  })

  await step('owner demotes member to viewer; member UI turns read-only and the server refuses writes', async () => {
    await owner.click(`[aria-label=${q(calendarName + ' 관리')}]`)
    await owner.wait('[...document.querySelectorAll("[role=tab]")].some(b => b.textContent.startsWith("멤버"))', 'members tab')
    await owner.evaluate('[...document.querySelectorAll("[role=tab]")].find(b => b.textContent.startsWith("멤버")).click()')
    await owner.wait(`document.querySelector('[data-member=${q(people.member.email)}] select')`, 'member row')
    await owner.fill(`[data-member=${q(people.member.email)}] select`, 'viewer')
    await owner.wait(owner.has('조회자(으)로 바꿨어요'), 'role change notice')
    await owner.shot('06-desktop-members.png')
    await owner.evaluate('document.querySelector("[data-shared-calendar-dialog] button[aria-label=\\"닫기\\"]").click()')
    await member.wait(`(() => { [...document.querySelectorAll('button:not(.notification-item)')].find(b => b.textContent.includes(${q(renamed)}))?.click(); return document.querySelector('[data-calendar-info]')?.textContent.includes('조회 권한') })()`, 'viewer notice', 15000)
    assert.equal(await member.evaluate('document.querySelector("[data-calendar-info]").closest("form").querySelector("fieldset").disabled'), true)
    const attempt = await people.member.client.from('schedules').update({ title: 'viewer write' }).eq('title', renamed).select('id')
    assert.equal(attempt.data.length, 0)
    const insert = await people.member.client.from('schedules').insert({ user_id: people.member.id, calendar_id: calendarId, title: 'viewer insert', date: today })
    assert.ok(insert.error, 'viewer insert must fail')
    await member.shot('07-mobile-viewer-readonly.png')
    // On phones the detail is a full-page sheet closed with its back button.
    await member.click('dialog[open].schedule-draft-panel button[aria-label="뒤로"]')
  })

  await step('guest opens the invite link signed out, logs in and joins', async () => {
    const guest = await openBrowser('guest', { width: 1280, height: 900 })
    await guest.go('/invite/' + token)
    await guest.wait('location.pathname === "/login" && document.querySelector("input[type=email]")', 'redirected to login')
    await guest.fill('input[type=email]', people.guest.email)
    await guest.fill('input[type=password]', people.guest.password)
    await guest.evaluate('document.querySelector("form").requestSubmit()')
    await guest.wait('document.querySelector("[data-accept-invite]")', 'invite page after login', 20000)
    await guest.shot('08-desktop-invite-page.png')
    await guest.click('[data-accept-invite]')
    await guest.wait('location.pathname === "/schedule"', 'joined')
    await guest.wait(guest.has(renamed), 'guest sees shared schedule', 15000)
    people.guest.page = guest
  })

  await step('reissued link: the old token stops working', async () => {
    const reissued = await people.owner.client.rpc('create_calendar_invite_link', { p_calendar: calendarId, p_role: 'viewer' })
    assert.ok(reissued.data?.[0]?.token)
    const old = await people.outsider.client.rpc('accept_calendar_invite_link', { p_token: decodeURIComponent(token) })
    assert.equal(old.error?.message, 'INVITE_REVOKED')
    const revoked = await people.owner.client.rpc('revoke_calendar_invitation', { p_invitation: reissued.data[0].id })
    assert.ok(!revoked.error)
    const after = await people.outsider.client.rpc('accept_calendar_invite_link', { p_token: reissued.data[0].token })
    assert.equal(after.error?.message, 'INVITE_REVOKED')
  })

  await step('outsider and anonymous clients cannot read or write shared or personal rows', async () => {
    const anon = createClient(api, anonKey, { auth: { persistSession: false } })
    assert.equal((await anon.from('schedules').select('id')).data?.length ?? 0, 0)
    assert.equal((await people.outsider.client.from('schedules').select('id').eq('calendar_id', calendarId)).data.length, 0)
    assert.equal((await people.outsider.client.from('calendars').select('id').eq('id', calendarId)).data.length, 0)
    assert.ok((await people.outsider.client.rpc('calendar_member_list', { p_calendar: calendarId })).error)
    const forged = await people.outsider.client.from('schedules').insert({ user_id: people.outsider.id, calendar_id: calendarId, title: 'x', date: today })
    assert.ok(forged.error)
  })

  await step('owner removes the guest; access disappears immediately', async () => {
    await owner.click(`[aria-label=${q(calendarName + ' 관리')}]`)
    await owner.wait('[...document.querySelectorAll("[role=tab]")].some(b => b.textContent.startsWith("멤버"))', 'members tab')
    await owner.evaluate('[...document.querySelectorAll("[role=tab]")].find(b => b.textContent.startsWith("멤버")).click()')
    await owner.wait(`document.querySelector('[data-member=${q(people.guest.email)}]')`, 'guest row')
    await owner.clickText('내보내기', `document.querySelector('[data-member=${q(people.guest.email)}]')`)
    await owner.wait('document.querySelector(".app-confirm-action")', 'confirm')
    await owner.click('.app-confirm-action')
    await owner.wait(`!document.querySelector('[data-member=${q(people.guest.email)}]')`, 'guest removed')
    await owner.evaluate('document.querySelector("[data-shared-calendar-dialog] button[aria-label=\\"닫기\\"]").click()')
    assert.equal((await people.guest.client.from('schedules').select('id').eq('calendar_id', calendarId)).data.length, 0)
    await people.guest.page.wait('!' + people.guest.page.has(renamed), 'guest UI drops shared schedule', 15000)
  })

  await step('last owner cannot leave; ownership transfer works', async () => {
    const leave = await people.owner.client.rpc('remove_calendar_member', { p_calendar: calendarId, p_user: people.owner.id })
    assert.equal(leave.error?.message, 'LAST_OWNER')
    await people.owner.client.rpc('set_calendar_member_role', { p_calendar: calendarId, p_user: people.member.id, p_role: 'editor' })
    const moved = await people.owner.client.rpc('transfer_calendar_ownership', { p_calendar: calendarId, p_user: people.member.id })
    assert.ok(!moved.error, moved.error?.message)
    assert.equal((await people.member.client.rpc('calendar_role', { p_calendar: calendarId })).data, 'owner')
    assert.equal((await people.owner.client.rpc('calendar_role', { p_calendar: calendarId })).data, 'editor')
    const back = await people.member.client.rpc('transfer_calendar_ownership', { p_calendar: calendarId, p_user: people.owner.id })
    assert.ok(!back.error, back.error?.message)
  })

  await step('owner goes offline; a change made meanwhile appears after reconnecting', async () => {
    await owner.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await owner.evaluate('window.dispatchEvent(new Event("offline"))')
    await pause(1000)
    const offlineTitle = '재연결 일정 ' + run
    const made = await people.member.client.from('schedules').insert({ user_id: people.member.id, calendar_id: calendarId, title: offlineTitle, date: today }).select('id')
    assert.ok(!made.error, made.error?.message)
    await pause(1500)
    await owner.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await owner.evaluate('window.dispatchEvent(new Event("online"))')
    await owner.wait(owner.has(offlineTitle), 'resynced after reconnect', 20000)
  })

  await step('hiding the shared calendar filters its schedules; showing restores them', async () => {
    await owner.evaluate(`document.querySelector('[data-calendar-row=${q(calendarId)}] input[type=checkbox]').click()`)
    await owner.wait('!' + owner.has(renamed), 'hidden')
    await owner.evaluate(`document.querySelector('[data-calendar-row=${q(calendarId)}] input[type=checkbox]').click()`)
    await owner.wait(owner.has(renamed), 'shown again')
    await owner.shot('09-desktop-schedule.png')
  })

  await step('personal and recurring schedules stay private and keep working', async () => {
    const weekly = 'E2E 개인 반복 ' + run
    const made = await people.owner.client.from('schedules').insert({ user_id: people.owner.id, title: weekly, date: today, repeat_rule: 'weekly', all_day: true }).select('id, calendar_id').single()
    assert.ok(!made.error, made.error?.message)
    const personal = await admin.from('calendars').select('id').eq('owner_user_id', people.owner.id).eq('is_default_personal', true).single()
    assert.equal(made.data.calendar_id, personal.data.id)
    await owner.wait(owner.has(weekly), 'personal recurring visible to owner', 15000)
    assert.equal((await people.member.client.from('schedules').select('id').eq('id', made.data.id)).data.length, 0)
    await member.go('/schedule')
    await member.wait(member.has(renamed), 'member reloaded')
    assert.equal(await member.evaluate(member.has(weekly)), false)
  })

  await step('member leaves through the phone UI', async () => {
    await member.click('[data-open-calendars]')
    await member.wait(`document.querySelector('.calendar-sheet [data-calendar-row=${q(calendarId)}]')`, 'calendar sheet')
    await member.shot('10-mobile-calendar-sheet.png')
    await member.click(`.calendar-sheet [aria-label=${q(calendarName + ' 관리')}]`)
    await member.wait('document.querySelector("[data-shared-calendar-dialog]")', 'manage dialog')
    await member.clickText('캘린더 나가기')
    await member.wait('document.querySelector(".app-confirm-action")', 'confirm')
    await member.click('.app-confirm-action')
    await member.wait('!' + member.has(renamed), 'member no longer sees shared schedule', 15000)
    assert.equal((await people.member.client.from('schedules').select('id').eq('calendar_id', calendarId)).data.length, 0)
  })

  for (const page of browsers) assert.deepEqual(page.errors, [], page.label + ' page errors')
} catch {
  failed = true
} finally {
  await writeFile(join(out, 'result.json'), JSON.stringify({ run, at: new Date().toISOString(), results, errors: Object.fromEntries(browsers.map(b => [b.label, b.errors])) }, null, 2))
  for (const page of browsers) await page.close()
  server.kill()
  for (const person of Object.values(people)) await admin.auth.admin.deleteUser(person.id).catch(() => undefined)
}
console.log(`\n${results.filter(r => r.ok).length}/${results.length} steps passed`)
process.exit(failed ? 1 : 0)
