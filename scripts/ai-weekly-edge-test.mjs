import assert from 'node:assert/strict'
import { withPlannerTestUser } from './planner-test-user.mjs'
import { validateScheduleAnalysis } from '../packages/types/src/aiSchema.ts'
const text = '화요일 9시부터 13시, 목/금 9시부터 6시 주마다 근로있는데 일정 추가해줘.'
await withPlannerTestUser(async ({ client }) => {
  const before = await client.from('schedules').select('id,updated_at').order('id')
  assert.equal(before.error, null)
  const { data, error } = await client.functions.invoke('parse-schedule', { body: { text, timezone: 'Asia/Seoul', format: 'analysis-v1' } })
  if (error) {
    const body = await error.context?.clone?.().json().catch(() => null)
    throw new Error(body?.error?.code ?? error.name)
  }
  const result = validateScheduleAnalysis(data, { text })
  assert.equal(result.items.length, 3)
  assert.deepEqual(result.items.map(item => item.draft.endTime), ['13:00', '18:00', '18:00'])
  assert.ok(result.items.slice(1).every(item => item.uncertainties.some(entry => /추정/.test(entry.reason))))
  assert.deepEqual(result.items.map(item => new Date(item.draft.date + 'T12:00:00Z').getUTCDay()), [2, 4, 5])
  const single = await client.functions.invoke('parse-schedule', { body: { text: '매주 월요일 오전 9시부터 오후 6시 근로 추가해줘', timezone: 'Asia/Seoul', format: 'analysis-v1' } })
  assert.equal(single.error,null)
  assert.equal(single.data.route,'parser')
  assert.equal(single.data.items.length,1)
  assert.equal(new Date(single.data.items[0].draft.date+'T12:00:00Z').getUTCDay(),1)
  const after = await client.from('schedules').select('id,updated_at').order('id')
  assert.equal(after.error, null)
  assert.deepEqual(after.data, before.data)
  console.log(JSON.stringify({ authenticatedEdge: 'passed', items: 3, weekdays: ['Tuesday', 'Thursday', 'Friday'], estimatedEndTimesRequireConfirmation: true, scheduleWrites: 0 }))
})
