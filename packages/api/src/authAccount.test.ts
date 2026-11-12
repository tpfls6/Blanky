import test from 'node:test'
import assert from 'node:assert/strict'
import type { User } from '@supabase/supabase-js'
import { accountFromAuth, authErrorMessage, forgetAccountData, signupOutcome } from '../../../src/services/auth/account.ts'
import { retainLegacyLibrary } from '../../../src/services/auth/legacyLibrary.ts'
import { libraryKey, USERS_KEY } from '../../../src/state/storage.ts'

const authUser = { id: 'server-user', email: 'user@example.test', user_metadata: { name: '사용자', nickname: '닉네임' } } as User
test('server account preserves authenticated UUID and never stores a password', () => {
  const account = accountFromAuth(authUser)
  assert.equal(account.id, 'server-user')
  assert.equal(account.name, '사용자')
  assert.equal(account.nickname, '닉네임')
  assert.equal(account.password, '')
  assert.equal(accountFromAuth({ ...authUser, user_metadata: {} }).name, 'user')
})
test('legacy browser records are retained under authenticated identity without overwriting server-user cache', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const legacy = { ...accountFromAuth(authUser), id: 'legacy-user', password: 'legacy-secret' }
  storage.setItem(USERS_KEY, JSON.stringify([legacy]))
  storage.setItem(libraryKey(legacy.id), JSON.stringify({ personalCalendar: { ownerUserId: legacy.id }, items: [{ id: 'item', title: '기록', calendarId: 'local-personal:legacy-user', createdByUserId: legacy.id }], memos: [{ title: '메모' }] }))
  retainLegacyLibrary(accountFromAuth(authUser), storage)
  const migrated = JSON.parse(storage.getItem(libraryKey(authUser.id))!)
  assert.equal(migrated.items[0].title, '기록')
  assert.equal(migrated.personalCalendar, undefined)
  assert.equal(migrated.items[0].calendarId, undefined)
  assert.equal(migrated.items[0].createdByUserId, undefined)
  assert.equal(migrated.memos[0].title, '메모')
  assert.ok(storage.getItem(libraryKey(legacy.id)))
  storage.setItem(libraryKey(authUser.id), 'existing-cache')
  retainLegacyLibrary(accountFromAuth(authUser), storage)
  assert.equal(storage.getItem(libraryKey(authUser.id)), 'existing-cache')
  assert.equal(storage.getItem(libraryKey(authUser.id))?.includes('legacy-secret'), false)
})
test('authentication failures explain unconfirmed email and demo/server account separation', () => {
  assert.match(authErrorMessage({ code: 'email_not_confirmed', message: 'error' }), /인증코드/)
  assert.match(authErrorMessage({ code: 'invalid_credentials', message: 'error' }), /데모 계정/)
  assert.match(authErrorMessage({ message: 'Failed to fetch' }), /인증 서버/)
})

test('sign-up outcome: session, fresh code, or an email that is already registered', () => {
  assert.equal(signupOutcome({ user: { identities: [{}] }, session: {} }), 'signed_in')
  assert.equal(signupOutcome({ user: { identities: [{}] }, session: null }), 'verify')
  // Supabase hides existing confirmed accounts (password or Google) behind a user with no identities.
  assert.equal(signupOutcome({ user: { identities: [] }, session: null }), 'exists')
  assert.match(authErrorMessage({ code: 'otp_expired', message: 'Token has expired or is invalid' }), /만료/)
  assert.match(authErrorMessage({ code: 'over_email_send_rate_limit', message: 'x' }), /잠시 후/)
  assert.match(authErrorMessage({ code: 'invalid_credentials', message: 'x' }), /Google/)
})

test('deleted account leaves no browser data that a later sign-up could pick up', () => {
  const values = new Map([['blanky.library.dead-id', '{}'], ['blanky.taskNav.dead-id', '{}'], ['blanky.library.other', '{}'], ['blanky.recentIcons', '[]']])
  const storage = { get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null, removeItem: (key: string) => { values.delete(key) } }
  assert.equal(forgetAccountData('dead-id', storage), 2)
  assert.deepEqual([...values.keys()], ['blanky.library.other', 'blanky.recentIcons'])
  assert.equal(forgetAccountData('', storage), 0)
})
