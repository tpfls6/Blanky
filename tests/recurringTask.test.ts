import assert from 'node:assert/strict'
import test from 'node:test'
import { repeatsOn } from '../packages/types/src/recurrence.ts'
import { mapScheduleRow } from '../packages/api/src/scheduleRepository.ts'
import { applySeriesChangeLocally, commitSeriesChange, planOccurrenceEdit, SeriesScopeError, shiftISO, workPatch } from '../src/features/schedule/seriesEdit.ts'
import { repeatSummary } from '../src/features/schedule/recurringList.ts'
import type { WorkItem } from '../src/types/work.ts'

// 2026-11-02 is a Monday. A daily task with no time.
const task: WorkItem = { id: 'task', kind: 'task', title: '영양제 먹기', description: '', date: '2026-11-02', startTime: null, endTime: null, duration: null,
  categoryId: null, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'daily', repeatDays: [], calendarId: 'cal', createdByUserId: 'me' }

function days(row: Parameters<typeof repeatsOn>[0], from: string, to: string): string[] {
  const out: string[] = []
  for (let day = from; day <= to; day = shiftISO(day, 1)) if (repeatsOn(row, day)) out.push(day)
  return out
}

/** day → status of the row that owns it; fails on two rows for one day. */
function statuses(rows: WorkItem[], from = '2026-11-02', to = '2026-11-08'): Record<string, string> {
  const out: Record<string, string> = {}
  for (let day = from; day <= to; day = shiftISO(day, 1)) {
    const hits = rows.filter(row => repeatsOn(row, day))
    assert.ok(hits.length <= 1, `duplicate occurrence on ${day}`)
    if (hits[0]) out[day] = hits[0].status
  }
  return out
}

let next = 0
const ids = () => `new-${++next}`
const fresh = () => { let n = 0; globalThis.crypto.randomUUID = (() => `id-${++n}`) as typeof crypto.randomUUID }

test('custom intervals: every N days, weeks (Monday-start weeks) and months; absent interval is unchanged', () => {
  assert.deepEqual(days({ date: '2026-11-02', repeat: 'daily', repeatInterval: 3 }, '2026-11-02', '2026-11-12'), ['2026-11-02', '2026-11-05', '2026-11-08', '2026-11-11'])
  assert.deepEqual(days({ date: '2026-11-04', repeat: 'weekly', repeatDays: [1, 3], repeatInterval: 2 }, '2026-11-02', '2026-11-30'), ['2026-11-04', '2026-11-16', '2026-11-18', '2026-11-30'])
  assert.deepEqual(days({ date: '2026-01-31', repeat: 'monthly', repeatInterval: 2 }, '2026-01-01', '2026-12-31'), ['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31'], 'months without the 31st are skipped')
  assert.deepEqual(days({ date: '2026-11-02', repeat: 'daily' }, '2026-11-02', '2026-11-04'), ['2026-11-02', '2026-11-03', '2026-11-04'])
  assert.deepEqual(days({ date: '2026-11-02', repeat: 'daily', repeatInterval: 2, repeatUntil: '2026-11-06' }, '2026-11-02', '2026-11-10'), ['2026-11-02', '2026-11-04', '2026-11-06'])
  assert.equal(repeatSummary({ ...task, repeat: 'weekly', repeatDays: [2], repeatInterval: 2 }), '격주 화')
  assert.equal(repeatSummary({ ...task, repeatInterval: 3 }), '3일마다')
})

test('the interval column round-trips through the repository mapper', () => {
  const row = { id: 'x', user_id: 'u', calendar_id: 'c', title: 't', date: '2026-11-02', created_at: 'now', updated_at: 'now', kind: 'task', priority: 'medium', status: 'todo', repeat_rule: 'daily', repeat_days: [], repeat_interval: 4 }
  assert.equal(mapScheduleRow(row).repeatInterval, 4)
  assert.equal(mapScheduleRow({ ...row, repeat_interval: 0 }).repeatInterval, 1)
  assert.equal('repeatInterval' in mapScheduleRow({ ...row, repeat_interval: undefined, repeat_rule: 'none' }), true)
})

test('completing one day of a recurring task leaves every other day open, without duplicates', () => {
  fresh()
  // In order: the series moves on and the day becomes its own done row.
  let rows = applySeriesChangeLocally([task], planOccurrenceEdit([task], task, '2026-11-02', 'this', { ...task, status: 'done' }))
  assert.deepEqual(statuses(rows), { '2026-11-02': 'done', '2026-11-03': 'todo', '2026-11-04': 'todo', '2026-11-05': 'todo', '2026-11-06': 'todo', '2026-11-07': 'todo', '2026-11-08': 'todo' })
  assert.equal(rows.length, 2)
  assert.equal(rows.find(row => row.status === 'done')!.seriesId, 'task')
  // Out of order (a later day): the series is cut around it.
  const series = rows.find(row => row.repeat === 'daily')!
  rows = applySeriesChangeLocally(rows, planOccurrenceEdit(rows, series, '2026-11-05', 'this', { ...series, status: 'done' }))
  assert.equal(statuses(rows)['2026-11-05'], 'done')
  assert.equal(Object.values(statuses(rows)).filter(value => value === 'done').length, 2)
  // Undoing the done day keeps it a single row for that day.
  const done = rows.find(row => row.date === '2026-11-05' && row.repeat === 'none')!
  rows = applySeriesChangeLocally(rows, planOccurrenceEdit(rows, done, '2026-11-05', 'this', { ...done, status: 'todo' }))
  assert.equal(statuses(rows)['2026-11-05'], 'todo')
})

test('scopes: this / future / all edits and deletes of a recurring task', () => {
  fresh()
  const retitled = { ...task, title: '비타민' }
  const only = applySeriesChangeLocally([task], planOccurrenceEdit([task], task, '2026-11-04', 'this', retitled))
  assert.deepEqual(only.filter(row => repeatsOn(row, '2026-11-04')).map(row => row.title), ['비타민'])
  assert.deepEqual(only.filter(row => repeatsOn(row, '2026-11-05')).map(row => row.title), ['영양제 먹기'])

  const future = applySeriesChangeLocally([task], planOccurrenceEdit([task], task, '2026-11-04', 'future', retitled))
  assert.deepEqual(['2026-11-03', '2026-11-04', '2026-11-20'].map(day => future.find(row => repeatsOn(row, day))!.title), ['영양제 먹기', '비타민', '비타민'])

  const all = applySeriesChangeLocally([task], planOccurrenceEdit([task], task, '2026-11-04', 'all', { ...retitled, priority: 'high' }))
  assert.deepEqual(all.map(row => [row.title, row.priority, row.date]), [['비타민', 'high', '2026-11-02']])

  // Moving the opened day: 'this' moves one occurrence, 'all' shifts the series, 'future' refuses.
  const moved = applySeriesChangeLocally([task], planOccurrenceEdit([task], task, '2026-11-04', 'this', { ...task, date: '2026-11-10', repeat: 'none' }))
  assert.equal(moved.filter(row => repeatsOn(row, '2026-11-04')).length, 0)
  assert.equal(moved.filter(row => repeatsOn(row, '2026-11-10')).length, 2, 'moved one-off plus the regular day')
  const shifted = applySeriesChangeLocally([task], planOccurrenceEdit([task], task, '2026-11-04', 'all', { ...task, date: '2026-11-06' }))
  assert.equal(shifted[0].date, '2026-11-04')
  assert.throws(() => planOccurrenceEdit([task], task, '2026-11-04', 'future', { ...task, date: '2026-11-06' }), SeriesScopeError)

  assert.deepEqual(days(applySeriesChangeLocally([task], planOccurrenceEdit([task], task, '2026-11-04', 'this', null))[0], '2026-11-02', '2026-11-05'), ['2026-11-02', '2026-11-03'])
  const cut = applySeriesChangeLocally([task], planOccurrenceEdit([task], task, '2026-11-04', 'future', null))
  assert.deepEqual(cut.map(row => row.repeatUntil), ['2026-11-03'])
  assert.deepEqual(applySeriesChangeLocally([task], planOccurrenceEdit([task], task, '2026-11-04', 'all', null)), [])
  // Interval and end date are rule changes; an unchanged interval is not a change.
  assert.deepEqual(workPatch(task, { ...task, repeatInterval: 1 }), {})
  assert.deepEqual(workPatch(task, { ...task, repeatInterval: 2, repeatUntil: '2026-12-31' }), { repeatInterval: 2, repeatUntil: '2026-12-31' })
})

test('a failed completion rolls back what already landed, so a retry never duplicates rows', async () => {
  fresh()
  const store = new Map<string, WorkItem>([[task.id, task]])
  let calls = 0
  const commit = async (before: WorkItem | null, after: WorkItem | null) => {
    calls += 1
    if (calls === 2) throw new Error('network')
    if (after) store.set(after.id, after); else if (before) store.delete(before.id)
    return after
  }
  const changes = planOccurrenceEdit([task], task, '2026-11-02', 'this', { ...task, status: 'done' })
  await assert.rejects(commitSeriesChange(changes, commit))
  assert.deepEqual([...store.values()].map(row => [row.id, row.date, row.status]), [['task', '2026-11-02', 'todo']])
  calls = 10
  await commitSeriesChange(planOccurrenceEdit([...store.values()], task, '2026-11-02', 'this', { ...task, status: 'done' }), commit)
  assert.equal(store.size, 2)
  void ids
})
