import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { repeatsOn } from '../packages/types/src/recurrence.ts'
import { createScheduleRepository, mapScheduleRow } from '../packages/api/src/scheduleRepository.ts'
import { applySeriesChangeLocally, commitSeriesChange, groupSeries, planGroupDelete, planGroupPatch, planSeriesDelete, planSeriesPatch, previewSeriesChange, segmentAt, shiftISO } from '../src/features/schedule/seriesEdit.ts'
import { currentSegment, groupChanges, groupPeriod, groupUpcoming, isEnded, listRecurring, repeatSummary, upcomingOccurrence } from '../src/features/schedule/recurringList.ts'
import type { WorkItem } from '../src/types/work.ts'

// App utils import the Vite alias @blanky/utils; map it the same way for this test only.
registerHooks({ resolve: (specifier, context, next) => specifier === '@blanky/utils'
  ? { url: pathToFileURL(`${process.cwd()}/packages/utils/src/index.ts`).href, shortCircuit: true }
  : next(specifier, context) })
const { createWorkItem, occursOn } = await import('../src/utils/work.ts')

// 2026-11-02 is a Monday. Weekly Mon/Wed, 09:00–10:00.
const series: WorkItem = { id: 'series', kind: 'event', title: '운동', description: '', date: '2026-11-02', startTime: '09:00', endTime: '10:00', duration: 60,
  categoryId: 'health', priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'weekly', repeatDays: [1, 3], calendarId: 'cal', createdByUserId: 'me' }
const single: WorkItem = { ...series, id: 'single', title: '병원', repeat: 'none', repeatDays: [] }

/** date → start time of every occurrence (series anchors) in the window. */
function occurrences(rows: WorkItem[], from = '2026-11-01', to = '2026-11-30'): Record<string, string> {
  const out: Record<string, string> = {}
  for (let day = from; day <= to; day = shiftISO(day, 1)) {
    const hits = rows.filter(row => repeatsOn(row, day))
    assert.ok(hits.length <= 1, `duplicate occurrence on ${day}`)
    if (hits[0]) out[day] = `${hits[0].startTime ?? '종일'}${hits[0].repeat === 'none' ? '*' : ''}`
  }
  return out
}
const BASE = { '2026-11-02': '09:00', '2026-11-04': '09:00', '2026-11-09': '09:00', '2026-11-11': '09:00', '2026-11-16': '09:00', '2026-11-18': '09:00', '2026-11-23': '09:00', '2026-11-25': '09:00', '2026-11-30': '09:00' }

test('repeatUntil ends a series; absent or null keeps existing behaviour', () => {
  assert.deepEqual(occurrences([series]), BASE)
  assert.deepEqual(occurrences([{ ...series, repeatUntil: null }]), BASE)
  assert.deepEqual(Object.keys(occurrences([{ ...series, repeatUntil: '2026-11-09' }])), ['2026-11-02', '2026-11-04', '2026-11-09'])
  // A one-off row ignores repeatUntil entirely.
  assert.equal(repeatsOn({ ...single, repeatUntil: '2026-10-01' }, '2026-11-02'), true)
})

test('createWorkItem only carries repeatUntil when given, so un-migrated rows never send it', () => {
  assert.equal('repeatUntil' in createWorkItem({ kind: 'event', title: 'a', date: '2026-11-02', repeat: 'weekly', repeatDays: [1] })!, false)
  assert.equal(createWorkItem({ kind: 'event', title: 'a', date: '2026-11-02', repeat: 'weekly', repeatDays: [1], repeatUntil: '2026-12-01' })!.repeatUntil, '2026-12-01')
  assert.equal(createWorkItem({ kind: 'event', title: 'a', date: '2026-11-02', repeat: 'none', repeatUntil: '2026-12-01' })!.repeatUntil, null)
})

test('repository maps repeat_until only when the column exists and only sends known values', async () => {
  const row = { id: 'x', user_id: 'u', calendar_id: 'c', title: 't', date: '2026-11-02', priority: 'medium', status: 'todo', repeat_rule: 'weekly', repeat_days: [1], created_at: 'now', updated_at: 'now' }
  assert.equal('repeatUntil' in mapScheduleRow(row), false)
  assert.equal(mapScheduleRow({ ...row, repeat_until: '2026-12-01' }).repeatUntil, '2026-12-01')
  assert.equal('seriesId' in mapScheduleRow(row), false)
  assert.equal(mapScheduleRow({ ...row, series_id: 'root' }).seriesId, 'root')
  const payloads: Record<string, unknown>[] = []
  const query = { update(value: Record<string, unknown>) { payloads.push(value); return query }, eq() { return query }, select() { return query }, async single() { return { data: { ...row, ...payloads.at(-1) }, error: null } } }
  const repository = createScheduleRepository({ from: () => query } as never)
  await repository.update('x', { title: 't', date: '2026-11-02', repeat: 'weekly', repeatDays: [1] })
  assert.equal('repeat_until' in payloads[0], false)
  await repository.update('x', { title: 't', date: '2026-11-02', repeat: 'weekly', repeatDays: [1], repeatUntil: '2026-12-01' })
  assert.equal(payloads[1].repeat_until, '2026-12-01')
  await repository.update('x', { title: 't', date: '2026-11-02', repeat: 'none', repeatUntil: '2026-12-01' })
  assert.equal(payloads[2].repeat_until, null)
  assert.equal('series_id' in payloads[0], false)
  await repository.update('x', { title: 't', date: '2026-11-02', repeat: 'weekly', repeatDays: [1], seriesId: 'root' })
  assert.equal(payloads[3].series_id, 'root')
})

test('delete: all / future / this', () => {
  assert.deepEqual(planSeriesDelete(series, '2026-11-11', 'all'), { remove: series })
  assert.deepEqual(planSeriesDelete(series, '2026-11-02', 'future'), { remove: series })

  const future = applySeriesChangeLocally([series], planSeriesDelete(series, '2026-11-11', 'future'))
  assert.deepEqual(Object.keys(occurrences(future)), ['2026-11-02', '2026-11-04', '2026-11-09'])

  const only = applySeriesChangeLocally([series], planSeriesDelete(series, '2026-11-11', 'this'))
  const expected: Record<string, string> = { ...BASE }
  delete expected['2026-11-11']
  assert.deepEqual(occurrences(only), expected)
  assert.equal(only.length, 2)
})

test('deleting the first occurrence moves the start and freezes a legacy weekday', () => {
  const legacy = { ...series, repeatDays: [] } // legacy: repeats on the start weekday (Monday)
  const change = planSeriesDelete(legacy, '2026-11-02', 'this')
  assert.equal(change.create, undefined)
  assert.deepEqual(change.update?.patch, { date: '2026-11-09', endDate: null, repeatDays: [1] })
  assert.deepEqual(Object.keys(occurrences(applySeriesChangeLocally([legacy], change))), ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
})

test('deleting the only remaining occurrence removes the series', () => {
  const short = { ...series, repeatUntil: '2026-11-02' }
  assert.deepEqual(planSeriesDelete(short, '2026-11-02', 'this'), { remove: short })
})

test('patch: this occurrence only becomes a one-off and leaves the rest untouched', () => {
  const change = planSeriesPatch(series, '2026-11-11', 'this', { startTime: '18:00', endTime: '19:00', duration: null, repeatDays: [5] })
  const after = applySeriesChangeLocally([series], change)
  assert.deepEqual(occurrences(after), { ...BASE, '2026-11-11': '18:00*' })
  const oneOff = after.find(row => row.repeat === 'none')!
  assert.equal(oneOff.date, '2026-11-11')
  assert.equal(oneOff.repeatUntil, null)
  assert.equal(oneOff.calendarId, 'cal')
})

test('patch: from this occurrence on applies the new rule only to later dates', () => {
  const change = planSeriesPatch({ ...series, repeatUntil: '2026-11-27' }, '2026-11-11', 'future', { startTime: '07:00', endTime: '08:00', duration: null, repeatDays: [2, 4] })
  const after = applySeriesChangeLocally([{ ...series, repeatUntil: '2026-11-27' }], change)
  assert.deepEqual(occurrences(after), {
    '2026-11-02': '09:00', '2026-11-04': '09:00', '2026-11-09': '09:00',
    '2026-11-12': '07:00', '2026-11-17': '07:00', '2026-11-19': '07:00', '2026-11-24': '07:00', '2026-11-26': '07:00',
  })
  assert.equal(change.update?.patch.repeatUntil, '2026-11-10')
  assert.equal(change.create?.[0].repeatUntil, '2026-11-27')
})

test('patch: from the first occurrence on is a whole-series update', () => {
  const change = planSeriesPatch(series, '2026-11-02', 'future', { title: '아침 운동' })
  assert.equal(change.create, undefined)
  assert.equal(change.update?.patch.title, '아침 운동')
})

test('patch: whole series keeps the multi-day span when the start moves', () => {
  const trip = { ...series, repeat: 'monthly' as const, repeatDays: [], allDay: true, startTime: null, endTime: null, date: '2026-11-02', endDate: '2026-11-04' }
  const change = planSeriesPatch(trip, '2026-12-02', 'all', { date: '2026-11-05' })
  assert.deepEqual(change.update?.patch, { date: '2026-11-05', endDate: '2026-11-07', repeatDays: [] })
  const [moved] = applySeriesChangeLocally([trip], change)
  assert.equal(occursOn(moved, '2026-12-07'), true)
  assert.equal(occursOn(moved, '2026-12-08'), false)
})

test('multi-day occurrences: a single edit keeps its span and never cuts the series with endDate', () => {
  const trip = { ...series, repeatDays: [1], allDay: true, startTime: null, endTime: null, endDate: '2026-11-03' }
  const after = applySeriesChangeLocally([trip], planSeriesPatch(trip, '2026-11-16', 'this', { title: '출장(변경)' }))
  const oneOff = after.find(row => row.repeat === 'none')!
  assert.deepEqual([oneOff.date, oneOff.endDate], ['2026-11-16', '2026-11-17'])
  for (const row of after.filter(row => row.repeat !== 'none')) assert.equal(row.endDate && shiftISO(row.date, 1), row.endDate)
  assert.equal(after.some(row => row.repeat !== 'none' && occursOn(row, '2026-11-17')), false)
  assert.equal(after.some(row => row.repeat !== 'none' && occursOn(row, '2026-11-24')), true)
})

test('one-off items are unaffected by scope', () => {
  assert.deepEqual(planSeriesPatch(single, '2026-11-02', 'this', { title: 'x' }), { update: { item: single, patch: { title: 'x' } } })
  assert.deepEqual(planSeriesDelete(single, '2026-11-02', 'future'), { remove: single })
})

test('preview marks changed, added and removed occurrences', () => {
  const rows = previewSeriesChange(series, planSeriesPatch(series, '2026-11-09', 'future', { repeatDays: [1, 5] }), '2026-11-09', 4)
  assert.deepEqual(rows.map(row => [row.date, row.status]), [['2026-11-09', 'same'], ['2026-11-11', 'removed'], ['2026-11-13', 'added'], ['2026-11-16', 'same']])
  const timed = previewSeriesChange(series, planSeriesPatch(series, '2026-11-09', 'this', { startTime: '10:00', endTime: '11:00', duration: null }), '2026-11-04', 3)
  assert.deepEqual(timed.map(row => row.status), ['same', 'changed', 'same'])
})

test('commitSeriesChange creates first and rolls back on failure', async () => {
  const calls: string[] = []
  const change = planSeriesDelete(series, '2026-11-11', 'this')
  await commitSeriesChange(change, async (before, after) => { calls.push(`${before ? 'u' : 'c'}:${after?.repeatUntil ?? after?.date ?? 'x'}`); return after })
  assert.deepEqual(calls, ['c:2026-11-16', 'u:2026-11-10'])

  const rollback: string[] = []
  await assert.rejects(commitSeriesChange(change, async (before, after) => {
    rollback.push(!before ? 'create' : !after ? 'delete' : after.id === series.id && after.repeatUntil === undefined ? 'restore' : 'update')
    if (before && after && after.repeatUntil === '2026-11-10') throw new Error('offline')
    return after
  }), /offline/)
  assert.deepEqual(rollback, ['create', 'update', 'delete'])
})

test('list helpers summarise and filter recurring rows', () => {
  const ended = { ...series, id: 'old', title: '지난 스터디', repeatUntil: '2026-10-01', date: '2026-09-01' }
  const items = [single, series, ended]
  assert.deepEqual(listRecurring(items, '2026-11-05', 'active').map(row => row.key), ['series'])
  assert.deepEqual(listRecurring(items, '2026-11-05', 'ended').map(row => row.key), ['old'])
  assert.deepEqual(listRecurring(items, '2026-11-05', 'all', '스터디').map(row => row.key), ['old'])
  assert.equal(isEnded(ended, '2026-11-05'), true)
  assert.equal(upcomingOccurrence(series, '2026-11-05'), '2026-11-09')
  assert.equal(repeatSummary(series), '매주 월·수')
  assert.equal(repeatSummary({ ...series, repeat: 'monthly' }), '매월 2일')
  assert.equal(repeatSummary({ ...series, repeatDays: [1, 2, 3, 4, 5] }), '매주 평일')
})

// --- Split series read and edit as one series ---

/** 헬스 split twice: 11/9 moved to 18:00 (single), then from 11/16 on at 06:00. */
function splitSeries() {
  let rows = applySeriesChangeLocally([series], planSeriesPatch(series, '2026-11-09', 'this', { startTime: '18:00', endTime: '19:00', duration: null }))
  const continuation = rows.find(row => row.repeat !== 'none' && row.date === '2026-11-11')!
  rows = applySeriesChangeLocally(rows, planSeriesPatch(continuation, '2026-11-16', 'future', { startTime: '06:00', endTime: '07:00', duration: null }))
  return rows
}

test('split rows carry the original id and group back into one series', () => {
  const rows = splitSeries()
  assert.equal(rows.length, 4)
  assert.ok(rows.filter(row => row.id !== 'series').every(row => row.seriesId === 'series'))
  const [group] = groupSeries([...rows, single])
  assert.equal(groupSeries([...rows, single]).length, 1, 'the unrelated one-off is not a series')
  assert.deepEqual(group.segments.map(row => [row.date, row.repeatUntil ?? null, row.startTime]), [['2026-11-02', '2026-11-08', '09:00'], ['2026-11-11', '2026-11-15', '09:00'], ['2026-11-16', null, '06:00']])
  assert.deepEqual(group.exceptions.map(row => row.date), ['2026-11-09'])
  // 11/11 only resumes the old rule after the single-day change; 11/16 really changes it.
  assert.equal(groupChanges(group), '규칙 변경 1회 · 개별 변경 1건')
  assert.equal(groupChanges(groupSeries([series])[0]), null)
  assert.deepEqual(groupPeriod(group), { start: '2026-11-02', end: null })
  assert.equal(currentSegment(group, '2026-11-10').date, '2026-11-11')
  assert.equal(currentSegment(group, '2026-11-12').date, '2026-11-16', 'a period with nothing left yields to the next')
  assert.equal(groupUpcoming(group, '2026-11-05'), '2026-11-09', 'the single-day change counts as that day')
  assert.deepEqual(listRecurring([...rows, single], '2026-11-05', 'active').map(row => row.key), ['series'])
  assert.equal(segmentAt(group, '2026-11-18').date, '2026-11-16')
})

test('whole-series edit reaches every part; a single-day change keeps its own time', () => {
  const rows = splitSeries()
  const [group] = groupSeries(rows)
  const after = applySeriesChangeLocally(rows, planGroupPatch(group, '2026-11-18', 'all', { title: '아침 운동', startTime: '05:30', endTime: '06:30', duration: null }))
  assert.deepEqual(after.filter(row => row.repeat !== 'none').map(row => [row.title, row.startTime]), [['아침 운동', '05:30'], ['아침 운동', '05:30'], ['아침 운동', '05:30']])
  const exception = after.find(row => row.repeat === 'none')!
  assert.deepEqual([exception.title, exception.startTime], ['아침 운동', '18:00'])
})

test('whole-series end date trims later parts and caps the rest; clearing it reopens the last part', () => {
  const rows = splitSeries()
  const [group] = groupSeries(rows)
  const ended = applySeriesChangeLocally(rows, planGroupPatch(group, '2026-11-04', 'all', { repeatUntil: '2026-11-08' }))
  assert.deepEqual(Object.keys(occurrences(ended)), ['2026-11-02', '2026-11-04'])
  assert.equal(ended.length, 1, 'later parts and the 11/9 change are gone')
  const capped = applySeriesChangeLocally(rows, planGroupPatch(group, '2026-11-04', 'all', { repeatUntil: '2026-11-13' }))
  assert.deepEqual(Object.keys(occurrences(capped)), ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11'])
  const bounded = applySeriesChangeLocally(rows, planGroupPatch(group, '2026-11-04', 'all', { repeatUntil: '2026-11-30' }))
  const [again] = groupSeries(bounded)
  const reopened = applySeriesChangeLocally(bounded, planGroupPatch(again, '2026-11-04', 'all', { repeatUntil: null }))
  assert.equal(groupSeries(reopened)[0].segments.at(-1)!.repeatUntil, null)
})

test('"from this one on" reaches later parts only', () => {
  const rows = splitSeries()
  const [group] = groupSeries(rows)
  const after = applySeriesChangeLocally(rows, planGroupPatch(group, '2026-11-04', 'future', { title: '헬스장', categoryId: 'gym' }))
  const titles = Object.fromEntries(Object.keys(occurrences(after)).map(day => [day, after.find(row => (row.repeat === 'none' ? row.date === day : repeatsOn(row, day)))!.title]))
  assert.equal(titles['2026-11-02'], '운동')
  for (const day of ['2026-11-04', '2026-11-09', '2026-11-11', '2026-11-16', '2026-11-30']) assert.equal(titles[day], '헬스장', day)
  assert.equal(after.find(row => row.repeat === 'none')!.categoryId, 'gym')
})

test('deleting a split series: all removes every part, future cuts and drops later parts', () => {
  const rows = splitSeries()
  const [group] = groupSeries(rows)
  assert.equal(applySeriesChangeLocally(rows, planGroupDelete(group, '2026-11-18', 'all')).length, 0)
  const future = applySeriesChangeLocally(rows, planGroupDelete(group, '2026-11-04', 'future'))
  assert.deepEqual(Object.keys(occurrences(future)), ['2026-11-02'])
  assert.equal(future.length, 1)
})

test('preview over a split series shows the single-day change as that day’s occurrence', () => {
  const rows = splitSeries()
  const [group] = groupSeries(rows)
  const preview = previewSeriesChange(rows, planGroupPatch(group, '2026-11-04', 'all', { title: '아침 운동' }), '2026-11-04', 3)
  assert.deepEqual(preview.map(row => [row.date, row.before?.startTime, row.after?.title, row.status]), [
    ['2026-11-04', '09:00', '아침 운동', 'changed'], ['2026-11-09', '18:00', '아침 운동', 'changed'], ['2026-11-11', '09:00', '아침 운동', 'changed'],
  ])
})

test('an unsplit series plans exactly as before', () => {
  const [group] = groupSeries([series])
  const patch = { startTime: '07:00', endTime: '08:00', duration: null }
  for (const scope of ['this', 'future', 'all'] as const) {
    const plan = planGroupPatch(group, '2026-11-11', scope, patch)
    assert.equal(plan.length, 1)
    assert.deepEqual(Object.keys(occurrences(applySeriesChangeLocally([series], plan))), Object.keys(occurrences(applySeriesChangeLocally([series], planSeriesPatch(series, '2026-11-11', scope, patch)))))
  }
})

test('a failed delete keeps earlier steps instead of recreating rows', async () => {
  const rows = splitSeries()
  const [group] = groupSeries(rows)
  const calls: string[] = []
  await assert.rejects(commitSeriesChange(planGroupDelete(group, '2026-11-04', 'future'), async (before, after) => {
    calls.push(!before ? 'create' : !after ? 'delete' : 'update')
    if (!after && calls.filter(call => call === 'delete').length === 2) throw new Error('offline')
    return after
  }), /offline/)
  assert.deepEqual(calls, ['update', 'delete', 'delete'])
})
