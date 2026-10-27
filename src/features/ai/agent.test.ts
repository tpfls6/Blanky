import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkItem } from '../../types/work.ts'
import { describePlan, failedActionIds, liveActions, planConflicts, planDedupe, planMoveIncomplete } from './agent.ts'

function item(id: string, title: string, extra: Partial<WorkItem> = {}): WorkItem {
  return {
    id, title, kind: 'event', date: '2026-10-28', startTime: '15:00', endTime: '16:00', duration: 60,
    description: '', categoryId: null, priority: 'medium', status: 'todo', dueDate: null, endDate: null,
    allDay: false, repeat: 'none', ...extra,
  }
}

test('dedupe keeps one work and one class and is idle on a second pass', () => {
  const items = [item('w1', '근로'), item('w2', '근로'), item('c1', '수업'), item('c2', '수업')]
  const plan = planDedupe(items)
  assert.equal(plan.actions.length, 2)
  assert.equal(plan.mode, 'preview')
  assert.deepEqual(new Set(plan.kept.map(row => row.title)), new Set(['근로', '수업']))
  assert.match(describePlan(plan), /삭제 후보 2건/)
  const leftover = items.filter(row => !plan.actions.some(action => action.op === 'delete' && action.item.id === row.id))
  assert.deepEqual(planDedupe(leftover).actions, [])
  assert.deepEqual(planConflicts(items, '2026-10-28', '2026-10-28').actions, [])
  assert.equal(planConflicts(items, '2026-10-28', '2026-10-28').skipped.length, 4)
})

test('google copies and large batches stay in preview, unfinished tasks can move', () => {
  const plan = planDedupe([item('local', '근로'), item('sync', '근로', { changeSource: 'calendar_sync' })])
  assert.equal(plan.actions.length, 1)
  assert.equal(plan.actions[0].item.id, 'local')
  const edited = planDedupe([item('g1', '근로', { changeSource: 'ai_chat', calendarType: 'external' }), item('g2', '근로', { changeSource: 'ai_chat', calendarType: 'external' })])
  assert.equal(edited.actions.length, 0)
  assert.ok(edited.skipped.length)
  const many = Array.from({ length: 6 }, (_, index) => item('d' + index, '근로'))
  assert.equal(planDedupe(many).mode, 'preview')
  const moved = planMoveIncomplete([item('t1', '과제', { kind: 'task', date: '2026-10-27', status: 'todo' })], '2026-10-27', '2026-10-29')
  assert.equal(moved.actions[0].op, 'update')
  if (moved.actions[0].op === 'update') assert.equal(moved.actions[0].patch.date, '2026-10-29')
  const copies = planDedupe([item('w1', '근로'), item('w2', '근로')])
  assert.deepEqual(liveActions(copies, [item('w1', '근로')]), [])
  assert.deepEqual(failedActionIds(copies.actions.map(action => action.item.id), copies.actions), [])
})

test('dedupe keeps one copy, ignores other titles and times, and stays inside the asked range', () => {
  const pair = planDedupe([item('a', '근로'), item('b', '근로')])
  assert.equal(pair.actions.length, 1)
  assert.equal(planDedupe([item('a', '근로'), item('b', '근로'), item('c', '근로')]).actions.length, 2)
  const shifted = planDedupe([item('a', '근로'), item('b', '근로', { startTime: '17:00', endTime: '18:00' })])
  assert.equal(shifted.actions.length, 0)
  const overlap = planDedupe([item('a', '근로'), item('b', '수업')])
  assert.equal(overlap.actions.length, 0)
  const before = item('old-1', '수업', { date: '2026-10-23' })
  const beforeCopy = item('old-2', '수업', { date: '2026-10-23' })
  const after = item('new-1', '수업', { date: '2026-10-30' })
  const afterCopy = item('new-2', '수업', { date: '2026-10-30' })
  const scoped = planDedupe([before, beforeCopy, after, afterCopy], { start: '2026-10-29' })
  assert.deepEqual(scoped.actions.map(action => action.item.id).sort(), ['new-2'])
  assert.ok(scoped.kept.some(row => row.id === 'new-1' || row.id === 'new-2'))
  assert.equal(planDedupe([before, beforeCopy, after, afterCopy], { start: '2026-10-29' }).actions.some(action => action.item.date === '2026-10-23'), false)
})
