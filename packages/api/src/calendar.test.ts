import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mapCalendarRow } from './calendarRepository.ts'
import { mapScheduleRow, createScheduleRepository } from './scheduleRepository.ts'
import { withPersonalCalendar } from '../../../src/services/calendar/local.ts'
import type { LibraryData } from '../../../src/types/records.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'

const row = {
  id: 'schedule', user_id: 'user', calendar_id: 'personal', created_by_user_id: 'user',
  title: '회의', date: '2026-10-02', start_time: '15:00:00', end_time: '16:00:00',
  priority: 'medium', status: 'todo', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
}

test('calendar and schedule mapping preserve ownership and legacy times', () => {
  const schedule = mapScheduleRow(row)
  assert.equal(schedule.calendarId, 'personal')
  assert.equal(schedule.createdByUserId, 'user')
  assert.equal(schedule.startTime, '15:00')
  const calendar = mapCalendarRow({
    id: 'personal', owner_user_id: 'user', name: '내 캘린더', description: '',
    color: '#3A62B0', icon: 'Calendar', type: 'personal', is_default_personal: true,
    timezone: 'Asia/Seoul', created_at: row.created_at, updated_at: row.updated_at,
  })
  assert.equal(calendar.ownerUserId, schedule.createdByUserId)
  assert.equal(calendar.isDefaultPersonal, true)
  assert.throws(() => mapCalendarRow({ ...calendar, type: 'invalid' }))
})

test('legacy create omits calendar; update preserves calendar unless explicitly moved', async () => {
  const sent: Record<string, unknown>[] = []
  const query = {
    insert(value: Record<string, unknown>) { sent.push(value); return this },
    update(value: Record<string, unknown>) { sent.push(value); return this },
    select() { return this }, eq() { return this },
    async single() { return { data: row, error: null } },
  }
  const client = { from: () => query } as unknown as SupabaseClient<Database>
  const repo = createScheduleRepository(client)
  await repo.create('user', { title: '회의', date: row.date })
  await repo.update('schedule', { title: '수정', date: row.date })
  await repo.update('schedule', { title: '이동', date: row.date, calendarId: 'another' })
  assert.equal('calendar_id' in sent[0], false)
  assert.equal('calendar_id' in sent[1], false)
  assert.equal(sent[2].calendar_id, 'another')
  assert.equal('created_by_user_id' in sent[0], false)
})

test('browser migration is idempotent and preserves event data without mutating input', () => {
  const original = { items: [{ id: 'existing', title: '회의', date: row.date, startTime: '15:00', repeat: 'weekly' }] } as LibraryData
  const next = withPersonalCalendar(original, 'user')
  assert.equal(next.items[0].calendarId, next.personalCalendar?.id)
  assert.equal(next.items[0].createdByUserId, 'user')
  assert.equal(next.items[0].repeat, 'weekly')
  assert.equal(original.items[0].calendarId, undefined)
  assert.deepEqual(withPersonalCalendar(next, 'user'), next)
  const added = withPersonalCalendar({ ...next, items: [...next.items, { ...original.items[0], id: 'new' }] }, 'user')
  assert.equal(added.items[1].calendarId, next.personalCalendar?.id)
})
