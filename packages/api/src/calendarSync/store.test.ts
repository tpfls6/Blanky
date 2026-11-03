import assert from 'node:assert/strict'
import test from 'node:test'
import { bindPersonalToCalendar, findOwnedSchedules, googleImportScheduleId } from './store.ts'
import { asCalendarId, asUserId, asScheduleId } from '../../../types/src/calendarSync.ts'

test('first Blanky import binds original rows without cloning or resetting task metadata', async () => {
  const calls: unknown[] = []
  const query = {
    update(value: unknown) { calls.push(['update', value]); return this },
    eq(key: string, value: unknown) { calls.push(['eq', key, value]); return this },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(resolve) },
  }
  await bindPersonalToCalendar({ from(table) { calls.push(['from', table]); return query } }, {
    userId: asUserId('owner'), personalCalendarId: asCalendarId('personal'), boundCalendarId: asCalendarId('google-bound'),
  })
  assert.deepEqual(calls, [['from', 'schedules'], ['update', { calendar_id: 'google-bound' }], ['eq', 'calendar_id', 'personal'], ['eq', 'user_id', 'owner']])
})

test('untrusted Google markers cannot query arbitrary non-UUID schedule IDs', async () => {
  const rows = await findOwnedSchedules({ from() { throw new Error('must not query') } }, asUserId('owner'), [asScheduleId('pending:event'), asScheduleId('foreign-text')])
  assert.deepEqual(rows, [])
})

test('the same Google event keeps one ID across concurrent imports and reconnects', async () => {
  const owner = asUserId('owner')
  const id = await googleImportScheduleId(owner, 'google-calendar', 'pending:google-event')
  assert.equal(id, await googleImportScheduleId(owner, 'google-calendar', 'pending:google-event'))
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(id, await googleImportScheduleId(asUserId('other'), 'google-calendar', 'pending:google-event'))
  assert.notEqual(id, await googleImportScheduleId(owner, 'other-calendar', 'pending:google-event'))
})
