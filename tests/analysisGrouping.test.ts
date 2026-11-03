import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveScheduleAnalysis } from '../packages/parse/src/resolve.ts'
import { normalizeAnalysis } from '../packages/parse/src/grouping.ts'
import { reviewedWorkInput } from '../src/features/ai/review.ts'
import { createScheduleRepository } from '../packages/api/src/scheduleRepository.ts'

const context = { today: new Date(2026, 9, 29) }
for (const text of [
  '금요일까지 도훈이 데모 영상 넘긴 거 확인하고 피피티 만들기',
  '내일까지 자료 조사하고 발표자료 만들기',
  '금요일까지 PPT 만들고 발표 연습하기',
]) test(`one deadline goal: ${text}`, async () => {
  const result = await resolveScheduleAnalysis(text, context)
  assert.equal(result.items.length, 1)
  const item = result.items[0]
  assert.equal(item.type, 'task')
  assert.equal(item.draft.dueDate, '2026-10-30')
  assert.equal(item.draft.dueTime ?? null, null)
  assert.deepEqual(item.uncertainties, [])
  const input = reviewedWorkInput(item, item.draft, false, [])
  assert.equal(input.dueDate, '2026-10-30')
  assert.equal(input.repeat, 'none')
  assert.ok(input.description)
  if (text.includes('도훈')) assert.equal(item.draft.title, '데모영상 확인 및 PPT 제작')
})

for (const [text, kinds] of [
  ['내일 3시 회의하고 금요일까지 보고서 제출', ['event', 'task']],
  ['월요일 운동하고 화요일 병원 가기', ['event', 'event']],
  ['내일 장보기, 금요일 보고서 제출, 토요일 친구 만나기', ['event', 'task', 'event']],
] as const) test(`independent date clauses: ${text}`, async () => {
  const result = await resolveScheduleAnalysis(text, context)
  assert.deepEqual(result.items.map(item => item.type), kinds)
  assert.equal(result.items.length, kinds.length)
})

test('duplicate rule/AI meaning collapses with relation remapping but distinct dates survive', async () => {
  const result = await resolveScheduleAnalysis('금요일까지 PPT 만들고 발표 연습하기', context)
  const item = result.items[0]
  result.items.push({ ...structuredClone(item), id: 'ai-copy', source: 'ai' })
  result.relations.push({ fromId: item.id, toId: 'ai-copy', type: 'before', reason: '중복' })
  assert.equal(normalizeAnalysis(result).items.length, 1)
  assert.deepEqual(normalizeAnalysis(result).relations, [])
  result.items[1].draft.dueDate = '2026-11-06'
  assert.equal(normalizeAnalysis(result).items.length, 2)
  result.items[0].draft.title = 'PPT 제작'
  result.items[1].draft.title = '피피티 만들기'
  result.items[1].draft.dueDate = result.items[0].draft.dueDate
  assert.equal(normalizeAnalysis(result).items.length, 1)
})

test('batch creation validates every draft before a single atomic insert and propagates failures', async () => {
  let calls = 0
  let failed = false
  const client = { from() { return { insert(rows: Record<string, unknown>[]) {
    calls++
    return { async select() { return failed ? { data: null, error: { message: 'rejected' } } : { data: rows.map((row, index) => ({ ...row, id: String(index), calendar_id: 'calendar', created_at: 'now', updated_at: 'now' })), error: null } }
  } } } } }
  const repository = createScheduleRepository(client as never)
  const drafts = [{ title: 'first', date: '2026-10-30' }, { title: 'second', date: '2026-10-31' }]
  assert.equal((await repository.createMany('user', drafts)).length, 2)
  assert.equal(calls, 1)
  await assert.rejects(repository.createMany('user', [...drafts, { title: 'bad', date: '2026-02-30' }]))
  assert.equal(calls, 1)
  failed = true
  await assert.rejects(repository.createMany('user', drafts))
  assert.equal(calls, 2)
})

test('explicit dated comma lists stay deterministic when an AI provider is configured', async () => {
  const result = await resolveScheduleAnalysis('내일 장보기, 금요일 보고서 제출, 토요일 친구 만나기', context, { provider: { async analyze() { throw new Error('unneeded AI call') } } })
  assert.equal(result.items.length, 3)
  assert.equal(result.route, 'parser')
  assert.equal(new Set(result.items.map(item => item.id)).size, 3)
})
