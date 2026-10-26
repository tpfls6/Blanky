import type { ConnectionId, SyncCursor, SyncReport, SyncToken } from '../../../types/src/calendarSync.ts'
import { applyOps, type ApplyDeps } from './apply.ts'
import type { BlankySnapshot, GoogleEventPage, GoogleListResult, ReadyConnection } from './domain.ts'
import { CalendarSyncError } from './errors.ts'
import { reconcile } from './reconcile.ts'

export type ReadySyncInput = {
  connection: ReadyConnection
  google: {
    list(input: { syncToken: SyncToken | null; pageToken: string | null }): Promise<GoogleListResult>
  }
  loadSnapshot(connection: ReadyConnection): Promise<BlankySnapshot>
  wipeLinks(connectionId: ConnectionId): Promise<void>
  saveCursor(connectionId: ConnectionId, cursor: SyncCursor): Promise<void>
  apply: ApplyDeps
}

function emptyReport(cursor: SyncCursor): SyncReport {
  return {
    imported: 0,
    exported: 0,
    deletedLocal: 0,
    deletedGoogle: 0,
    skippedUnsupported: 0,
    conflicts: [],
    cursor,
  }
}

function mergeReport(target: SyncReport, added: SyncReport): void {
  target.imported += added.imported
  target.exported += added.exported
  target.deletedLocal += added.deletedLocal
  target.deletedGoogle += added.deletedGoogle
  target.skippedUnsupported += added.skippedUnsupported
  target.conflicts = [...target.conflicts, ...added.conflicts]
}

async function drain(input: ReadySyncInput, page: GoogleEventPage, cursor: SyncCursor): Promise<SyncReport> {
  let snapshot = await input.loadSnapshot(input.connection)
  let current = page
  const totals = emptyReport(cursor)
  for (;;) {
    const ops = reconcile({ connection: input.connection, snapshot, page: current })
    const applied = await applyOps(ops, input.apply)
    mergeReport(totals, applied)
    snapshot = await input.loadSnapshot(input.connection)
    if (!current.nextPageToken) {
      if (current.nextSyncToken) totals.cursor = { kind: 'incremental', token: current.nextSyncToken }
      await input.saveCursor(input.connection.id, totals.cursor)
      return totals
    }
    const next = await input.google.list({ syncToken: null, pageToken: current.nextPageToken })
    if (next.kind === 'gone') throw new CalendarSyncError('GOOGLE_HTTP', '페이지 토큰 목록이 410을 반환했습니다.', 502)
    current = next.page
  }
}

export async function runSync(input: ReadySyncInput): Promise<SyncReport> {
  let cursor = input.connection.cursor
  if (cursor.kind === 'incremental') {
    const first = await input.google.list({ syncToken: cursor.token, pageToken: null })
    if (first.kind === 'gone') {
      await input.wipeLinks(input.connection.id)
      cursor = { kind: 'full' }
    } else {
      return drain(input, first.page, cursor)
    }
  }
  const first = await input.google.list({ syncToken: null, pageToken: null })
  if (first.kind === 'gone') throw new CalendarSyncError('GOOGLE_HTTP', '전체 동기화 목록이 410을 반환했습니다.', 502)
  return drain(input, first.page, { kind: 'full' })
}
