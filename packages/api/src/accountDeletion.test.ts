import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteAccount, resolveDeletionTarget, type AccountDeletionPorts } from './accountDeletion.ts'
import { revokeToken } from './calendarSync/oauth.ts'

const SELF = 'df06ca80-3236-4b0e-983c-bbe7e534c01c'
const OTHER = '55738e63-f686-400d-aca0-4873285f1918'
const confirm = 'DELETE_ACCOUNT'

function ports(overrides: Partial<AccountDeletionPorts> = {}, calls: unknown[] = []): AccountDeletionPorts {
  return {
    async googleTokens(userId) { calls.push(['googleTokens', userId]); return ['refresh'] },
    async revokeGoogleToken(token) { calls.push(['revoke', token]) },
    async deleteUser(userId) { calls.push(['deleteUser', userId]); return 'deleted' },
    async storageLeftovers(userId) { calls.push(['leftovers', userId]); return [{ bucket: 'theme-assets', name: `${userId}/t/r/a.png` }] },
    async removeObjects(bucket, names) { calls.push(['remove', bucket, [...names]]) },
    ...overrides,
  }
}

test('users delete only themselves unless they are admins', () => {
  assert.deepEqual(resolveDeletionTarget({ kind: 'user', id: SELF, isAdmin: false }, { confirm }), { ok: true, userId: SELF })
  assert.deepEqual(resolveDeletionTarget({ kind: 'user', id: SELF, isAdmin: false }, { confirm, userId: SELF }), { ok: true, userId: SELF })
  assert.equal(resolveDeletionTarget({ kind: 'user', id: SELF, isAdmin: false }, { confirm, userId: OTHER }).ok, false)
  assert.deepEqual(resolveDeletionTarget({ kind: 'user', id: SELF, isAdmin: true }, { confirm, userId: OTHER }), { ok: true, userId: OTHER })
})

test('service role must name the account and every caller must confirm', () => {
  assert.deepEqual(resolveDeletionTarget({ kind: 'service' }, { confirm, userId: OTHER }), { ok: true, userId: OTHER })
  assert.equal(resolveDeletionTarget({ kind: 'service' }, { confirm }).ok, false)
  assert.equal(resolveDeletionTarget({ kind: 'user', id: SELF, isAdmin: false }, {}).ok, false)
  assert.equal(resolveDeletionTarget({ kind: 'user', id: SELF, isAdmin: true }, { confirm, userId: 'not-a-uuid' }).ok, false)
  assert.equal(resolveDeletionTarget({ kind: 'service' }, null).ok, false)
})

test('Google is revoked before the account is deleted, and files are removed after', async () => {
  const calls: unknown[] = []
  const report = await deleteAccount(ports({}, calls), SELF)
  assert.deepEqual(calls.map((call) => (call as unknown[])[0]), ['googleTokens', 'revoke', 'deleteUser', 'leftovers', 'remove'])
  assert.deepEqual(report, { userDeleted: true, googleRevoked: true, filesRemoved: 1 })
})

test('a failed Google revoke never blocks deletion', async () => {
  const report = await deleteAccount(ports({ async revokeGoogleToken() { throw new Error('google down') } }), SELF)
  assert.deepEqual(report, { userDeleted: true, googleRevoked: false, filesRemoved: 1 })
})

test('a rerun after the account is gone still finishes Storage cleanup', async () => {
  const report = await deleteAccount(ports({ async googleTokens() { return [] }, async deleteUser() { return 'missing' } }), SELF)
  assert.deepEqual(report, { userDeleted: false, googleRevoked: false, filesRemoved: 1 })
})

test('a failed account delete stops before touching Storage', async () => {
  const calls: unknown[] = []
  await assert.rejects(deleteAccount(ports({ async deleteUser() { throw new Error('Database error deleting user') } }, calls), SELF))
  assert.equal(calls.some((call) => (call as unknown[])[0] === 'leftovers'), false)
})

test('Storage removal is batched per bucket', async () => {
  const removed: [string, number][] = []
  const objects = [
    ...Array.from({ length: 150 }, (_, index) => ({ bucket: 'theme-assets', name: `${SELF}/t/r/${index}.png` })),
    { bucket: 'theme-packages', name: `${SELF}/t/r/theme.blankytheme` },
  ]
  const report = await deleteAccount(ports({
    async storageLeftovers() { return objects },
    async removeObjects(bucket, names) { removed.push([bucket, names.length]) },
  }), SELF)
  assert.deepEqual(removed, [['theme-assets', 100], ['theme-assets', 50], ['theme-packages', 1]])
  assert.equal(report.filesRemoved, 151)
})

test('Google token revoke treats an already invalid token as done', async () => {
  const sent: RequestInit[] = []
  await revokeToken('refresh', async (_url, init) => { sent.push(init ?? {}); return new Response('{}', { status: 400 }) })
  assert.equal(String(sent[0].body), 'token=refresh')
  await assert.rejects(revokeToken('refresh', async () => new Response('{}', { status: 503 })))
})
