import assert from 'node:assert/strict'
import test from 'node:test'
import { routeInput, PlannerRequiredError } from './intentRouter.ts'
import { resolveParse, resolveScheduleAnalysis } from './resolve.ts'
import { parseScheduleText } from './parse.ts'
import type { AIProvider } from './provider.ts'
import { conversationIntent } from '../../../src/features/ai/conversation.ts'
import { parseScheduleFromText } from '../../api/src/ai.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../api/src/database.generated.ts'

const context = { today: new Date(2026, 9, 13) }

function spyProvider(fail = false) {
  let calls = 0
  const provider: AIProvider = {
    async parseSchedule({ text }) {
      calls++
      if (fail) throw new Error('offline')
      return parseScheduleText(text, context)
    },
    async classifyRecord() { return null },
    async extractFields() { return null },
  }
  return { provider, calls: () => calls }
}

test('simple schedules and ranges reuse parser without calling AI', async () => {
  const spy = spyProvider()
  for (const text of ['내일 오후 3시 회의', '금요일까지 보고서 작성', '오늘 오후 3시부터 5시까지 회의']) {
    const result = await resolveParse(text, context, { provider: spy.provider })
    assert.equal(result.source, 'rule')
    assert.deepEqual(result, parseScheduleText(text, context))
  }
  assert.equal(spy.calls(), 0)
})

test('complex sentences override even high rule confidence', async () => {
  const spy = spyProvider()
  for (const text of ['내일 오후 3시 회의하고 5시 운동', '오늘 오후 3시 회의 그리고 내일 병원', '회의가 끝나면 운동 추가해줘']) {
    assert.equal(routeInput(text).route, 'ai')
    assert.equal((await resolveParse(text, context, { provider: spy.provider })).source, 'ai')
  }
  assert.equal(spy.calls(), 3)
})

test('planning has priority and never calls the schedule provider or creates a conversation item', async () => {
  const spy = spyProvider()
  for (const text of ['이번 주 공부 계획 세워줘', '회의하고 운동할 시간 찾아줘', '시험 준비 계획을 짜줘', '오늘 일정 너무 많은데 정리해줘']) {
    assert.equal(routeInput(text).route, 'planner')
    await assert.rejects(resolveParse(text, context, { provider: spy.provider }), PlannerRequiredError)
    assert.equal(conversationIntent(text, [], null, context.today, []).type, 'reply')
  }
  assert.equal(spy.calls(), 0)
})

test('low confidence still uses AI; unavailable provider preserves existing fallback', async () => {
  const spy = spyProvider(true)
  const text = '컴활 문제 20개'
  assert.equal(routeInput(text, parseScheduleText(text, context)).route, 'ai')
  assert.deepEqual(await resolveParse(text, context, { provider: spy.provider }), parseScheduleText(text, context))
  assert.equal(spy.calls(), 1)
  assert.deepEqual(await resolveParse(text, context), parseScheduleText(text, context))
  assert.throws(() => routeInput('  '))
})

test('API rejects Planner before invoking Edge Function and preserves schedule response contract', async () => {
  let calls = 0
  const client = { functions: { async invoke(_name: string, { body }: { body: { text: string } }) {
    calls++
    return { data: await resolveScheduleAnalysis(body.text, context), error: null }
  } } } as unknown as SupabaseClient<Database>
  await assert.rejects(parseScheduleFromText(client, { text: '공부 계획 세워줘', timezone: 'Asia/Seoul' }), { code: 'PLANNER_REQUIRED' })
  assert.equal(calls, 0)
  const result = await parseScheduleFromText(client, { text: '내일 오후 3시 회의', timezone: 'Asia/Seoul' })
  assert.equal(result.draft.startTime, '15:00')
  assert.equal(calls, 1)
})
