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
  type PeerWhen,
  type Recurrence,
} from '../../../types/src/calendarSync.ts'
import { mapScheduleRow } from '../scheduleRepository.ts'
import type { EventLink, GooglePeerEvent, ReadyConnection, ReconcileOp, SnapshotRow } from './domain.ts'
import { googleBodyFromWrite } from './googleApi.ts'
import { parseGoogleEvent } from './googleParse.ts'
import { reconcile } from './reconcile.ts'
import { parseGoogleRecurrence, parseRecurrenceFromSchedule, toGoogleRrule } from './recurrence.ts'
import { casUpdateSchedule, snapshotRowFromSchedule, upsertSchedule } from './store.ts'

const timed: PeerWhen = { allDay: false, date: asDateStr('2026-11-02'), startTime: asTimeStr('09:00'), endTime: asTimeStr('10:00') }
const allDay: PeerWhen = { allDay: true, date: asDateStr('2026-11-02'), endDate: null }
const weekly = (until?: string): Recurrence => ({ freq: 'weekly', days: [1, 3], ...(until ? { until: asDateStr(until) } : {}) })
const seoul = 'Asia/Seoul'

test('export: UNTIL is a date for all-day series and the end of the last local day in UTC for timed ones', () => {
  assert.deepEqual(toGoogleRrule(weekly('2026-11-30'), { allDay: true, timeZone: seoul }), ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261130'])
  assert.deepEqual(toGoogleRrule(weekly('2026-11-30'), { allDay: false, timeZone: seoul }), ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261130T145959Z'])
  // New York: EDT in July, EST after the 2026-11-01 switch.
  assert.deepEqual(toGoogleRrule({ freq: 'daily', until: asDateStr('2026-07-15') }, { allDay: false, timeZone: 'America/New_York' }), ['RRULE:FREQ=DAILY;UNTIL=20260716T035959Z'])
  assert.deepEqual(toGoogleRrule({ freq: 'monthly', until: asDateStr('2026-11-30') }, { allDay: false, timeZone: 'America/New_York' }), ['RRULE:FREQ=MONTHLY;UNTIL=20261201T045959Z'])
  // No end keeps the exact previous rule.
  assert.deepEqual(toGoogleRrule(weekly(), { allDay: false, timeZone: seoul }), ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'])
})

test('import: UNTIL becomes the last local start date', () => {
  const at = (until: string, when: PeerWhen = timed, timeZone = seoul) => parseGoogleRecurrence([`RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=${until}`], { when, timeZone })
  assert.deepEqual(at('20261130', allDay), weekly('2026-11-30'))
  assert.deepEqual(at('20261130T145959Z'), weekly('2026-11-30'))
  // 2026-11-30T00:00Z is 09:00 KST: a 09:00 start that day is still included, a 10:00 start is not.
  assert.deepEqual(at('20261130T000000Z'), weekly('2026-11-30'))
  assert.deepEqual(at('20261130T000000Z', { ...timed, startTime: asTimeStr('10:00') }), weekly('2026-11-29'))
  // Floating local time (no Z) is read as wall clock.
  assert.deepEqual(at('20261130T235959'), weekly('2026-11-30'))
  // Google web UI rules carry WKST; it has no effect at INTERVAL=1.
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20261130T145959Z;BYDAY=MO,WE'], { when: timed, timeZone: seoul }), weekly('2026-11-30'))
})

test('import: unreadable or impossible UNTIL and COUNT stay unsupported', () => {
  const ctx = { when: timed, timeZone: seoul }
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=DAILY;UNTIL=20261340'], ctx), { kind: 'unsupported' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=DAILY;UNTIL=2026-11-30'], ctx), { kind: 'unsupported' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=DAILY;UNTIL=20261101'], ctx), { kind: 'unsupported' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=DAILY;COUNT=3'], ctx), { kind: 'unsupported' })
  assert.deepEqual(parseGoogleRecurrence(['RRULE:FREQ=DAILY;UNTIL=20261130;COUNT=3'], ctx), { kind: 'unsupported' })
})

test('round trip keeps the end date in every zone and for both event shapes', () => {
  for (const timeZone of [seoul, 'America/New_York', 'Pacific/Auckland', 'UTC']) {
    for (const when of [timed, { ...timed, startTime: asTimeStr('23:30'), endTime: asTimeStr('23:59') }, allDay]) {
      for (const recurrence of [weekly('2026-11-30'), { freq: 'daily' as const, until: asDateStr('2027-03-31') }, { freq: 'monthly' as const, until: asDateStr('2026-11-02') }]) {
        assert.deepEqual(parseGoogleRecurrence(toGoogleRrule(recurrence, { allDay: when.allDay, timeZone }), { when, timeZone }), recurrence, `${timeZone} ${JSON.stringify(when)}`)
      }
    }
  }
})

test('Blanky rows map repeat_until into the snapshot and the Google body; Google events map it back', () => {
  const base = { id: '3a7a7df6-a189-4a5c-b913-be2803be06c0', user_id: 'u', calendar_id: 'c', title: '헬스', date: '2026-11-02', start_time: '09:00', end_time: '10:00', priority: 'medium', status: 'todo', created_at: 'now', updated_at: '2026-11-01T00:00:00Z', repeat_rule: 'weekly', repeat_days: [1, 3] }
  assert.deepEqual(parseRecurrenceFromSchedule({ date: '2026-11-02', repeat: 'weekly', repeatDays: [1, 3], repeatUntil: null }), weekly())
  const snapshot = snapshotRowFromSchedule(mapScheduleRow({ ...base, repeat_until: '2026-11-30' }))
  assert.deepEqual(snapshot.recurrence, weekly('2026-11-30'))
  assert.deepEqual(snapshotRowFromSchedule(mapScheduleRow(base)).recurrence, weekly(), 'un-migrated rows still sync as open-ended')

  const body = googleBodyFromWrite({ summary: '헬스', description: '', when: snapshot.when, recurrence: snapshot.recurrence, blankyScheduleId: snapshot.scheduleId, colorId: null }, seoul)
  assert.deepEqual(body.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261130T145959Z'])
  const event = parseGoogleEvent({ id: 'g1', etag: 'e1', status: 'confirmed', summary: '헬스', ...body, updated: '2026-11-01T00:00:00Z' }, 'UTC')
  assert.equal(event.status === 'confirmed' && JSON.stringify(event.recurrence), JSON.stringify(weekly('2026-11-30')), 'event start timeZone wins over the calendar zone')
})

// --- reconcile: create / update / delete / conflict / split ---

const connection = {
  status: 'ready', id: asConnectionId('conn-1'), userId: asUserId('user-1'), googleSub: asGoogleSub('sub-1'), accountEmail: 'user@example.test',
  tokens: { refreshToken: 'r', accessToken: 'a', accessTokenExpiresAt: asIsoDateTime('2026-11-01T01:00:00Z') },
  calendar: { googleCalendarId: asGoogleCalendarId('gcal-1'), blankyCalendarId: asCalendarId('bcal-1'), timeZone: seoul, summary: 'Primary' },
  cursor: { kind: 'full' }, autoSync: false, lastSync: null,
} as unknown as ReadyConnection
const old = asIsoDateTime('2026-11-01T00:00:00Z')
const edited = asIsoDateTime('2026-11-03T00:00:00Z')
const row = (id: string, recurrence: Recurrence, updatedAt = old): SnapshotRow => ({ scheduleId: asScheduleId(id), updatedAt, title: '헬스', description: '', when: timed, recurrence, categoryId: null, color: null })
const link = (id: string, google: string): EventLink => ({ connectionId: connection.id, scheduleId: asScheduleId(id), googleEventId: asGoogleEventId(google), appliedEtag: asEtag('etag-1'), appliedBlankyUpdatedAt: old, origin: 'blanky', recurrenceMirror: 'mirrored' })
const event = (google: string, recurrence: Recurrence, etag = 'etag-1'): GooglePeerEvent => ({ id: asGoogleEventId(google), etag: asEtag(etag), status: 'confirmed', title: '헬스', description: '', when: timed, recurrence, updated: edited, blankyScheduleId: null, colorId: null })
const run = (rows: SnapshotRow[], links: EventLink[], events: GooglePeerEvent[]) => reconcile({ connection, snapshot: { calendarId: connection.calendar.blankyCalendarId, rows, links }, page: { events, nextPageToken: null, nextSyncToken: null } })
const until = (op: ReconcileOp) => op.kind === 'create_google' || op.kind === 'update_google' ? op.body.recurrence : op.kind === 'conflict' ? op.follow.body.recurrence : op.kind === 'upsert_blanky' ? op.draft.recurrence : null

test('create: a new bounded series exports its end date', () => {
  const ops = run([row('a', weekly('2026-11-30'))], [], [])
  assert.deepEqual(ops.map(op => op.kind), ['create_google'])
  assert.deepEqual(until(ops[0]), weekly('2026-11-30'))
})

test('update: ending or reopening a series in Blanky pushes the new rule', () => {
  const cut = run([row('a', weekly('2026-11-08'), edited)], [link('a', 'g')], [])
  assert.deepEqual(cut.map(op => [op.kind, until(op)]), [['update_google', weekly('2026-11-08')]])
  const reopened = run([row('a', weekly(), edited)], [link('a', 'g')], [])
  assert.deepEqual(until(reopened[0]), weekly())
})

test('update: an end date set in Google flows back into Blanky', () => {
  const ops = run([row('a', weekly())], [link('a', 'g')], [event('g', weekly('2026-11-30'), 'etag-2')])
  assert.deepEqual(ops.map(op => [op.kind, until(op)]), [['upsert_blanky', weekly('2026-11-30')]])
})

test('conflict: both sides changed the end date, Blanky wins and Google gets Blanky’s rule', () => {
  const ops = run([row('a', weekly('2026-11-08'), edited)], [link('a', 'g')], [event('g', weekly('2026-12-31'), 'etag-2')])
  assert.equal(ops.length, 1)
  assert.equal(ops[0].kind === 'conflict' && ops[0].note.reason, 'both_dirty')
  assert.deepEqual(until(ops[0]), weekly('2026-11-08'))
})

test('unchanged bounded series produce no writes', () => {
  assert.deepEqual(run([row('a', weekly('2026-11-30'))], [link('a', 'g')], [event('g', weekly('2026-11-30'))]), [])
})

test('delete: removing a series on either side deletes the peer', () => {
  assert.deepEqual(run([], [link('a', 'g')], []).map(op => op.kind), ['delete_google'])
  assert.deepEqual(run([row('a', weekly('2026-11-30'))], [link('a', 'g')], [{ id: asGoogleEventId('g'), etag: asEtag('x'), status: 'cancelled' }]).map(op => op.kind), ['delete_blanky'])
})

test('split: "this occurrence only" ends the original in Google and exports the one-off and the continuation', () => {
  const ops = run([row('a', weekly('2026-11-08'), edited), row('one-off', { freq: 'none' }, edited), row('rest', weekly(), edited)], [link('a', 'g')], [])
  assert.deepEqual(ops.map(op => [op.kind, op.kind === 'update_google' || op.kind === 'create_google' ? op.scheduleId : '', until(op)]), [
    ['update_google', 'a', weekly('2026-11-08')],
    ['create_google', 'one-off', { freq: 'none' }],
    ['create_google', 'rest', weekly()],
  ])
})

// --- store writes ---

function fakeDb(fail?: (payload: Record<string, unknown>) => { message: string; code?: string } | null) {
  const writes: Record<string, unknown>[] = []
  const chain = (payload: Record<string, unknown>) => {
    const result = () => { const error = fail?.(payload) ?? null; return { data: error ? null : { id: '3a7a7df6-a189-4a5c-b913-be2803be06c0', updated_at: 'now' }, error } }
    const q = { eq: () => q, select: () => q, single: async () => result(), maybeSingle: async () => result() }
    return q
  }
  const db = { from: () => ({ insert(payload: Record<string, unknown>) { writes.push(payload); return chain(payload) }, update(payload: Record<string, unknown>) { writes.push(payload); return chain(payload) } }) }
  return { db: db as never, writes }
}
const missingColumn = (payload: Record<string, unknown>) => 'repeat_until' in payload ? { message: "Could not find the 'repeat_until' column of 'schedules' in the schema cache", code: 'PGRST204' } : null

test('store: inbound inserts and updates write repeat_until', async () => {
  const { db, writes } = fakeDb()
  await upsertSchedule(db, { userId: asUserId('u'), calendarId: asCalendarId('c'), googleCalendarId: asGoogleCalendarId('g'), draft: row('pending:g', weekly('2026-11-30')) })
  await casUpdateSchedule(db, { id: asScheduleId('a'), expectedUpdatedAt: old, draft: row('a', weekly()) })
  assert.deepEqual(writes.map(write => write.repeat_until), ['2026-11-30', null])
})

test('store: before the migration, open-ended sync still works and a real end date fails loudly', async () => {
  const { db, writes } = fakeDb(missingColumn)
  assert.equal(await casUpdateSchedule(db, { id: asScheduleId('a'), expectedUpdatedAt: old, draft: row('a', weekly()) }), 'updated')
  assert.deepEqual(writes.map(write => 'repeat_until' in write), [true, false])
  await assert.rejects(casUpdateSchedule(db, { id: asScheduleId('a'), expectedUpdatedAt: old, draft: row('a', weekly('2026-11-30')) }), /repeat_until/)
})
