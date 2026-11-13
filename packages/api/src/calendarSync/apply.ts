import type {
  ConnectionId,
  Etag,
  GoogleEventId,
  IsoDateTime,
  ScheduleId,
  SyncFailure,
  SyncFailureOp,
  SyncReport,
} from '../../../types/src/calendarSync.ts'
import { asIsoDateTime } from '../../../types/src/calendarSync.ts'
import type { EventLink, GoogleEventWrite, GooglePeerEvent, ReconcileOp, SnapshotRow } from './domain.ts'
import { asCalendarSyncError, CalendarSyncError, isSyncWideError } from './errors.ts'

export type ApplyDeps = {
  connectionId: ConnectionId
  readUpdatedAt(id: ScheduleId): Promise<IsoDateTime>
  upsertSchedule(draft: SnapshotRow, origin: EventLink['origin']): Promise<{ scheduleId: ScheduleId; updatedAt: IsoDateTime }>
  deleteSchedule(id: ScheduleId): Promise<void>
  casUpdateSchedule(input: {
    id: ScheduleId
    expectedUpdatedAt: IsoDateTime
    draft: SnapshotRow
  }): Promise<'updated' | 'lost_race'>
  upsertLink(link: EventLink): Promise<void>
  deleteLink(input: { scheduleId: ScheduleId } | { googleEventId: GoogleEventId }): Promise<void>
  createGoogleEvent(body: GoogleEventWrite): Promise<{ id: GoogleEventId; etag: Etag }>
  updateGoogleEvent(input: {
    id: GoogleEventId
    etag: Etag
    body: GoogleEventWrite
  }): Promise<{ etag: Etag } | { kind: 'etag_mismatch' }>
  deleteGoogleEvent(input: { id: GoogleEventId; etag: Etag }): Promise<'ok' | 'already_gone' | 'etag_mismatch'>
  /** Fresh read after a 412. Without it a 412 is held as a conflict. */
  getGoogleEvent?(id: GoogleEventId): Promise<GooglePeerEvent | null>
}

export type ApplyOptions = {
  now?: Date
  /** Failures from the previous sync. Their items wait until `nextRetryAt` unless `force` is set. */
  previous?: readonly SyncFailure[]
  force?: boolean
}

/** Wait after the 1st, 2nd, 3rd and later failure of the same item. */
export const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const

function emptyReport(): SyncReport {
  return {
    imported: 0,
    exported: 0,
    deletedLocal: 0,
    deletedGoogle: 0,
    skippedUnsupported: 0,
    conflicts: [],
    cursor: { kind: 'full' },
    failures: [],
  }
}

function linkOf(
  deps: ApplyDeps,
  input: {
    scheduleId: ScheduleId
    googleEventId: GoogleEventId
    etag: Etag
    origin: EventLink['origin']
    appliedBlankyUpdatedAt: IsoDateTime
  },
): EventLink {
  return {
    connectionId: deps.connectionId,
    scheduleId: input.scheduleId,
    googleEventId: input.googleEventId,
    appliedEtag: input.etag,
    appliedBlankyUpdatedAt: input.appliedBlankyUpdatedAt,
    origin: input.origin,
    recurrenceMirror: 'mirrored',
  }
}

type OpInfo = { key: string; op: SyncFailureOp; title: string | null; googleEventId: GoogleEventId | null }

export function opInfo(op: ReconcileOp): OpInfo | null {
  if (op.kind === 'upsert_blanky') return { key: `google:${op.googleEventId}`, op: 'import', title: op.draft.title, googleEventId: op.googleEventId }
  if (op.kind === 'delete_blanky') return { key: `google:${op.googleEventId}`, op: 'delete_local', title: null, googleEventId: op.googleEventId }
  if (op.kind === 'create_google') return { key: `schedule:${op.scheduleId}`, op: 'create_google', title: op.body.summary, googleEventId: null }
  if (op.kind === 'update_google') return { key: `schedule:${op.scheduleId}`, op: 'update_google', title: op.body.summary, googleEventId: op.googleEventId }
  if (op.kind === 'conflict') return { key: `schedule:${op.follow.scheduleId}`, op: 'update_google', title: op.follow.body.summary, googleEventId: op.follow.googleEventId }
  if (op.kind === 'delete_google') return { key: `google:${op.googleEventId}`, op: 'delete_google', title: null, googleEventId: op.googleEventId }
  if (op.kind === 'link') return { key: `schedule:${op.scheduleId}`, op: 'link', title: null, googleEventId: op.googleEventId }
  return null
}

function failureOf(info: OpInfo, error: CalendarSyncError, held: SyncFailure | undefined, now: Date): SyncFailure {
  const attempts = (held?.attempts ?? 0) + 1
  const wait = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length) - 1]
  return {
    key: info.key,
    op: info.op,
    code: error.code,
    message: error.message,
    title: info.title ?? held?.title ?? null,
    googleEventId: info.googleEventId,
    attempts,
    nextRetryAt: asIsoDateTime(new Date(now.getTime() + wait).toISOString()),
  }
}

function shiftDate(value: string, days: number): string {
  const next = new Date(`${value}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function comparable(write: Pick<GoogleEventWrite, 'summary' | 'description' | 'when' | 'recurrence'>): string {
  const when = write.when
  const end = when.allDay
    ? when.endDate ?? when.date
    : when.endDate && when.endDate > when.date ? when.endDate : (when.endTime ?? when.startTime) < when.startTime ? shiftDate(when.date, 1) : when.date
  const recurrence = write.recurrence.freq === 'none'
    ? { freq: 'none' }
    : { ...write.recurrence, interval: write.recurrence.interval ?? 1, ...('days' in write.recurrence ? { days: [...write.recurrence.days].sort() } : {}) }
  return JSON.stringify([
    write.summary,
    write.description,
    when.allDay,
    when.date,
    when.allDay ? null : when.startTime,
    when.allDay ? null : when.endTime ?? when.startTime,
    end,
    recurrence,
  ])
}

/** True when Google already holds what Blanky wants to write, e.g. a write whose link save was lost. */
function sameContent(body: GoogleEventWrite, event: Extract<GooglePeerEvent, { status: 'confirmed' }>): boolean {
  if ('kind' in event.recurrence) return false
  return comparable(body) === comparable({ summary: event.title, description: event.description, when: event.when, recurrence: event.recurrence })
}

async function applyUpdateGoogle(
  op: Extract<ReconcileOp, { kind: 'update_google' }>,
  deps: ApplyDeps,
  report: SyncReport,
): Promise<void> {
  const result = await deps.updateGoogleEvent({ id: op.googleEventId, etag: op.etag, body: op.body })
  if ('kind' in result) {
    // 412: Google changed after the version Blanky last saw. Never overwrite it blindly.
    const latest = deps.getGoogleEvent ? await deps.getGoogleEvent(op.googleEventId) : null
    if (latest && latest.status === 'confirmed' && sameContent(op.body, latest)) {
      await deps.upsertLink(linkOf(deps, {
        scheduleId: op.scheduleId,
        googleEventId: op.googleEventId,
        etag: latest.etag,
        origin: 'blanky',
        appliedBlankyUpdatedAt: await deps.readUpdatedAt(op.scheduleId),
      }))
      return
    }
    report.conflicts = [...report.conflicts, {
      scheduleId: op.scheduleId,
      googleEventId: op.googleEventId,
      reason: 'etag_mismatch',
      resolved: 'held',
    }]
    throw new CalendarSyncError(
      'GOOGLE_CONFLICT',
      latest ? 'Google에서도 바뀐 일정이라 덮어쓰지 않고 보류했습니다.' : 'Google에서 삭제된 일정이라 덮어쓰지 않고 보류했습니다.',
      409,
      412,
    )
  }
  await deps.upsertLink(linkOf(deps, {
    scheduleId: op.scheduleId,
    googleEventId: op.googleEventId,
    etag: result.etag,
    origin: 'blanky',
    appliedBlankyUpdatedAt: await deps.readUpdatedAt(op.scheduleId),
  }))
  report.exported += 1
}

async function applyOne(op: ReconcileOp, deps: ApplyDeps, report: SyncReport): Promise<void> {
  if (op.kind === 'upsert_blanky') {
    const existing = !op.draft.scheduleId.startsWith('pending:')
    if (existing) {
      const raced = await deps.casUpdateSchedule({
        id: op.draft.scheduleId,
        expectedUpdatedAt: op.draft.updatedAt,
        draft: op.draft,
      })
      if (raced === 'lost_race') return
    }
    const saved = existing
      ? { scheduleId: op.draft.scheduleId, updatedAt: await deps.readUpdatedAt(op.draft.scheduleId) }
      : await deps.upsertSchedule(op.draft, op.origin)
    await deps.upsertLink(linkOf(deps, {
      scheduleId: saved.scheduleId,
      googleEventId: op.googleEventId,
      etag: op.etag,
      origin: op.origin,
      appliedBlankyUpdatedAt: saved.updatedAt,
    }))
    report.imported += 1
    return
  }
  if (op.kind === 'delete_blanky') {
    await deps.deleteSchedule(op.scheduleId)
    await deps.deleteLink({ scheduleId: op.scheduleId })
    report.deletedLocal += 1
    return
  }
  if (op.kind === 'create_google') {
    const created = await deps.createGoogleEvent(op.body)
    await deps.upsertLink(linkOf(deps, {
      scheduleId: op.scheduleId,
      googleEventId: created.id,
      etag: created.etag,
      origin: 'blanky',
      appliedBlankyUpdatedAt: await deps.readUpdatedAt(op.scheduleId),
    }))
    report.exported += 1
    return
  }
  if (op.kind === 'update_google') return applyUpdateGoogle(op, deps, report)
  if (op.kind === 'delete_google') {
    const result = await deps.deleteGoogleEvent({ id: op.googleEventId, etag: op.etag })
    if (result === 'etag_mismatch') {
      const latest = deps.getGoogleEvent ? await deps.getGoogleEvent(op.googleEventId) : null
      if (deps.getGoogleEvent && !latest) {
        await deps.deleteLink({ googleEventId: op.googleEventId })
        return
      }
      // Edited in Google after Blanky deleted it: keep the Google event and stop tracking the
      // deleted row. If it changes again it is imported as a new Blanky schedule.
      await deps.deleteLink({ googleEventId: op.googleEventId })
      report.conflicts = [...report.conflicts, {
        scheduleId: op.scheduleId,
        googleEventId: op.googleEventId,
        reason: 'etag_mismatch',
        resolved: 'remote_kept',
      }]
      return
    }
    await deps.deleteLink({ googleEventId: op.googleEventId })
    report.deletedGoogle += 1
    return
  }
  if (op.kind === 'link') {
    await deps.upsertLink(linkOf(deps, op))
    return
  }
  if (op.kind === 'skip_unsupported') {
    report.skippedUnsupported += 1
    return
  }
  if (op.kind === 'conflict') {
    report.conflicts = [...report.conflicts, op.note]
    return applyUpdateGoogle(op.follow, deps, report)
  }
  const _exhaustive: never = op
  void _exhaustive
}

/**
 * Applies each operation on its own. One bad item is recorded in `failures` with a retry time and
 * the rest still sync. Errors that would hit every item (revoked token, rate limit, outage) stop
 * the sync instead.
 */
export async function applyOps(ops: readonly ReconcileOp[], deps: ApplyDeps, options: ApplyOptions = {}): Promise<SyncReport> {
  const report = emptyReport()
  const now = options.now ?? new Date()
  const previous = new Map((options.previous ?? []).map(failure => [failure.key, failure]))
  const failures = new Map<string, SyncFailure>()
  for (const op of ops) {
    const info = opInfo(op)
    // Only the same action waits. A different one (e.g. re-linking after a failed create) is new.
    const prior = info ? previous.get(info.key) : undefined
    const held = info && prior?.op === info.op ? prior : undefined
    if (info && held && !options.force && Date.parse(held.nextRetryAt) > now.getTime()) {
      failures.set(info.key, held)
      continue
    }
    try {
      await applyOne(op, deps, report)
    } catch (error) {
      if (!info || isSyncWideError(error)) throw error
      failures.set(info.key, failureOf(info, asCalendarSyncError(error, 'GOOGLE_HTTP'), held, now))
    }
  }
  report.failures = [...failures.values()]
  return report
}
