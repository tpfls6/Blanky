import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  asCalendarId,
  asConnectionId,
  asDateStr,
  asEtag,
  asGoogleCalendarId,
  asGoogleEventId,
  asGoogleSub,
  asIsoDateTime,
  asScheduleId,
  asTimeStr,
  asUserId,
} from '../../../types/src/calendarSync.ts'
import { applyOps, type ApplyDeps } from './apply.ts'
import type { EventLink, GooglePeerEvent, ReadyConnection, ReconcileOp, SnapshotRow } from './domain.ts'
import { reconcile } from './reconcile.ts'
import { parseGoogleRecurrence, parseRecurrenceFromSchedule, toGoogleRrule } from './recurrence.ts'

const when = {
  allDay: false as const,
  date: asDateStr('2026-10-26'),
  startTime: asTimeStr('10:00'),
  endTime: asTimeStr('11:00'),
}

const connection: ReadyConnection = {
  status: 'ready',
  id: asConnectionId('conn-1'),
  userId: asUserId('user-1'),
  googleSub: asGoogleSub('sub-1'),
  accountEmail: 'user@example.test',
  tokens: {
    refreshToken: 'refresh',
    accessToken: 'access',
    accessTokenExpiresAt: asIsoDateTime('2026-10-26T01:00:00Z'),
  },
  calendar: {
    googleCalendarId: asGoogleCalendarId('gcal-1'),
    blankyCalendarId: asCalendarId('bcal-1'),
    timeZone: 'Asia/Seoul',
    summary: 'Primary',
  },
  cursor: { kind: 'full' },
  autoSync: false,
  lastSync: {
    at: asIsoDateTime('2026-10-26T00:00:00Z'),
    imported: 0,
    exported: 0,
    deletedLocal: 0,
    deletedGoogle: 0,
    skippedUnsupported: 0,
    conflictCount: 0,
    error: null,
  },
}

function row(input: Partial<SnapshotRow> & Pick<SnapshotRow, 'scheduleId'>): SnapshotRow {
  return {
    updatedAt: asIsoDateTime('2026-10-26T00:00:00Z'),
    title: '회의',
    description: '',
    when,
    recurrence: { freq: 'none' },
    categoryId: null,
    color: null,
    ...input,
  }
}

function link(input: Partial<EventLink> & Pick<EventLink, 'scheduleId' | 'googleEventId'>): EventLink {
  return {
    connectionId: connection.id,
    appliedEtag: asEtag('etag-1'),
    appliedBlankyUpdatedAt: asIsoDateTime('2026-10-26T00:00:00Z'),
    origin: 'blanky',
    recurrenceMirror: 'mirrored',
    ...input,
  }
}

function confirmed(input: Partial<Extract<GooglePeerEvent, { status: 'confirmed' }>> & Pick<GooglePeerEvent, 'id'>): Extract<GooglePeerEvent, { status: 'confirmed' }> {
  return {
    etag: asEtag('etag-1'),
    status: 'confirmed',
    title: '회의',
    description: '',
    when,
    recurrence: { freq: 'none' },
    updated: asIsoDateTime('2026-10-26T00:00:00Z'),
    blankyScheduleId: null,
    colorId: null,
    ...input,
  }
}

function run(snapshotRows: readonly SnapshotRow[], links: readonly EventLink[], events: readonly GooglePeerEvent[]) {
  return reconcile({
    connection,
    snapshot: { calendarId: connection.calendar.blankyCalendarId, rows: snapshotRows, links },
    page: { events, nextPageToken: null, nextSyncToken: null },
  })
}

function kinds(ops: readonly ReconcileOp[]): string[] {
  return ops.map((op) => op.kind)
}

test('weekly empty days uses the schedule date weekday', () => {
  assert.deepEqual(parseRecurrenceFromSchedule({ date: '2026-10-26', repeat: 'weekly', repeatDays: [] }), {
    freq: 'weekly',
    days: [1],
  })
  assert.deepEqual(parseRecurrenceFromSchedule({ date: '2026-10-26', repeat: 'daily' }), { freq: 'daily' })
  assert.deepEqual(toGoogleRrule({ freq: 'weekly', days: [1, 3] }), ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'])
})

test('Google RRULE stays at the Blanky ceiling and skips the rest', () => {
  assert.deepEqual(parseGoogleRecurrence([]), { freq: 'none' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=DAILY']), { freq: 'daily' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE']), { freq: 'weekly', days: [1, 3] })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=MONTHLY']), { freq: 'monthly' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO']), { kind: 'unsupported' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=DAILY;COUNT=5']), { kind: 'unsupported' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=MONTHLY;UNTIL=20261231T000000Z']), { kind: 'unsupported' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=YEARLY']), { kind: 'unsupported' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=WEEKLY']), { kind: 'unsupported' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=DAILY', 'EXDATE:20261027']), { kind: 'unsupported' })
})

test('unmapped confirmed Google event becomes inbound create', () => {
  const event = confirmed({ id: asGoogleEventId('g-1'), title: '가져온 회의' })
  const ops = run([], [], [event])
  assert.deepEqual(kinds(ops), ['upsert_blanky'])
  assert.equal(ops[0].kind, 'upsert_blanky')
  if (ops[0].kind !== 'upsert_blanky') return
  assert.equal(ops[0].origin, 'google')
  assert.equal(ops[0].draft.title, '가져온 회의')
  assert.equal(ops[0].googleEventId, event.id)
})

test('unmapped local row becomes outbound create', () => {
  const local = row({ scheduleId: asScheduleId('s-1'), title: '로컬 회의' })
  const ops = run([local], [], [])
  assert.deepEqual(kinds(ops), ['create_google'])
  assert.equal(ops[0].kind, 'create_google')
  if (ops[0].kind !== 'create_google') return
  assert.equal(ops[0].scheduleId, local.scheduleId)
  assert.equal(ops[0].body.summary, '로컬 회의')
  assert.equal(ops[0].body.blankyScheduleId, local.scheduleId)
  assert.equal(ops[0].body.colorId, null)
})

test('outbound create uses Blanky project color', () => {
  const local = row({ scheduleId: asScheduleId('s-1'), color: '#3A62B0' })
  const ops = run([local], [], [])
  assert.equal(ops[0].kind, 'create_google')
  if (ops[0].kind !== 'create_google') return
  assert.equal(ops[0].body.colorId, '9')
})

test('linked event without other changes still gets Blanky project color', () => {
  const local = row({ scheduleId: asScheduleId('s-1'), color: '#C25A54' })
  const mapped = link({ scheduleId: local.scheduleId, googleEventId: asGoogleEventId('g-1') })
  const ops = run([local], [mapped], [confirmed({ id: mapped.googleEventId, colorId: '1' })])
  assert.deepEqual(kinds(ops), ['update_google'])
  assert.equal(ops[0].kind, 'update_google')
  if (ops[0].kind !== 'update_google') return
  assert.equal(ops[0].body.colorId, '11')
})

test('local dirty emits update_google', () => {
  const local = row({ scheduleId: asScheduleId('s-1'), updatedAt: asIsoDateTime('2026-10-26T03:00:00Z'), title: '수정' })
  const mapped = link({ scheduleId: local.scheduleId, googleEventId: asGoogleEventId('g-1') })
  const ops = run([local], [mapped], [confirmed({ id: mapped.googleEventId })])
  assert.deepEqual(kinds(ops), ['update_google'])
  assert.equal(ops[0].kind, 'update_google')
  if (ops[0].kind !== 'update_google') return
  assert.equal(ops[0].body.summary, '수정')
})

test('remote dirty emits inbound upsert', () => {
  const local = row({ scheduleId: asScheduleId('s-1') })
  const mapped = link({ scheduleId: local.scheduleId, googleEventId: asGoogleEventId('g-1') })
  const ops = run([local], [mapped], [confirmed({ id: mapped.googleEventId, etag: asEtag('etag-2'), title: 'Google 수정' })])
  assert.deepEqual(kinds(ops), ['upsert_blanky'])
  assert.equal(ops[0].kind, 'upsert_blanky')
  if (ops[0].kind !== 'upsert_blanky') return
  assert.equal(ops[0].draft.title, 'Google 수정')
  assert.equal(ops[0].draft.scheduleId, local.scheduleId)
})

test('both dirty is Blanky wins plus a conflict note', () => {
  const local = row({ scheduleId: asScheduleId('s-1'), updatedAt: asIsoDateTime('2026-10-26T03:00:00Z'), title: 'Blanky 수정' })
  const mapped = link({ scheduleId: local.scheduleId, googleEventId: asGoogleEventId('g-1') })
  const ops = run([local], [mapped], [confirmed({ id: mapped.googleEventId, etag: asEtag('etag-2'), title: 'Google 수정' })])
  assert.deepEqual(kinds(ops), ['conflict'])
  assert.equal(ops[0].kind, 'conflict')
  if (ops[0].kind !== 'conflict') return
  assert.deepEqual(ops[0].note, {
    scheduleId: local.scheduleId,
    googleEventId: mapped.googleEventId,
    reason: 'both_dirty',
    resolved: 'blanky_wins',
  })
  assert.equal(ops[0].follow.body.summary, 'Blanky 수정')
})

test('cancelled Google event with a link deletes the Blanky row', () => {
  const local = row({ scheduleId: asScheduleId('s-1') })
  const mapped = link({ scheduleId: local.scheduleId, googleEventId: asGoogleEventId('g-1') })
  const ops = run([local], [mapped], [{ id: mapped.googleEventId, etag: asEtag('etag-1'), status: 'cancelled' }])
  assert.deepEqual(ops, [{ kind: 'delete_blanky', scheduleId: local.scheduleId, googleEventId: mapped.googleEventId }])
})

test('orphan link whose schedule is gone deletes the Google event', () => {
  const mapped = link({ scheduleId: asScheduleId('s-gone'), googleEventId: asGoogleEventId('g-1') })
  const ops = run([], [mapped], [])
  assert.deepEqual(ops, [{ kind: 'delete_google', googleEventId: mapped.googleEventId, etag: mapped.appliedEtag }])
})

test('wiped mapping rematches by blankyScheduleId and does not insert a second row', () => {
  const local = row({ scheduleId: asScheduleId('s-1') })
  const event = confirmed({ id: asGoogleEventId('g-1'), blankyScheduleId: local.scheduleId })
  const ops = run([local], [], [event])
  assert.deepEqual(kinds(ops), ['link'])
  assert.equal(ops[0].kind, 'link')
  if (ops[0].kind !== 'link') return
  assert.equal(ops[0].scheduleId, local.scheduleId)
  assert.equal(ops[0].googleEventId, event.id)
  assert.equal(ops[0].origin, 'blanky')
})

test('unsupported Google recurrence is skipped and does not create a Blanky row', () => {
  const event = confirmed({
    id: asGoogleEventId('g-1'),
    recurrence: { kind: 'unsupported' },
    title: '매년 회의',
  })
  const ops = run([], [], [event])
  assert.deepEqual(ops, [{ kind: 'skip_unsupported', googleEventId: event.id }])
})

test('a second run on an already mirrored snapshot returns no mutating ops', () => {
  const local = row({ scheduleId: asScheduleId('s-1') })
  const mapped = link({ scheduleId: local.scheduleId, googleEventId: asGoogleEventId('g-1') })
  const event = confirmed({ id: mapped.googleEventId, blankyScheduleId: local.scheduleId })
  const first = run([local], [mapped], [event])
  assert.deepEqual(first, [])
  const second = run([local], [mapped], [event])
  assert.deepEqual(second, [])
})

function unused(): never {
  throw new Error('unexpected apply dep')
}

function applyDeps(overrides: Partial<ApplyDeps>): ApplyDeps {
  return {
    connectionId: connection.id,
    readUpdatedAt: unused,
    upsertSchedule: unused,
    deleteSchedule: unused,
    casUpdateSchedule: unused,
    upsertLink: unused,
    deleteLink: unused,
    createGoogleEvent: unused,
    updateGoogleEvent: unused,
    deleteGoogleEvent: unused,
    ...overrides,
  }
}

test('delete_google treats a Google 404 as already gone and still drops the link', async () => {
  const googleEventId = asGoogleEventId('g-1')
  const deleted: Array<{ googleEventId: typeof googleEventId } | { scheduleId: ReturnType<typeof asScheduleId> }> = []
  const googleCalls: Array<{ id: typeof googleEventId; etag: ReturnType<typeof asEtag> }> = []
  const report = await applyOps(
    [{ kind: 'delete_google', googleEventId, etag: asEtag('etag-1') }],
    applyDeps({
      async deleteGoogleEvent(input) {
        googleCalls.push(input)
        return 'already_gone'
      },
      async deleteLink(input) {
        deleted.push(input)
      },
    }),
  )
  assert.deepEqual(googleCalls, [{ id: googleEventId, etag: asEtag('etag-1') }])
  assert.deepEqual(deleted, [{ googleEventId }])
  assert.equal(report.deletedGoogle, 1)
})

test('delete_google ok also drops the link', async () => {
  const googleEventId = asGoogleEventId('g-2')
  let gone = ''
  const report = await applyOps(
    [{ kind: 'delete_google', googleEventId, etag: asEtag('etag-9') }],
    applyDeps({
      async deleteGoogleEvent() {
        return 'ok'
      },
      async deleteLink(input) {
        if ('googleEventId' in input) gone = input.googleEventId
      },
    }),
  )
  assert.equal(gone, googleEventId)
  assert.equal(report.deletedGoogle, 1)
})
