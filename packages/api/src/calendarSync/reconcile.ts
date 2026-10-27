import { asScheduleId, type GoogleEventId, type ScheduleId } from '../../../types/src/calendarSync.ts'
import {
  isUnsupportedRecurrence,
  type GoogleEventWrite,
  type GooglePeerEvent,
  type ReconcileInput,
  type ReconcileOp,
  type SnapshotRow,
} from './domain.ts'
import { googleColorIdFromHex } from './googleColor.ts'

function writeBody(row: SnapshotRow, keepColorId?: string | null): GoogleEventWrite {
  return {
    summary: row.title,
    description: row.description,
    when: row.when,
    recurrence: row.recurrence,
    blankyScheduleId: row.scheduleId,
    colorId: googleColorIdFromHex(row.color) ?? keepColorId ?? null,
  }
}

function inboundDraft(event: Extract<GooglePeerEvent, { status: 'confirmed' }>, scheduleId: ScheduleId, updatedAt: SnapshotRow['updatedAt']): SnapshotRow {
  if (isUnsupportedRecurrence(event.recurrence)) throw new Error('지원하지 않는 반복은 Blanky 행이 되지 않습니다.')
  return {
    scheduleId,
    updatedAt,
    title: event.title,
    description: event.description,
    when: event.when,
    recurrence: event.recurrence,
    categoryId: null,
    color: null,
  }
}

function updateGoogle(row: SnapshotRow, event: Extract<GooglePeerEvent, { status: 'confirmed' }>): Extract<ReconcileOp, { kind: 'update_google' }> {
  return {
    kind: 'update_google',
    scheduleId: row.scheduleId,
    googleEventId: event.id,
    etag: event.etag,
    body: writeBody(row, event.colorId),
  }
}

export function reconcile({ snapshot, page }: ReconcileInput): readonly ReconcileOp[] {
  const rowsById = new Map(snapshot.rows.map((row) => [row.scheduleId, row]))
  const linksBySchedule = new Map(snapshot.links.map((link) => [link.scheduleId, link]))
  const linksByGoogle = new Map(snapshot.links.map((link) => [link.googleEventId, link]))
  const handledSchedules = new Set<ScheduleId>()
  const seenGoogle = new Set<GoogleEventId>()
  const ops: ReconcileOp[] = []

  for (const event of page.events) {
    seenGoogle.add(event.id)
    const link = linksByGoogle.get(event.id)
    if (event.status === 'cancelled') {
      if (link) {
        ops.push({ kind: 'delete_blanky', scheduleId: link.scheduleId, googleEventId: event.id })
        handledSchedules.add(link.scheduleId)
      }
      continue
    }
    if (isUnsupportedRecurrence(event.recurrence)) {
      ops.push({ kind: 'skip_unsupported', googleEventId: event.id })
      if (link) handledSchedules.add(link.scheduleId)
      continue
    }
    if (!link) {
      if (event.blankyScheduleId && rowsById.has(event.blankyScheduleId) && !linksBySchedule.has(event.blankyScheduleId)) {
        const row = rowsById.get(event.blankyScheduleId)!
        ops.push({
          kind: 'link',
          scheduleId: row.scheduleId,
          googleEventId: event.id,
          etag: event.etag,
          origin: 'blanky',
          appliedBlankyUpdatedAt: row.updatedAt,
        })
        handledSchedules.add(row.scheduleId)
        continue
      }
      ops.push({
        kind: 'upsert_blanky',
        googleEventId: event.id,
        etag: event.etag,
        origin: 'google',
        draft: inboundDraft(event, event.blankyScheduleId ?? asScheduleId(`pending:${event.id}`), event.updated),
      })
      continue
    }
    const row = rowsById.get(link.scheduleId)
    if (!row) {
      ops.push({ kind: 'delete_google', googleEventId: event.id, etag: event.etag })
      continue
    }
    handledSchedules.add(row.scheduleId)
    const localDirty = row.updatedAt !== link.appliedBlankyUpdatedAt
    const remoteDirty = event.etag !== link.appliedEtag
    if (localDirty && remoteDirty) {
      ops.push({
        kind: 'conflict',
        note: { scheduleId: row.scheduleId, googleEventId: event.id, reason: 'both_dirty', resolved: 'blanky_wins' },
        follow: updateGoogle(row, event),
      })
      continue
    }
    if (localDirty) {
      ops.push(updateGoogle(row, event))
      continue
    }
    if (remoteDirty) {
      ops.push({
        kind: 'upsert_blanky',
        googleEventId: event.id,
        etag: event.etag,
        origin: 'google',
        draft: inboundDraft(event, row.scheduleId, row.updatedAt),
      })
      continue
    }
    const wanted = googleColorIdFromHex(row.color)
    if (wanted && wanted !== event.colorId) ops.push(updateGoogle(row, event))
  }

  for (const row of snapshot.rows) {
    if (handledSchedules.has(row.scheduleId) || linksBySchedule.has(row.scheduleId)) continue
    ops.push({ kind: 'create_google', scheduleId: row.scheduleId, body: writeBody(row) })
  }

  for (const link of snapshot.links) {
    if (rowsById.has(link.scheduleId) || seenGoogle.has(link.googleEventId)) continue
    ops.push({ kind: 'delete_google', googleEventId: link.googleEventId, etag: link.appliedEtag })
  }

  return ops
}
