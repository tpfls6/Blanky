import type { ConnectionId, ScheduleId, SyncCursor, SyncReport, SyncToken } from '../../../types/src/calendarSync.ts'
import { applyOps, type ApplyDeps, type ApplyOptions } from './apply.ts'
import type { BlankySnapshot, GoogleEventPage, GoogleListResult, ReadyConnection, SnapshotRow } from './domain.ts'
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
  exportUnlinked?: boolean
  findOriginalRows?: (ids: readonly ScheduleId[]) => Promise<SnapshotRow[]>
  /** Previous item failures and retry policy. */
  retry?: Omit<ApplyOptions, 'now'> & { now?: Date }
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
    failures: [],
  }
}

function mergeReport(target: SyncReport, added: SyncReport): void {
  target.imported += added.imported
  target.exported += added.exported
  target.deletedLocal += added.deletedLocal
  target.deletedGoogle += added.deletedGoogle
  target.skippedUnsupported += added.skippedUnsupported
  target.conflicts = [...target.conflicts, ...added.conflicts]
  const failures = new Map(target.failures.map(failure => [failure.key, failure]))
  for (const failure of added.failures) failures.set(failure.key, failure)
  target.failures = [...failures.values()]
}

async function drain(input: ReadySyncInput, page: GoogleEventPage, cursor: SyncCursor): Promise<SyncReport> {
  let snapshot = await input.loadSnapshot(input.connection)
  let current = page
  const totals = emptyReport(cursor)
  // An item from a Google page that failed (or waits for retry) must be listed again next time,
  // so the sync token only moves forward when every page item was applied.
  let pageItemFailed = false
  for (;;) {
    if (input.findOriginalRows) {
      const known = new Set(snapshot.rows.map(row => row.scheduleId))
      const ids = current.events.flatMap(event => event.status === 'confirmed' && event.blankyScheduleId && !known.has(event.blankyScheduleId) ? [event.blankyScheduleId] : [])
      if (ids.length) snapshot = { ...snapshot, rows: [...snapshot.rows, ...await input.findOriginalRows(ids)] }
    }
    const ops = reconcile({ connection: input.connection, snapshot, page: current, deferOutbound: Boolean(current.nextPageToken), exportUnlinked: input.exportUnlinked })
    const applied = await applyOps(ops, input.apply, input.retry)
    mergeReport(totals, applied)
    const pageIds = new Set(current.events.map(event => event.id))
    if (applied.failures.some(failure => failure.googleEventId && pageIds.has(failure.googleEventId))) pageItemFailed = true
    snapshot = await input.loadSnapshot(input.connection)
    if (!current.nextPageToken) {
      if (current.nextSyncToken && !pageItemFailed) totals.cursor = { kind: 'incremental', token: current.nextSyncToken }
      await input.saveCursor(input.connection.id, totals.cursor)
      return totals
    }
    const next = await input.google.list({ syncToken: cursor.kind === 'incremental' ? cursor.token : null, pageToken: current.nextPageToken })
    if (next.kind === 'gone') throw new CalendarSyncError('GOOGLE_HTTP', '페이지 토큰 목록이 410을 반환했습니다.', 502)
    current = next.page
  }
}

export async function runSync(input: ReadySyncInput): Promise<SyncReport> {
  const cursor = input.connection.cursor
  if (cursor.kind === 'incremental') {
    const first = await input.google.list({ syncToken: cursor.token, pageToken: null })
    if (first.kind === 'gone') {
      await input.wipeLinks(input.connection.id)
    } else {
      return drain(input, first.page, cursor)
    }
  }
  const first = await input.google.list({ syncToken: null, pageToken: null })
  if (first.kind === 'gone') throw new CalendarSyncError('GOOGLE_HTTP', '전체 동기화 목록이 410을 반환했습니다.', 502)
  return drain(input, first.page, { kind: 'full' })
}
