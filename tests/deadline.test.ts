import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveScheduleAnalysis } from '../packages/parse/src/resolve.ts'
import { parseScheduleText } from '../packages/parse/src/parse.ts'
import { validateScheduleAnalysis } from '../packages/types/src/aiSchema.ts'
import { deadlineStatus, deadlineLabel } from '../src/utils/deadline.ts'
import { reviewedWorkInput } from '../src/features/ai/review.ts'
import { createScheduleRepository, mapScheduleRow } from '../packages/api/src/scheduleRepository.ts'
import { scheduleTasks } from '../packages/scheduling/src/engine.ts'
import { schedulingSettings } from '../packages/scheduling/src/settings.ts'
import { validatePlannerEdits } from '../packages/scheduling/src/approval.ts'
import { recommendUnits, unitsFromPlan } from '../packages/scheduling/src/replanning.ts'
import type { AnalysisItem } from '../packages/types/src/ai.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/api/src/database.generated.ts'

const today = new Date(2026, 9, 29)
const context = { today }
for (const [text, date, time, title] of [
  ['금요일까지 도훈이가 데모영상 주는 거 확인', '2026-10-30', null, '도훈이 데모영상 전달 확인'],
  ['내일 오후 3시까지 발표자료 완성', '2026-10-30', '15:00', '발표자료 완성'],
  ['11월 2일까지 IRIS 마무리', '2026-11-02', null, 'IRIS 마무리'],
  ['내일 전까지 자료 제출', '2026-10-30', null, '자료 제출'],
  ['제출 기한: 11월 2일 자료', '2026-11-02', null, '자료'],
  ['자료 11월 2일 마감', '2026-11-02', null, '자료'],
  ['2026-11-02 18:30까지 자료 제출', '2026-11-02', '18:30', '자료 제출'],
] as const) test(`deadline: ${text}`, async () => {
  const result = await resolveScheduleAnalysis(text, context)
  const item = result.items[0]
  assert.equal(result.route, 'parser')
  assert.equal(item.type, 'task')
  assert.equal(item.draft.dueDate, date)
  assert.equal(item.draft.dueTime, time)
  assert.equal(item.draft.date, null)
  assert.equal(item.draft.startTime, null)
  assert.equal(item.draft.endTime, null)
  assert.equal(item.draft.title, title)
})

test('event particles and ranges keep scheduled times without deadlines', async () => {
  for (const text of ['금요일 2시에 발표', '내일 오후 3시부터 5시까지 회의']) {
    const item = (await resolveScheduleAnalysis(text, context)).items[0]
    assert.equal(item.type, 'event')
    assert.ok(item.draft.startTime)
    assert.equal(item.draft.dueDate, null)
    assert.equal(item.draft.dueTime, null)
  }
})

test('ambiguous and invalid deadlines remain unresolved and require review', async () => {
  for (const text of ['다음 주까지 자료 완성', '2월 30일까지 자료 완성', '내일 3시까지 자료 완성', '오후 3시까지 자료 완성']) {
    const item = (await resolveScheduleAnalysis(text, context)).items[0]
    assert.equal(item.draft.dueTime, null)
    assert.equal(item.draft.startTime, null)
    assert.ok(item.uncertainties.some(entry => entry.field === 'dueDate' || entry.field === 'dueTime'))
    assert.throws(() => reviewedWorkInput(item, { ...item.draft, date: '2026-10-29' }, false, []), /마감/)
    assert.doesNotThrow(() => reviewedWorkInput(item, { ...item.draft, date: '2026-10-29', dueDate: null, dueTime: null }, false, [], 'none', [], false, true))
  }
})

test('compound deadline/event goes through structured AI and remains two items', async () => {
  const text = '목요일까지 자료 완성하고 금요일 2시에 발표'
  const task = (await resolveScheduleAnalysis('목요일까지 자료 완성', context)).items[0]
  const event = (await resolveScheduleAnalysis('금요일 2시에 발표', context)).items[0]
  // The service supplies the two clauses; the UI retains both editable drafts.
  const items = [task, event].map((item, i) => ({ ...item, id: `item-${i}`, source: 'ai' as const }))
  let calls = 0
  const result = await resolveScheduleAnalysis(text, context, { provider: { async analyze() {
    calls++
    return { version: 1, route: 'ai', items, relations: [], warnings: [] }
  } } })
  assert.equal(calls, 1)
  assert.equal(result.items.length, 2)
  assert.equal(result.items[0].draft.dueDate, '2026-10-29')
  assert.equal(result.items[1].draft.dueDate, null)
  assert.equal(result.items[1].draft.date, '2026-10-30')
})

test('schema rejects invented clocks, orphan deadline times and event deadlines', async () => {
  const text = '내일 오후 3시까지 자료 완성'
  const analysis = await resolveScheduleAnalysis(text, context)
  const check = (change: (item: AnalysisItem) => void) => {
    const value = structuredClone(analysis); change(value.items[0])
    assert.throws(() => validateScheduleAnalysis(value, { text }))
  }
  check(item => { item.draft.dueTime = '25:00' })
  check(item => { item.evidence.dueTime = null })
  check(item => { item.draft.dueDate = null; item.evidence.dueDate = null })
  check(item => { item.type = 'event' })
  const dateOnly = await resolveScheduleAnalysis('내일까지 자료 완성', context)
  dateOnly.items[0].draft.dueTime = '23:59'; dateOnly.items[0].evidence.dueTime = '내일까지'
  assert.throws(() => validateScheduleAnalysis(dateOnly, { text: '내일까지 자료 완성' }))
})

test('Seoul day boundaries, exact deadlines, upcoming and completed status', () => {
  const item = { kind: 'task', status: 'todo', dueDate: '2026-10-29', dueTime: null }
  assert.equal(deadlineStatus(item, new Date('2026-10-29T14:59:59Z')), 'today')
  assert.equal(deadlineStatus(item, new Date('2026-10-29T15:00:00Z')), 'overdue')
  assert.equal(deadlineStatus({ ...item, dueTime: '15:00' }, new Date('2026-10-29T06:00:01Z')), 'overdue')
  assert.equal(deadlineStatus({ ...item, status: 'done' }, new Date('2026-10-30T00:00:00Z')), null)
  assert.equal(deadlineStatus({ ...item, dueDate: '2026-11-01' }, new Date('2026-10-29T00:00:00Z')), 'soon')
  assert.equal(deadlineStatus({ ...item, dueDate: null }), null)
  assert.equal(deadlineLabel({ ...item, dueTime: '15:00' }), '마감 2026-10-29 15:00')
})

test('repository saves, edits, clears and loads deadlines; old rows still load', async () => {
  const row = { id: 'id', user_id: 'user', calendar_id: 'calendar', title: '자료', date: '2026-10-29', kind: 'task', priority: 'medium', status: 'todo', created_at: 'now', updated_at: 'now' }
  assert.equal(mapScheduleRow(row).dueTime, null)
  let columns: Record<string, unknown> = {}
  const query = { insert(value: Record<string, unknown>) { columns = value; return query }, update(value: Record<string, unknown>) { columns = value; return query }, select() { return query }, eq() { return query }, async single() { return { data: { ...row, ...columns }, error: null } } }
  const client = { from() { return query } } as unknown as SupabaseClient<Database>
  const repository = createScheduleRepository(client)
  const draft = { kind: 'task' as const, title: '자료', date: '2026-10-29', dueDate: '2026-11-02', dueTime: '15:00' }
  assert.equal((await repository.create('user', draft)).dueTime, '15:00')
  assert.equal((await repository.update('id', { ...draft, dueTime: null })).dueTime, null)
  const cleared = await repository.update('id', { ...draft, dueDate: null, dueTime: null })
  assert.equal(cleared.dueDate, null); assert.equal(cleared.dueTime, null)
  await assert.rejects(() => repository.create('user', { ...draft, dueTime: '25:00' }))
})

test('planner stops at deadline clock and rejects edits beyond it', async () => {
  const source = (await resolveScheduleAnalysis('오늘 오전 10시까지 자료 완성', context)).items[0]
  const settings = schedulingSettings({ startDate: '2026-10-29', endDate: '2026-10-29', dayStartTime: '09:00', dayEndTime: '18:00', breakMinutes: 0, now: '2026-10-29T00:00:00Z' })
  const result = scheduleTasks([{ id: 't', title: '자료', sourceItem: source, durationMinutes: 120, durationIsEstimate: false, priority: 'medium', priorityIsEstimate: false, deadline: '2026-10-29', deadlineIsEstimate: false, occurrences: 1, dependencies: [], splittable: true, preferredChunkMinutes: null, confirmationNeeded: [] }], [], settings)
  assert.equal(result.tasks[0].scheduledMinutes, 60)
  assert.equal(result.blocks[0].endAt.slice(11, 16), '10:00')
  const units = unitsFromPlan({ analysis: {} as never, result })
  assert.ok(units.every(unit => unit.deadlineTime === '10:00'))
  const replanned = recommendUnits(units, [], settings)
  assert.ok(replanned.result.blocks.every(block => block.endAt.slice(11, 16) <= '10:00'))
  assert.ok(replanned.result.tasks.every(outcome => outcome.task.deadlineTime === '10:00'))
  const block = result.blocks[0]
  assert.throws(() => validatePlannerEdits({ analysis: {} as never, result }, [{ id: block.id, title: block.title, date: '2026-10-29', startTime: '10:00', endTime: '11:00', durationMinutes: 60, priority: 'medium', included: true, confirmed: true }], [], settings.now), /마감/)
})

test('legacy parser keeps its date fallback but never duplicates deadline clocks', () => {
  const parsed = parseScheduleText('내일 오후 3시까지 자료 완성', context)
  assert.equal(parsed.draft.dueTime, '15:00')
  assert.equal(parsed.draft.startTime, null)
})
