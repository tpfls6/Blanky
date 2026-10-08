import test from 'node:test'
import assert from 'node:assert/strict'
import type { User } from '@supabase/supabase-js'
import { accountFromAuth, authErrorMessage } from '../../../src/services/auth/account.ts'
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
  assert.match(authErrorMessage({ code: 'email_not_confirmed', message: 'error' }), /확인 이메일/)
  assert.match(authErrorMessage({ code: 'invalid_credentials', message: 'error' }), /데모 계정/)
  assert.match(authErrorMessage({ message: 'Failed to fetch' }), /인증 서버/)
})
