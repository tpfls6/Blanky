import assert from 'node:assert/strict'
import test from 'node:test'
import { createScheduleRepository } from '../packages/api/src/scheduleRepository.ts'
import { loadExistingPlanningTasks, recommendExistingTasks, existingTaskUpdates } from '../src/features/ai/existingTaskPlanning.ts'
import { schedulingSettings } from '../packages/scheduling/src/settings.ts'
import { editsFromRecommendation } from '../packages/scheduling/src/approval.ts'
import type { WorkItem } from '../src/types/work.ts'

const id = '3a7a7df6-a189-4a5c-b913-be2803be06c0'
const task: WorkItem = { id: 'task-exam', title: '시험 준비', kind: 'task', date: '2026-10-29', startTime: null, endTime: null, duration: 30, status: 'todo', priority: 'medium', categoryId: null, dueDate: null, dueTime: null, endDate: null, allDay: false, repeat: 'none', description: '' }

test('completion sends only status/source, works without due_time and preserves dates and recurrence', async () => {
  const row = { id, user_id: 'user', calendar_id: 'calendar', title: '시험 준비', date: '2026-10-29', kind: 'task', status: 'todo', priority: 'medium', due_date: '2026-10-30', repeat_rule: 'weekly', repeat_days: [4], created_at: 'now', updated_at: 'now' }
  let payload: Record<string, unknown> = {}
  const query = { update(value: Record<string, unknown>) { payload = value; assert.equal('due_time' in value, false); return query }, eq(column: string, value: string) { assert.equal(column, 'id'); assert.equal(value, id); return query }, select() { return query }, async single() { return { data: { ...row, ...payload }, error: null } } }
  const repository = createScheduleRepository({ from: () => query } as never)
  const saved = await repository.updateStatus(id, 'done')
  assert.deepEqual(payload, { status: 'done', change_source: 'manual' })
  assert.equal(saved.status, 'done')
  assert.equal(saved.dueDate, '2026-10-30')
  assert.equal(saved.repeat, 'weekly')
  assert.deepEqual(saved.repeatDays, [4])
  assert.equal((await repository.updateStatus(id, 'todo')).status, 'todo')
})

test('invalid sample IDs are rejected before any UUID REST query', async () => {
  let calls = 0
  const repository = createScheduleRepository({ from() { calls++; throw new Error('must not query') } } as never)
  await assert.rejects(repository.listByIds(['task-exam']), { code: 'INVALID_INPUT' })
  assert.equal(calls, 0)
})

test('connected-mode planning keeps local task-exam out of remote reads and applies to original identity', async () => {
  let reads = 0
  const rows = await loadExistingPlanningTasks([task], ['task-exam'], () => false, async () => { reads++; return [] })
  assert.equal(reads, 0)
  const now = '2026-10-29T00:00:00Z'
  const settings = schedulingSettings({ startDate: '2026-10-29', endDate: '2026-10-30', now, dayStartTime: '09:00', dayEndTime: '18:00' })
  const plan = recommendExistingTasks(rows, ['task-exam'], [], settings)
  assert.equal(plan.result.blocks.length, 1)
  const edits = editsFromRecommendation(plan).map(edit => ({ ...edit, confirmed: true }))
  const [update] = existingTaskUpdates(plan, edits, rows, [], now)
  assert.equal(update.before.id, 'task-exam')
  assert.equal(update.after.id, 'task-exam')
  assert.ok(update.after.startTime)
})

test('remote tasks refresh status and deleted rows never fall back to stale local snapshots', async () => {
  const remote = { ...task, id }
  const rows = await loadExistingPlanningTasks([task, remote], [task.id, id], value => value === id, async ids => {
    assert.deepEqual(ids, [id])
    return [{ ...remote, status: 'done' }]
  })
  assert.equal(rows.find(row => row.id === id)?.status, 'done')
  const deleted = await loadExistingPlanningTasks([remote], [id], () => true, async () => [])
  assert.deepEqual(deleted, [])
})
