import type {
  ConnectionId,
  Etag,
  GoogleEventId,
  IsoDateTime,
  ScheduleId,
  SyncReport,
} from '../../../types/src/calendarSync.ts'
import type { EventLink, GoogleEventWrite, ReconcileOp, SnapshotRow } from './domain.ts'

export type ApplyDeps = {
  connectionId: ConnectionId
  readUpdatedAt(id: ScheduleId): Promise<IsoDateTime>
  upsertSchedule(draft: SnapshotRow, origin: 'google'): Promise<{ scheduleId: ScheduleId; updatedAt: IsoDateTime }>
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
  deleteGoogleEvent(input: { id: GoogleEventId; etag: Etag }): Promise<'ok' | 'already_gone'>
}

function emptyReport(): SyncReport {
  return {
    imported: 0,
    exported: 0,
    deletedLocal: 0,
    deletedGoogle: 0,
    skippedUnsupported: 0,
    conflicts: [],
    cursor: { kind: 'full' },
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

async function applyUpdateGoogle(
  op: Extract<ReconcileOp, { kind: 'update_google' }>,
  deps: ApplyDeps,
  report: SyncReport,
): Promise<void> {
  const result = await deps.updateGoogleEvent({ id: op.googleEventId, etag: op.etag, body: op.body })
  if ('kind' in result && result.kind === 'etag_mismatch') {
    report.conflicts = [...report.conflicts, {
      scheduleId: op.scheduleId,
      googleEventId: op.googleEventId,
      reason: 'etag_mismatch',
      resolved: 'blanky_wins',
    }]
    return
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

export async function applyOps(ops: readonly ReconcileOp[], deps: ApplyDeps): Promise<SyncReport> {
  const report = emptyReport()
  for (const op of ops) {
    if (op.kind === 'upsert_blanky') {
      const existing = !op.draft.scheduleId.startsWith('pending:')
      if (existing) {
        const raced = await deps.casUpdateSchedule({
          id: op.draft.scheduleId,
          expectedUpdatedAt: op.draft.updatedAt,
          draft: op.draft,
        })
        if (raced === 'lost_race') continue
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
      continue
    }
    if (op.kind === 'delete_blanky') {
      await deps.deleteSchedule(op.scheduleId)
      await deps.deleteLink({ scheduleId: op.scheduleId })
      report.deletedLocal += 1
      continue
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
      continue
    }
    if (op.kind === 'update_google') {
      await applyUpdateGoogle(op, deps, report)
      continue
    }
    if (op.kind === 'delete_google') {
      await deps.deleteGoogleEvent({ id: op.googleEventId, etag: op.etag })
      await deps.deleteLink({ googleEventId: op.googleEventId })
      report.deletedGoogle += 1
      continue
    }
    if (op.kind === 'link') {
      await deps.upsertLink(linkOf(deps, op))
      continue
    }
    if (op.kind === 'skip_unsupported') {
      report.skippedUnsupported += 1
      continue
    }
    if (op.kind === 'conflict') {
      report.conflicts = [...report.conflicts, op.note]
      await applyUpdateGoogle(op.follow, deps, report)
      continue
    }
    const _exhaustive: never = op
    void _exhaustive
  }
  return report
}
