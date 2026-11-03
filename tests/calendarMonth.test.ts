import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDayItems } from '../src/utils/calendarMonth.ts'
import type { WorkItem } from '../src/types/work.ts'

const item = (patch: Partial<WorkItem> & { id: string }): WorkItem => ({
  kind: 'event', title: patch.id, description: '', date: '2026-10-05', startTime: null, endTime: null, duration: null,
  categoryId: null, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'none',
  ...patch,
})

test('sorts untimed entries first, then by time', () => {
  const day = calendarDayItems([
    item({ id: 'late', startTime: '18:00' }),
    item({ id: 'allday', allDay: true }),
    item({ id: 'early', startTime: '08:30' }),
  ], '2026-10-05')
  assert.deepEqual(day.map((entry) => entry.id), ['allday', 'early', 'late'])
})

test('recurring items appear on each matching day like one-offs', () => {
  const weekly = item({ id: 'weekly', date: '2026-10-05', startTime: '09:00', repeat: 'weekly' })
  assert.deepEqual(calendarDayItems([weekly], '2026-10-12').map((entry) => entry.id), ['weekly'])
  assert.deepEqual(calendarDayItems([weekly], '2026-10-13'), [])
})

test('drops duplicate rows and synced copies with the same title and time', () => {
  const day = calendarDayItems([
    item({ id: 'a', title: 'Standup', startTime: '09:00', endTime: '09:15' }),
    item({ id: 'a', title: 'Standup', startTime: '09:00', endTime: '09:15' }),
    item({ id: 'google-copy', title: ' standup ', startTime: '09:00', endTime: '09:15' }),
    item({ id: 'other', title: 'Standup', startTime: '10:00', endTime: '10:15' }),
  ], '2026-10-05')
  assert.deepEqual(day.map((entry) => entry.id), ['a', 'other'])
})

