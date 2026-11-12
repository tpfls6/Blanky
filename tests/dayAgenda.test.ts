import assert from 'node:assert/strict'
import test from 'node:test'
import { dayAgenda } from '../src/utils/scheduleTimeline.ts'
import { occursOn } from '../src/utils/calendarMonth.ts'
import type { WorkItem } from '../src/types/work.ts'

const base = { description: '', endDate: null, endTime: null, duration: null, categoryId: null, dueDate: null, dueTime: null, allDay: false, repeat: 'none', repeatDays: [], priority: 'medium', status: 'todo' }
const row = (patch: Partial<WorkItem> & Pick<WorkItem, 'id' | 'kind' | 'date'>) => ({ ...base, title: patch.id, startTime: null, ...patch }) as WorkItem
const ids = (items: WorkItem[]) => items.map(item => item.id)
const day = (items: WorkItem[], date: string) => dayAgenda(items.filter(item => occursOn(item, date)), date)

const items = [
  row({ id: 'dateOnly', kind: 'task', date: '2026-11-04' }),
  row({ id: 'doneDateOnly', kind: 'task', date: '2026-11-04', status: 'done', priority: 'high' }),
  row({ id: 'highDateOnly', kind: 'task', date: '2026-11-04', priority: 'high' }),
  row({ id: 'timedTask', kind: 'task', date: '2026-11-04', startTime: '14:00', endTime: '15:00' }),
  row({ id: 'allDay', kind: 'event', date: '2026-11-04', allDay: true }),
  row({ id: 'meeting', kind: 'event', date: '2026-11-04', startTime: '09:00', endTime: '10:00' }),
  row({ id: 'otherDay', kind: 'task', date: '2026-11-05' }),
  row({ id: 'dueLater', kind: 'task', date: '2026-11-02', startTime: '10:00', dueDate: '2026-11-04' }),
  row({ id: 'weekly', kind: 'task', date: '2026-10-28', repeat: 'weekly' }),
]

test('date-only tasks, all-day events and timed items are split and sorted', () => {
  const agenda = day(items, '2026-11-04')
  assert.deepEqual(ids(agenda.dateOnly), ['highDateOnly', 'dateOnly', 'dueLater', 'weekly', 'doneDateOnly'])
  assert.deepEqual(ids(agenda.allDay), ['allDay'])
  assert.deepEqual(ids(agenda.timed), ['meeting', 'timedTask'])
})

test('a selected day shows only that day\'s tasks and no time is invented', () => {
  const agenda = day(items, '2026-11-05')
  assert.deepEqual(ids(agenda.dateOnly), ['otherDay'])
  assert.deepEqual([...agenda.allDay, ...agenda.timed], [])
  assert.equal(agenda.dateOnly[0].startTime, null)
})

test('a timed task stays on its hour on its own day and is date-only on a deadline-only day', () => {
  assert.deepEqual(ids(day(items, '2026-11-02').timed), ['dueLater'])
  assert.ok(ids(day(items, '2026-11-04').dateOnly).includes('dueLater'))
})

test('recurring tasks appear on every occurrence and moving a date moves the card', () => {
  assert.deepEqual(ids(day(items, '2026-11-11').dateOnly), ['weekly'])
  assert.deepEqual(ids(day(items, '2026-11-10').dateOnly), [])
  const moved = items.map(item => item.id === 'dateOnly' ? { ...item, date: '2026-11-06' } : item)
  assert.ok(!ids(day(moved, '2026-11-04').dateOnly).includes('dateOnly'))
  assert.deepEqual(ids(day(moved, '2026-11-06').dateOnly), ['dateOnly'])
})
