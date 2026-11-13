import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
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
  asSyncToken,
  asTimeStr,
  asUserId,
  type ConnectionView,
  type GoogleEventId,
  type ScheduleId,
  type SyncFailure,
} from '../../../types/src/calendarSync.ts'
import { mapScheduleRow } from '../scheduleRepository.ts'
import { applyOps, RETRY_DELAYS_MS, type ApplyDeps } from './apply.ts'
import { createCalendarSyncClient } from './client.ts'
import type { EventLink, GoogleEventWrite, GooglePeerEvent, ReadyConnection, ReconcileOp, SnapshotRow } from './domain.ts'
import { CalendarSyncError, isSyncWideError, safeMessage } from './errors.ts'
import { createGoogleEvent, deleteGoogleEvent, googleBodyFromWrite, listGoogleEvents, updateGoogleEvent } from './googleApi.ts'
import { parseGoogleEvent } from './googleParse.ts'
import { refreshAccessToken } from './oauth.ts'
import { snapshotRowFromSchedule } from './store.ts'
import { runSync } from './sync.ts'
import { syncProblem } from '../../../../src/pages/Settings/calendarPanel.ts'

const NOW = new Date('2026-11-13T00:00:00Z')

const connection: ReadyConnection = {
  status: 'ready',
  id: asConnectionId('conn-1'),
  userId: asUserId('user-1'),
  googleSub: asGoogleSub('sub-1'),
  accountEmail: 'user@example.test',
  tokens: { refreshToken: 'refresh', accessToken: 'access', accessTokenExpiresAt: asIsoDateTime('2026-11-13T01:00:00Z') },
  calendar: { googleCalendarId: asGoogleCalendarId('gcal-1'), blankyCalendarId: asCalendarId('bcal-1'), timeZone: 'Asia/Seoul', summary: 'Primary' },
  cursor: { kind: 'incremental', token: asSyncToken('old-token') },
  autoSync: true,
  lastSync: { at: asIsoDateTime('2026-11-13T00:00:00Z'), imported: 0, exported: 0, deletedLocal: 0, deletedGoogle: 0, skippedUnsupported: 0, conflictCount: 0, error: null },
}

const timed = { allDay: false as const, date: asDateStr('2026-11-13'), startTime: asTimeStr('10:00'), endTime: asTimeStr('11:00') }

function write(input: Partial<GoogleEventWrite> = {}): GoogleEventWrite {
  return { summary: '회의', description: '', when: timed, recurrence: { freq: 'none' }, blankyScheduleId: asScheduleId('s-1'), colorId: null, ...input }
}

function row(id: string, input: Partial<SnapshotRow> = {}): SnapshotRow {
  return { scheduleId: asScheduleId(id), updatedAt: asIsoDateTime('2026-11-13T00:00:00Z'), title: id, description: '', when: timed, recurrence: { freq: 'none' }, categoryId: null, color: null, ...input }
}

function event(id: string, input: Partial<Extract<GooglePeerEvent, { status: 'confirmed' }>> = {}): Extract<GooglePeerEvent, { status: 'confirmed' }> {
  return { id: asGoogleEventId(id), etag: asEtag(`etag-${id}`), status: 'confirmed', title: '회의', description: '', when: timed, recurrence: { freq: 'none' }, updated: asIsoDateTime('2026-11-13T00:00:00Z'), blankyScheduleId: null, colorId: null, ...input }
}

function unused(): never {
  throw new Error('unexpected apply dep')
}

function deps(overrides: Partial<ApplyDeps>): ApplyDeps {
  return {
    connectionId: connection.id,
    readUpdatedAt: async () => asIsoDateTime('2026-11-13T00:00:00Z'),
    upsertSchedule: unused,
    deleteSchedule: unused,
    casUpdateSchedule: unused,
    upsertLink: async () => {},
    deleteLink: async () => {},
    createGoogleEvent: unused,
    updateGoogleEvent: unused,
    deleteGoogleEvent: unused,
    ...overrides,
  }
}

function googleFetch(status: number, body: unknown = {}): { fetcher: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return { fetcher, calls }
}

const create = (id: string): ReconcileOp => ({ kind: 'create_google', scheduleId: asScheduleId(id), body: write({ summary: id, blankyScheduleId: asScheduleId(id) }) })

// 1. Overnight and multi-day events

test('an overnight event saved without an end date ends on the next day in Google', () => {
  const body = googleBodyFromWrite(write({ when: { ...timed, startTime: asTimeStr('23:00'), endTime: asTimeStr('01:00') } }), 'Asia/Seoul')
  assert.deepEqual(body.start, { dateTime: '2026-11-13T23:00:00', timeZone: 'Asia/Seoul' })
  assert.deepEqual(body.end, { dateTime: '2026-11-14T01:00:00', timeZone: 'Asia/Seoul' })
})

test('a multi-day timed event keeps its end date and a same-day event is unchanged', () => {
  const multi = googleBodyFromWrite(write({ when: { ...timed, startTime: asTimeStr('09:00'), endTime: asTimeStr('18:00'), endDate: asDateStr('2026-11-15') } }), 'Asia/Seoul')
  assert.equal((multi.end as { dateTime: string }).dateTime, '2026-11-15T18:00:00')
  const plain = googleBodyFromWrite(write(), 'Asia/Seoul')
  assert.equal((plain.end as { dateTime: string }).dateTime, '2026-11-13T11:00:00')
})

test('a Google event crossing midnight imports with its end date, read in the start zone', () => {
  const parsed = parseGoogleEvent({
    id: 'g-night',
    etag: '"1"',
    status: 'confirmed',
    summary: '야간',
    start: { dateTime: '2026-11-13T23:00:00+09:00', timeZone: 'Asia/Seoul' },
    end: { dateTime: '2026-11-14T01:30:00+09:00', timeZone: 'America/New_York' },
  }, 'Asia/Seoul')
  assert.equal(parsed.status, 'confirmed')
  if (parsed.status !== 'confirmed') return
  assert.deepEqual(parsed.when, { allDay: false, date: '2026-11-13', startTime: '23:00', endTime: '01:30', endDate: '2026-11-14' })
})

test('a Blanky row with end_date round-trips to Google and back without losing the end day', () => {
  const snapshot = snapshotRowFromSchedule(mapScheduleRow({
    id: '11111111-1111-4111-8111-111111111111', user_id: 'user-1', calendar_id: 'bcal-1', title: '출장', description: '',
    date: '2026-11-13', start_time: '20:00', end_time: '09:00', end_date: '2026-11-15', all_day: false,
    repeat_rule: 'none', repeat_days: [], priority: 'medium', status: 'todo', updated_at: '2026-11-13T00:00:00Z', created_at: '2026-11-13T00:00:00Z',
  }))
  assert.equal(snapshot.when.allDay === false && snapshot.when.endDate, '2026-11-15')
  const body = googleBodyFromWrite(write({ when: snapshot.when }), 'Asia/Seoul')
  const back = parseGoogleEvent({ id: 'g', etag: 'e', status: 'confirmed', summary: '출장', ...body, start: { ...body.start as object, dateTime: '2026-11-13T20:00:00+09:00' }, end: { ...body.end as object, dateTime: '2026-11-15T09:00:00+09:00' } }, 'Asia/Seoul')
  assert.equal(back.status === 'confirmed' && back.when.allDay === false && back.when.endDate, '2026-11-15')
})

// 2. Google error classification (401 / 403 / 400 / 412 / 5xx / network)

test('Google errors map to distinct codes and only revoked tokens or outages stop the whole sync', async () => {
  const cases: Array<[number, unknown, string, boolean]> = [
    [401, {}, 'GOOGLE_DENIED', true],
    [403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }, 'GOOGLE_RATE_LIMITED', true],
    [403, { error: { errors: [{ reason: 'forbiddenForNonOrganizer' }] } }, 'GOOGLE_DENIED', false],
    [400, { error: { message: 'The specified time range is empty.' } }, 'GOOGLE_INVALID_EVENT', false],
    [503, {}, 'GOOGLE_UNAVAILABLE', true],
  ]
  for (const [status, body, code, wide] of cases) {
    const { fetcher } = googleFetch(status, body)
    await assert.rejects(createGoogleEvent({ accessToken: 'ya29.secret', googleCalendarId: asGoogleCalendarId('c'), body: write(), timeZone: 'UTC' }, fetcher), (error: unknown) => {
      assert.ok(error instanceof CalendarSyncError)
      assert.equal(error.code, code, `status ${status}`)
      assert.equal(isSyncWideError(error), wide, `status ${status}`)
      if (status === 400) assert.match(error.message, /time range is empty/)
      return true
    })
  }
  const offline = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
  await assert.rejects(listGoogleEvents({ accessToken: 'a', googleCalendarId: asGoogleCalendarId('c'), syncToken: null, pageToken: null, timeZone: 'UTC' }, offline), (error: unknown) => (
    error instanceof CalendarSyncError && error.code === 'GOOGLE_UNAVAILABLE'
  ))
})

test('412 on update and delete is reported as a mismatch, not thrown as a failure', async () => {
  const update = await updateGoogleEvent({ accessToken: 'a', googleCalendarId: asGoogleCalendarId('c'), id: asGoogleEventId('g'), etag: asEtag('e'), body: write(), timeZone: 'UTC' }, googleFetch(412).fetcher)
  assert.deepEqual(update, { kind: 'etag_mismatch' })
  assert.equal(await deleteGoogleEvent({ accessToken: 'a', googleCalendarId: asGoogleCalendarId('c'), id: asGoogleEventId('g'), etag: asEtag('e') }, googleFetch(412).fetcher), 'etag_mismatch')
})

test('a token refresh outage keeps the connection; only a refused grant asks to reconnect', async () => {
  const tokens = { refreshToken: '1//refresh-token-value', accessToken: 'old', accessTokenExpiresAt: asIsoDateTime('2000-01-01T00:00:00Z') }
  const offline = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
  await assert.rejects(refreshAccessToken({ clientId: 'id', clientSecret: 'secret', tokens }, offline), (error: unknown) => error instanceof CalendarSyncError && error.code === 'GOOGLE_UNAVAILABLE')
  await assert.rejects(refreshAccessToken({ clientId: 'id', clientSecret: 'secret', tokens }, googleFetch(500).fetcher), (error: unknown) => error instanceof CalendarSyncError && error.code === 'GOOGLE_UNAVAILABLE')
  await assert.rejects(refreshAccessToken({ clientId: 'id', clientSecret: 'secret', tokens }, googleFetch(400, { error: 'invalid_grant' }).fetcher), (error: unknown) => (
    error instanceof CalendarSyncError && error.code === 'GOOGLE_DENIED' && isSyncWideError(error)
  ))
})

test('error messages never carry tokens or secrets', () => {
  const raw = 'failed Bearer ya29.a0AfH6SMB access_token=ya29.zzz&refresh_token=1//0gLongRefreshToken client_secret=GOCSPX-abc {"refresh_token":"1//xyz"} eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl'
  const cleaned = safeMessage(raw)
  for (const secret of ['ya29', '1//0g', 'GOCSPX', '1//xyz', 'eyJhbGciOi']) assert.ok(!cleaned.includes(secret), `${secret} leaked: ${cleaned}`)
  assert.ok(!new CalendarSyncError('GOOGLE_HTTP', raw).message.includes('ya29'))
})

// 3. Per-item isolation, retry state and recovery

test('one rejected event does not stop the others and is held with a retry time', async () => {
  const created: string[] = []
  const report = await applyOps([create('a'), create('bad'), create('c')], deps({
    async createGoogleEvent(body) {
      if (body.summary === 'bad') throw new CalendarSyncError('GOOGLE_INVALID_EVENT', 'Google 일정을 만들지 못했습니다: The specified time range is empty.', 502, 400)
      created.push(body.summary)
      return { id: asGoogleEventId(`g-${body.summary}`), etag: asEtag('e') }
    },
  }), { now: NOW })
  assert.deepEqual(created, ['a', 'c'])
  assert.equal(report.exported, 2)
  assert.equal(report.failures.length, 1)
  const [failure] = report.failures
  assert.equal(failure.key, 'schedule:bad')
  assert.equal(failure.code, 'GOOGLE_INVALID_EVENT')
  assert.equal(failure.attempts, 1)
  assert.equal(failure.title, 'bad')
  assert.equal(Date.parse(failure.nextRetryAt), NOW.getTime() + RETRY_DELAYS_MS[0])
})

test('a held item waits for its retry time, then retries, backs off further and finally recovers', async () => {
  let calls = 0
  let fail = true
  const apply = deps({
    async createGoogleEvent() {
      calls += 1
      if (fail) throw new CalendarSyncError('GOOGLE_INVALID_EVENT', 'bad', 502, 400)
      return { id: asGoogleEventId('g-bad'), etag: asEtag('e') }
    },
  })
  const first = await applyOps([create('bad')], apply, { now: NOW })
  assert.equal(calls, 1)

  const early = await applyOps([create('bad')], apply, { now: new Date(NOW.getTime() + 60_000), previous: first.failures })
  assert.equal(calls, 1, 'no request before nextRetryAt')
  assert.deepEqual(early.failures, first.failures)

  const later = new Date(Date.parse(first.failures[0].nextRetryAt) + 1)
  const second = await applyOps([create('bad')], apply, { now: later, previous: early.failures })
  assert.equal(calls, 2)
  assert.equal(second.failures[0].attempts, 2)
  assert.equal(Date.parse(second.failures[0].nextRetryAt), later.getTime() + RETRY_DELAYS_MS[1])

  fail = false
  const forced = await applyOps([create('bad')], apply, { now: later, previous: second.failures, force: true })
  assert.equal(calls, 3, 'force retries immediately')
  assert.deepEqual(forced.failures, [])
  assert.equal(forced.exported, 1)
})

test('a failure that would hit every item stops the sync instead of being recorded per item', async () => {
  let calls = 0
  await assert.rejects(applyOps([create('a'), create('b')], deps({
    async createGoogleEvent() {
      calls += 1
      throw new CalendarSyncError('GOOGLE_DENIED', 'denied', 502, 401)
    },
  }), { now: NOW }), (error: unknown) => error instanceof CalendarSyncError && error.code === 'GOOGLE_DENIED')
  assert.equal(calls, 1)
})

// 4. 412 conflicts never overwrite or delete a changed Google event

const update = (id: string, summary = '로컬 수정'): ReconcileOp => ({
  kind: 'update_google', scheduleId: asScheduleId(id), googleEventId: asGoogleEventId(`g-${id}`), etag: asEtag('stale'), body: write({ summary, blankyScheduleId: asScheduleId(id) }),
})

test('update 412 with a different Google version is held without a second write', async () => {
  const writes: unknown[] = []
  const links: EventLink[] = []
  const report = await applyOps([update('s-1')], deps({
    async updateGoogleEvent(input) { writes.push(input); return { kind: 'etag_mismatch' } },
    async getGoogleEvent(id) { return event(id, { title: 'Google 수정' }) },
    async upsertLink(link) { links.push(link) },
  }), { now: NOW })
  assert.equal(writes.length, 1, 'never retried without If-Match')
  assert.equal(links.length, 0, 'link keeps the old etag so nothing is marked as synced')
  assert.equal(report.failures[0].code, 'GOOGLE_CONFLICT')
  assert.equal(report.conflicts[0].resolved, 'held')
  assert.equal(report.exported, 0)
})

test('update 412 where Google already has the Blanky content just refreshes the link', async () => {
  const links: EventLink[] = []
  const report = await applyOps([update('s-1', '회의')], deps({
    async updateGoogleEvent() { return { kind: 'etag_mismatch' } },
    async getGoogleEvent(id) { return event(id, { etag: asEtag('fresh') }) },
    async upsertLink(link) { links.push(link) },
  }), { now: NOW })
  assert.deepEqual(report.failures, [])
  assert.equal(links[0].appliedEtag, 'fresh')
})

test('delete 412 keeps the edited Google event and only stops tracking it', async () => {
  const deletes: unknown[] = []
  const unlinked: unknown[] = []
  const report = await applyOps([{ kind: 'delete_google', scheduleId: asScheduleId('s-1'), googleEventId: asGoogleEventId('g-1'), etag: asEtag('stale') }], deps({
    async deleteGoogleEvent(input) { deletes.push(input); return 'etag_mismatch' },
    async getGoogleEvent(id) { return event(id, { title: 'Google 수정' }) },
    async deleteLink(input) { unlinked.push(input) },
  }), { now: NOW })
  assert.equal(deletes.length, 1, 'no forced delete')
  assert.deepEqual(unlinked, [{ googleEventId: 'g-1' }])
  assert.equal(report.deletedGoogle, 0)
  assert.equal(report.conflicts[0].resolved, 'remote_kept')
  assert.deepEqual(report.failures, [])
})

// 5. Cursor safety and duplicates

function syncHarness(input: { events: GooglePeerEvent[]; rows?: SnapshotRow[]; links?: EventLink[]; apply: ApplyDeps; previous?: SyncFailure[] }) {
  const saved: unknown[] = []
  const run = runSync({
    connection,
    google: { async list() { return { kind: 'page', page: { events: input.events, nextPageToken: null, nextSyncToken: asSyncToken('new-token') } } } },
    async loadSnapshot() { return { calendarId: connection.calendar.blankyCalendarId, rows: input.rows ?? [], links: input.links ?? [] } },
    async wipeLinks() {},
    async saveCursor(_id, cursor) { saved.push(cursor) },
    apply: input.apply,
    retry: { now: NOW, previous: input.previous ?? [] },
  })
  return { run, saved }
}

test('a failed Google import keeps the old sync token so the event is listed again', async () => {
  const imported: string[] = []
  const { run, saved } = syncHarness({
    events: [event('ok'), event('broken')],
    apply: deps({
      async upsertSchedule(draft) {
        if (draft.scheduleId === 'pending:broken') throw new CalendarSyncError('STORE_FAILED', 'insert failed', 500)
        imported.push(draft.scheduleId)
        return { scheduleId: asScheduleId('s-ok'), updatedAt: asIsoDateTime('2026-11-13T00:00:00Z') }
      },
    }),
  })
  const report = await run
  assert.deepEqual(imported, ['pending:ok'])
  assert.equal(report.failures[0].key, 'google:broken')
  assert.deepEqual(report.cursor, { kind: 'incremental', token: 'old-token' })
  assert.deepEqual(saved, [{ kind: 'incremental', token: 'old-token' }])
})

test('an outbound-only failure still advances the token; the row is re-sent from the snapshot', async () => {
  const { run } = syncHarness({
    events: [],
    rows: [row('local')],
    apply: deps({ async createGoogleEvent() { throw new CalendarSyncError('GOOGLE_INVALID_EVENT', 'bad', 502, 400) } }),
  })
  const report = await run
  assert.equal(report.failures[0].key, 'schedule:local')
  assert.deepEqual(report.cursor, { kind: 'incremental', token: 'new-token' })
})

test('a create whose link save failed is re-linked next time, not created twice', async () => {
  const local = row('11111111-1111-4111-8111-111111111111')
  let creates = 0
  const links: EventLink[] = []
  const first = await syncHarness({
    events: [],
    rows: [local],
    apply: deps({
      async createGoogleEvent() { creates += 1; return { id: asGoogleEventId('g-new'), etag: asEtag('e1') } },
      async upsertLink() { throw new CalendarSyncError('STORE_FAILED', 'link write failed', 500) },
    }),
  }).run
  assert.equal(first.failures[0].key, `schedule:${local.scheduleId}`)
  const second = await syncHarness({
    events: [event('g-new', { etag: asEtag('e1'), blankyScheduleId: local.scheduleId as ScheduleId })],
    rows: [local],
    previous: [...first.failures],
    apply: deps({
      async createGoogleEvent() { creates += 1; return { id: asGoogleEventId('dup'), etag: asEtag('e') } },
      async upsertLink(link) { links.push(link) },
    }),
  }).run
  assert.equal(creates, 1)
  assert.equal(links[0].googleEventId, 'g-new' as GoogleEventId)
  assert.deepEqual(second.failures, [])
})

// 6. Client transport errors

function invokeFails(error: unknown): SupabaseClient {
  return { functions: { async invoke() { return { data: null, error } } } } as unknown as SupabaseClient
}

test('client maps gateway 401 to UNAUTHENTICATED and transport failures to NETWORK', async () => {
  await assert.rejects(createCalendarSyncClient(invokeFails({ name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status: 401, json: async () => ({ msg: 'Invalid JWT' }) } })).status(), (error: unknown) => (
    error instanceof CalendarSyncError && error.code === 'UNAUTHENTICATED'
  ))
  await assert.rejects(createCalendarSyncClient(invokeFails({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('fetch failed') })).status(), (error: unknown) => (
    error instanceof CalendarSyncError && error.code === 'NETWORK'
  ))
})

test('sync now sends force so held items retry immediately', async () => {
  const bodies: unknown[] = []
  const client = { functions: { async invoke(_name: string, options: { body: unknown }) { bodies.push(options.body); return { data: { failures: [] }, error: null } } } } as unknown as SupabaseClient
  await createCalendarSyncClient(client).sync({ force: true })
  await createCalendarSyncClient(client).sync()
  assert.deepEqual(bodies, [{ type: 'sync', force: true }, { type: 'sync', force: false }])
})

// 7. Banner and settings read the same recorded state

function readyView(lastSync: Partial<Extract<ConnectionView, { status: 'ready' }>['lastSync']>): ConnectionView {
  return { status: 'ready', accountEmail: 'a', calendarSummary: 'c', autoSync: true, lastSync: { ...connection.lastSync, ...lastSync } }
}

test('sync problem: clean, partial, whole failure and reauth', () => {
  assert.equal(syncProblem(readyView({})), null)
  const failure: SyncFailure = { key: 'schedule:s', op: 'create_google', code: 'GOOGLE_INVALID_EVENT', message: 'm', title: '야간 근무', googleEventId: null, attempts: 1, nextRetryAt: asIsoDateTime('2026-11-13T00:05:00Z') }
  const partial = syncProblem(readyView({ failures: [failure] }))
  assert.equal(partial?.line, '일정 1건을 동기화하지 못했습니다.')
  assert.deepEqual(partial?.details, ['야간 근무 · Google Calendar가 일정 내용을 받지 않았습니다.'])
  assert.match(partial?.hint ?? '', /다시 시도합니다/)
  assert.equal(syncProblem(readyView({ error: 'x', errorCode: 'GOOGLE_RATE_LIMITED' }))?.line, 'Google Calendar 요청 한도를 넘었습니다.')
  assert.equal(syncProblem({ status: 'needs_reauth', accountEmail: 'a', calendarSummary: 'c' })?.line, '다시 연결 필요')
})
