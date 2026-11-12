// Sign-up with an emailed code, account conflicts and delete + immediate re-sign-up, end to end against the LOCAL Supabase
// stack (`supabase start`): real Auth, Mailpit for the codes, and the delete-account Edge Function. Never touches production.
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync, execSync, spawn } from 'node:child_process'

const base = process.env.AUTH_TEST_URL ?? 'http://127.0.0.1:5297'
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
const api = status.API_URL, anon = status.ANON_KEY, service = status.SERVICE_ROLE_KEY, mailpit = status.MAILPIT_URL ?? status.INBUCKET_URL
for (const url of [base, api, mailpit]) if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Local stack only: ' + url)

const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.SCHEDULE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set SCHEDULE_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-auth-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1280,900', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolvePromise, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolvePromise(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_ANON_KEY: anon }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''; server.stdout.on('data', data => { serverOutput += data }); server.stderr.on('data', data => { serverOutput += data })
for (let i = 0; i < 300; i++) { try { if ((await fetch(base)).ok) break } catch {} await new Promise(r => setTimeout(r, 100)); if (i === 299) throw new Error(serverOutput) }
let targets
for (let i = 0; i < 50; i++) { try { targets = await fetch(browserEndpoint + '/json/list').then(r => r.json()); break } catch {} await new Promise(r => setTimeout(r, 100)); if (i === 49) throw new Error(browserOutput) }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise((resolvePromise, reject) => { ws.addEventListener('open', resolvePromise, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0, loadResolve = null
const pending = new Map(), errors = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
  const pair = pending.get(message.id)
  if (pair) { pending.delete(message.id); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
const send = (method, params = {}) => new Promise((resolvePromise, reject) => { const id = ++nextId; pending.set(id, { resolve: resolvePromise, reject }); ws.send(JSON.stringify({ id, method, params })) })
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function navigate(url) { const loaded = new Promise(r => { loadResolve = r }); await send('Page.navigate', { url }); await loaded }
const pause = ms => new Promise(r => setTimeout(r, ms))
const q = value => JSON.stringify(value)
async function wait(expression, label, tries = 150) { for (let i = 0; i < tries; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error('Timed out: ' + label + ' | ' + await evaluate('document.body.innerText.slice(0, 400)')) }
const byLabel = label => `[...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent.trim() === ${q(label)})?.querySelector('input')`
async function fill(label, value) {
  await evaluate(`(() => { const el = ${byLabel(label)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
}
const buttonWith = text => `[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${q(text)}))`
async function press(text) { await wait('!!' + buttonWith(text) + ' && !' + buttonWith(text) + '.disabled', 'button ' + text); await evaluate(buttonWith(text) + '.click()') }
const alertText = `[...document.querySelectorAll('[role=alert], .text-red-600')].map(e => e.textContent).join(' ')`
const admin = (path, init = {}) => fetch(api + path, { ...init, headers: { apikey: service, Authorization: 'Bearer ' + service, 'content-type': 'application/json', ...init.headers } })
async function codeFor(email, after) {
  for (let i = 0; i < 100; i++) {
    const list = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent('to:' + email)}`).then(r => r.json())
    const fresh = (list.messages ?? []).filter(m => Date.parse(m.Created) >= after).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0]
    if (fresh) {
      const body = await fetch(`${mailpit}/api/v1/message/${fresh.ID}`).then(r => r.json())
      const code = /\b(\d{6})\b/.exec(body.Text || body.HTML)?.[1]
      if (code) return code
    }
    await pause(200)
  }
  throw new Error('No code mail for ' + email)
}
const sessionUser = () => evaluate(`(() => { const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k)); return key ? JSON.parse(localStorage.getItem(key)).user?.id ?? null : null })()`)
async function signOutBrowser() { await evaluate('localStorage.clear()'); await navigate(base + '/login'); await wait(`!!${byLabel('이메일')}`, 'login form') }
async function userByEmail(email) {
  const { users } = await admin('/auth/v1/admin/users?per_page=1000').then(r => r.json())
  return users.find(u => u.email === email) ?? null
}
async function signUp(email, password = 'password123') {
  await navigate(base + '/signup')
  await wait(`!!${byLabel('이름')}`, 'signup form')
  await fill('이름', '테스트'); await fill('이메일', email); await fill('비밀번호', password); await fill('비밀번호 확인', password)
  const startedAt = Date.now() - 2000
  await press('인증코드 받기')
  return startedAt
}

const stamp = Date.now()
const email = `e2e-${stamp}@example.test`
const results = []
const step = (name) => { results.push(name); console.log('ok -', name) }

try {
  await send('Page.enable'); await send('Runtime.enable')

  // 1. Layout: the back link under the sign-up form is centered.
  await navigate(base + '/signup')
  await wait(`!!${byLabel('이름')}`, 'signup form')
  assert.equal(await evaluate(`getComputedStyle([...document.querySelectorAll('a')].find(a => a.textContent.trim() === '로그인으로 돌아가기').parentElement).textAlign`), 'center')
  step('signup back link centered')

  // 2. Sign-up sends a code; a wrong code is refused; resend is throttled; the right code signs in.
  let sentAt = await signUp(email)
  await wait('!!document.querySelector("[data-signup-code]")', 'code step')
  assert.match(await evaluate(buttonWith('인증코드 재발송') + '.textContent'), /\(\d+초\)/, 'resend waits for the cooldown')
  assert.equal(await evaluate(buttonWith('인증코드 재발송') + '.disabled'), true)
  const code = await codeFor(email, sentAt)
  await fill('인증코드', code === '000000' ? '111111' : '000000')
  await press('인증하고 시작하기')
  await wait(`/만료|올바르지/.test(${alertText})`, 'wrong code error')
  assert.equal(await sessionUser(), null, 'no session after a wrong code')
  await fill('인증코드', code)
  await press('인증하고 시작하기')
  await wait(`location.pathname === '/' || location.pathname === '/home'`, 'signed in after code')
  const firstId = await sessionUser()
  assert.ok(firstId, 'session after the right code')
  assert.equal((await userByEmail(email)).email_confirmed_at !== null, true)
  step('code sign-up: wrong code refused, right code confirms and signs in')

  // 3. Reusing a code: it was consumed.
  await signOutBrowser()
  const reuse = await fetch(api + '/auth/v1/verify', { method: 'POST', headers: { apikey: anon, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'email', email, token: code }) })
  assert.equal(reuse.ok, false, 'a used code cannot sign in again')
  step('used code rejected')

  // 4. The same email again: Supabase hides the account; the app says it is registered and sends no mail.
  const before = Date.now()
  await signUp(email)
  await wait(`/이미 가입된 이메일/.test(${alertText})`, 'duplicate sign-up message')
  assert.equal(await evaluate('!!document.querySelector("[data-signup-code]")'), false)
  await pause(1500)
  const extra = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent('to:' + email)}`).then(r => r.json())
  assert.equal((extra.messages ?? []).filter(m => Date.parse(m.Created) > before).length, 0, 'no mail for a registered email')
  step('duplicate email sign-up blocked without mail')

  // 5. An unconfirmed account: login points to the code step; an immediate resend is rate-limited; the code still works.
  const pendingEmail = `e2e-pending-${stamp}@example.test`
  sentAt = await signUp(pendingEmail)
  await wait('!!document.querySelector("[data-signup-code]")', 'code step 2')
  await signOutBrowser()
  await fill('이메일', pendingEmail); await fill('비밀번호', 'password123')
  await press('로그인')
  await wait(`/인증코드를 입력해/.test(document.body.innerText)`, 'unconfirmed login message')
  await evaluate(`[...document.querySelectorAll('a')].find(a => a.textContent.trim() === '인증코드 입력하기').click()`)
  await wait('!!document.querySelector("[data-signup-code]")', 'resumed code step')
  await press('인증코드 재발송')
  await wait(`/잠시 후|너무 잦/.test(${alertText})`, 'resend rate limited')
  await fill('인증코드', await codeFor(pendingEmail, sentAt))
  await press('인증하고 시작하기')
  await wait(`location.pathname === '/' || location.pathname === '/home'`, 'pending account confirmed')
  step('unconfirmed login → code step, throttled resend, confirmation')

  // 6. A Google-only account (identity rewritten to provider google): email sign-up is blocked, password login hints Google.
  const googleEmail = `e2e-google-${stamp}@example.test`
  const created = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: googleEmail, email_confirm: true, user_metadata: { full_name: 'Google User' } }) }).then(r => r.json())
  execFileSync('docker', ['exec', 'supabase_db_blanky', 'psql', '-U', 'postgres', '-c',
    `update auth.identities set provider = 'google', provider_id = 'google-${stamp}', identity_data = identity_data || '{"sub":"google-${stamp}","email_verified":true}'::jsonb where user_id = '${created.id}'; update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, encrypted_password = '' where id = '${created.id}';`], { stdio: 'ignore' })
  await signOutBrowser()
  await signUp(googleEmail)
  await wait(`/이미 가입된 이메일/.test(${alertText}) && /Google/.test(${alertText})`, 'google email sign-up blocked')
  await signOutBrowser()
  await fill('이메일', googleEmail); await fill('비밀번호', 'password123')
  await press('로그인')
  await wait(`/Google로 계속하기/.test(document.body.innerText) && /올바르지 않습니다/.test(document.body.innerText)`, 'google hint on password login')
  const googleUsers = (await admin('/auth/v1/admin/users?per_page=1000').then(r => r.json())).users.filter(u => u.email === googleEmail)
  assert.equal(googleUsers.length, 1, 'still exactly one account for the Google email')
  step('Google account: no duplicate email account, password login hints Google')

  // 7. Delete the first account from settings, then sign up again with the same email right away.
  await signOutBrowser()
  await fill('이메일', email); await fill('비밀번호', 'password123')
  await press('로그인')
  await wait(`location.pathname !== '/login'`, 'signed in for deletion')
  const token = await evaluate(`(() => { const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k)); return JSON.parse(localStorage.getItem(key)).access_token })()`)
  const calendar = await fetch(`${api}/rest/v1/calendars?select=id&owner_user_id=eq.${firstId}&type=eq.personal`, { headers: { apikey: anon, Authorization: 'Bearer ' + token } }).then(r => r.json())
  const insert = await fetch(`${api}/rest/v1/schedules`, { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + token, 'content-type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: firstId, calendar_id: calendar[0]?.id, title: '탈퇴 전 일정', date: '2026-11-05', kind: 'task' }) })
  assert.ok(insert.ok, 'seed schedule: ' + await insert.text())
  await evaluate(`localStorage.setItem('blanky.taskNav.${firstId}', '{}')`)
  await navigate(base + '/settings/account')
  await press('회원 탈퇴')
  await wait(`!!${buttonWith('삭제')}`, 'confirm dialog')
  await evaluate(`[...document.querySelectorAll('dialog button, [role=dialog] button')].find(b => b.textContent.trim() === '삭제').click()`)
  await wait(`location.pathname === '/login'`, 'back to login after deletion')
  assert.equal(await userByEmail(email), null, 'auth user deleted')
  const left = await admin(`/rest/v1/schedules?select=id&user_id=eq.${firstId}`).then(r => r.json())
  assert.deepEqual(left, [], 'schedules cascaded')
  assert.equal(await evaluate(`Object.keys(localStorage).filter(k => k.includes(${q(firstId)})).length`), 0, 'browser data of the deleted account removed')
  assert.equal(await sessionUser(), null, 'signed out')
  const oldToken = await fetch(api + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token } })
  assert.equal(oldToken.ok, false, 'old session cannot be used')

  sentAt = await signUp(email)
  await wait('!!document.querySelector("[data-signup-code]")', 're-sign-up code step')
  await fill('인증코드', await codeFor(email, sentAt))
  await press('인증하고 시작하기')
  await wait(`location.pathname === '/' || location.pathname === '/home'`, 're-signed in')
  const secondId = await sessionUser()
  assert.ok(secondId && secondId !== firstId, 'a new account id')
  const fresh = await admin(`/rest/v1/schedules?select=id&user_id=eq.${secondId}`).then(r => r.json())
  assert.deepEqual(fresh, [], 'the new account starts empty')
  const calendars = await admin(`/rest/v1/calendars?select=id&owner_user_id=eq.${secondId}&type=eq.personal`).then(r => r.json())
  assert.equal(calendars.length, 1, 'exactly one personal calendar for the new account')
  step('delete → immediate re-sign-up with the same email gives a new, empty account')

  assert.deepEqual(errors, [], 'no uncaught page errors')
  console.log(`PASS: ${results.length} auth flows`)
} finally {
  ws.close(); server.kill()
  const stopped = new Promise(r => browser.once('exit', r)); browser.kill(); await stopped
  if (resolve(profile).startsWith(resolve(tmpdir()))) await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  // Leave no test accounts behind in the local stack.
  for (const address of [email, `e2e-pending-${stamp}@example.test`, `e2e-google-${stamp}@example.test`]) {
    const user = await userByEmail(address).catch(() => null)
    if (user) await admin('/auth/v1/admin/users/' + user.id, { method: 'DELETE' }).catch(() => undefined)
  }
}
