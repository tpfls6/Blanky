// Account deletion. The database removes rows; this revokes Google access and removes Storage files around it.

export type StorageObject = { bucket: string; name: string }

export type AccountDeletionPorts = {
  googleTokens(userId: string): Promise<readonly string[]>
  revokeGoogleToken(token: string): Promise<void>
  deleteUser(userId: string): Promise<'deleted' | 'missing'>
  storageLeftovers(userId: string): Promise<readonly StorageObject[]>
  removeObjects(bucket: string, names: readonly string[]): Promise<void>
}

export type AccountDeletionReport = { userDeleted: boolean; googleRevoked: boolean; filesRemoved: number }

export type DeletionCaller = { kind: 'service' } | { kind: 'user'; id: string; isAdmin: boolean }

export type DeletionTarget = { ok: true; userId: string } | { ok: false; status: 400 | 403; message: string }

export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE_ACCOUNT'
const REMOVE_BATCH = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

// Users delete themselves. Admins and the service role may name another account.
export function resolveDeletionTarget(caller: DeletionCaller, body: unknown): DeletionTarget {
  const input = record(body)
  if (input.confirm !== DELETE_ACCOUNT_CONFIRMATION) return { ok: false, status: 400, message: '삭제 확인 값이 필요합니다.' }
  const requested = input.userId
  if (requested !== undefined && (typeof requested !== 'string' || !UUID.test(requested))) {
    return { ok: false, status: 400, message: '사용자 ID를 확인해 주세요.' }
  }
  if (caller.kind === 'service') {
    return requested ? { ok: true, userId: requested } : { ok: false, status: 400, message: '삭제할 사용자 ID가 필요합니다.' }
  }
  if (!requested || requested === caller.id) return { ok: true, userId: caller.id }
  return caller.isAdmin ? { ok: true, userId: requested } : { ok: false, status: 403, message: '다른 계정은 삭제할 수 없습니다.' }
}

// Google first (the token lives in the rows about to go), then the account, then files the database released.
// A rerun after a partial failure finds the account missing and finishes the Storage cleanup.
export async function deleteAccount(ports: AccountDeletionPorts, userId: string): Promise<AccountDeletionReport> {
  let googleRevoked = false
  for (const token of await ports.googleTokens(userId)) {
    try {
      await ports.revokeGoogleToken(token)
      googleRevoked = true
    } catch {
      // The user can still revoke from their Google account; never block deletion on it.
    }
  }
  const userDeleted = (await ports.deleteUser(userId)) === 'deleted'
  const byBucket = new Map<string, string[]>()
  for (const object of await ports.storageLeftovers(userId)) {
    byBucket.set(object.bucket, [...(byBucket.get(object.bucket) ?? []), object.name])
  }
  let filesRemoved = 0
  for (const [bucket, names] of byBucket) {
    for (let start = 0; start < names.length; start += REMOVE_BATCH) {
      const batch = names.slice(start, start + REMOVE_BATCH)
      await ports.removeObjects(bucket, batch)
      filesRemoved += batch.length
    }
  }
  return { userDeleted, googleRevoked, filesRemoved }
}
