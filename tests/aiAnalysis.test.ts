import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/api/src/database.generated.ts'
import type { AnalysisItem, ScheduleAnalysis } from '../packages/types/src/ai.ts'
import { AnalysisError, validateScheduleAnalysis } from '../packages/types/src/aiSchema.ts'
import { createOpenAIAnalysisProvider } from '../packages/parse/src/analysisProvider.ts'
import { resolveScheduleAnalysis } from '../packages/parse/src/resolve.ts'
import { createScheduleHandler } from '../supabase/functions/parse-schedule/handler.ts'
import { analyzeScheduleFromText, parseScheduleFromText } from '../packages/api/src/ai.ts'
import { reviewedWorkInput } from '../src/features/ai/review.ts'
import { conversationIntent } from '../src/features/ai/conversation.ts'
import { readSpokenTimeRange } from '../packages/parse/src/timeRange.ts'
import { normalizeRepeatDays, repeatsOn } from '../packages/types/src/recurrence.ts'

const text = '내일 오후 3시 회의하고 금요일까지 보고서 제출하기'
const context = { today: new Date(2026, 9, 13), categories: [{ id: 'work', name: '업무', parentId: null }], rules: [] }
function fixture(): ScheduleAnalysis {
  const base: AnalysisItem = { id: 'meeting', type: 'event', source: 'ai', confidence: 0.95,
    draft: { title: '회의', date: '2026-10-14', startTime: '15:00', endTime: null, dueDate: null, endDate: null, categoryId: 'work' },
    evidence: { date: '내일', startTime: '오후 3시', endTime: null, dueDate: null, endDate: null }, categoryReason: '업무 회의', uncertainties: [] }
  return { version: 1, route: 'ai', items: [base, { ...structuredClone(base), id: 'report', type: 'task',
    draft: { ...base.draft, title: '보고서 제출', date: null, startTime: null, dueDate: '2026-10-16' },
    evidence: { ...base.evidence, date: null, startTime: null, dueDate: '금요일까지' },
    uncertainties: [{ field: 'date', reason: '작업할 날짜가 없어요.' }] }], relations: [], warnings: [] }
}
function modelResponse(value: unknown = fixture()) {
  return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })
}
function clientReturning(data: unknown) {
  return { functions: { async invoke() { return { data, error: null } } } } as unknown as SupabaseClient<Database>
}

test('abbreviated weekday evidence stays verbatim and weekday dates use the existing parser', async () => {
  const input = '화요일 9시부터 13시, 목/금 9시부터 6시 주마다 근로있는데 일정 추가해줘.'
  const result = fixture()
  result.items = ['화요일', '목', '금'].map((evidence, index) => ({
    ...structuredClone(result.items[0]), id: `work${index}`, draft: { ...result.items[0].draft, date: '2026-10-21', startTime: '09:00', endTime: null, categoryId: null },
    evidence: { date: evidence, startTime: '9시', endTime: null, dueDate: null, endDate: null },
    uncertainties: [{ field: 'endTime', reason: '오후 6시인지 확인해 주세요.' }],
  }))
  const provider = createOpenAIAnalysisProvider({ key: 'mock', fetch: async () => modelResponse(result) })
  const actual = await provider.analyze({ text: input, today: '2026-10-15', timezone: 'Asia/Seoul', categories: [] })
  assert.deepEqual(actual.items.map(item => item.draft.date), ['2026-10-20', '2026-10-15', '2026-10-16'])
  assert.equal(actual.items[1].draft.endTime, null)
  result.items[1].evidence.date = '목요일'
  await assert.rejects(() => provider.analyze({ text: input, today: '2026-10-15', timezone: 'Asia/Seoul', categories: [] }), { code: 'AI_RESPONSE_INVALID' })
})

test('review preserves explicitly confirmed weekly recurrence', () => {
  const item = fixture().items[0]
  assert.equal(reviewedWorkInput(item, item.draft, false, ['work'], 'weekly').repeat, 'weekly')
  assert.equal(reviewedWorkInput(item, item.draft, false, ['work']).repeat, 'none')
})

test('invalid AI weekday-list output recovers all clauses and requires confirmation of estimated daytime endings', async () => {
  const input = '화요일 9시부터 13시, 목/금 9시부터 6시 주마다 근로있는데 일정 추가해줘.'
  let calls = 0
  const provider = { analyze: async () => { calls++; throw new AnalysisError() } }
  for (const text of [input, input.replace(' 추가해줘.', '')]) {
    const result = await resolveScheduleAnalysis(text, { today: new Date(2026, 9, 15) }, { provider })
    assert.equal(result.items.length, 3)
    assert.deepEqual(result.items.map(item => item.draft.date), ['2026-10-20', '2026-10-15', '2026-10-16'])
    assert.deepEqual(result.items.map(item => item.draft.endTime), ['13:00', '18:00', '18:00'])
    assert.throws(() => reviewedWorkInput(result.items[1], result.items[1].draft, false, [], 'weekly'), { code: 'TIME_CONFIRMATION_REQUIRED' })
    assert.equal(reviewedWorkInput(result.items[1], result.items[1].draft, false, [], 'weekly', [4,5], true).endTime, '18:00')
    assert.ok(result.items.every(item => item.source === 'rule'))
  }
  assert.equal(calls, 2)
  await assert.rejects(() => resolveScheduleAnalysis(input, { today: new Date(2026, 9, 15) }, { provider: { analyze: async () => { throw new AnalysisError('AI_UNAVAILABLE') } } }), { code: 'AI_UNAVAILABLE' })
})

test('spoken ranges calculate 24-hour, meridiem, minutes and visible shorthand estimates', () => {
  for (const [input, start, end, duration, estimated] of [
    ['9시부터 13시', '09:00', '13:00', 240, false],
    ['9시부터 6시', '09:00', '18:00', 540, true],
    ['오전 9시부터 오후 6시까지', '09:00', '18:00', 540, false],
    ['오후 3시부터 5시까지', '15:00', '17:00', 120, true],
    ['09:30~18:00', '09:30', '18:00', 510, false],
    ['오전 9시 반부터 오후 1시 15분까지', '09:30', '13:15', 225, false],
  ] as const) {
    const result = readSpokenTimeRange(input)!
    assert.deepEqual([result.startTime, result.endTime, result.durationMinutes, result.estimated], [start,end,duration,estimated])
  }
  assert.equal(readSpokenTimeRange('25시부터 27시'), null)
  assert.equal(readSpokenTimeRange('09:99~18:00'), null)
  assert.equal(readSpokenTimeRange('오후 10시부터 오전 2시')?.endTime, null)
})

test('weekly weekdays preserve legacy anchors, validate selections and honor boundaries', () => {
  const row = { date: '2026-10-15', repeat: 'weekly', repeatDays: [1,4,7] }
  assert.equal(repeatsOn(row,'2026-10-12'),false)
  assert.equal(repeatsOn(row,'2026-10-18'),true)
  assert.equal(repeatsOn(row,'2026-10-19'),true)
  assert.equal(repeatsOn(row,'2026-10-20'),false)
  assert.equal(repeatsOn({date:row.date,repeat:'weekly'},'2026-10-22'),true)
  assert.equal(repeatsOn({date:row.date,repeat:'none'},'2026-10-22'),false)
  assert.deepEqual(normalizeRepeatDays([7,1]),[1,7])
  assert.throws(()=>normalizeRepeatDays([8]))
  assert.throws(()=>normalizeRepeatDays([1,1]))
})

test('single explicit weekly range supports prefix notation and stays in rule preview', async () => {
  const result = await resolveScheduleAnalysis('매주 월요일 오전 9시부터 오후 6시 근로 추가해줘', { today: new Date(2026,9,15) })
  assert.equal(result.route,'parser')
  assert.equal(result.items[0].draft.date,'2026-10-19')
  assert.equal(result.items[0].draft.endTime,'18:00')
  assert.equal(result.items[0].draft.title,'근로')
  assert.match(result.items[0].id,/^weekly-/)
})

test('simple dates, deadlines, time ranges never invoke the real transport', async () => {
  let calls = 0
  const provider = createOpenAIAnalysisProvider({ key: 'mock', fetch: async () => { calls++; return modelResponse() } })
  for (const input of ['내일 오후 3시 회의', '금요일까지 보고서 작성', '오늘 오후 3시부터 5시까지 회의']) {
    const result = await resolveScheduleAnalysis(input, context, { provider })
    assert.equal(result.route, 'parser')
    assert.equal(result.items.length, 1)
  }
  assert.equal(calls, 0)
})

test('complex input uses OpenAI structured output and separates events/tasks/deadlines', async () => {
  let calls = 0
  const provider = createOpenAIAnalysisProvider({ key: 'mock-secret', fetch: async (url, init) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer mock-secret')
    const request = JSON.parse(String(init?.body))
    assert.equal(request.text.format.strict, true)
    assert.equal(request.store, false)
    assert.ok(!String(init?.body).includes('mock-secret'))
    assert.equal(JSON.parse(request.input).categories[0].id, 'work')
    return modelResponse()
  } })
  const result = await resolveScheduleAnalysis(text, context, { provider })
  assert.equal(calls, 1)
  assert.equal(result.items[0].type, 'event')
  assert.equal(result.items[1].type, 'task')
  assert.equal(result.items[1].draft.dueDate, '2026-10-16')
  assert.equal(result.items[1].draft.date, null)
  assert.equal(result.items[0].draft.endTime, null)
  assert.equal(result.items[0].draft.categoryId, 'work')
})

test('missing dates stay null in rule results instead of today fallback', async () => {
  const result = await resolveScheduleAnalysis('오후 3시 회의', context)
  assert.equal(result.items[0].draft.date, null)
  assert.ok(result.items[0].uncertainties.some(entry => entry.field === 'date'))
})

test('order/dependency analysis remains data and assigns no times', async () => {
  const result = fixture()
  result.items.forEach(item => {
    item.type = 'task'
    item.draft = { ...item.draft, date: null, startTime: null, dueDate: null }
    item.evidence = { date: null, startTime: null, endTime: null, dueDate: null, endDate: null }
    item.uncertainties = [{ field: 'date', reason: '날짜 없음' }]
  })
  result.relations = [{ fromId: 'report', toId: 'meeting', type: 'depends_on', reason: '선행 작업 완료 필요' }]
  const provider = createOpenAIAnalysisProvider({ key: 'mock', fetch: async () => modelResponse(result) })
  const actual = await resolveScheduleAnalysis('자료 조사하고 그 다음 초안 작성하기', context, { provider })
  assert.deepEqual(actual.relations, result.relations)
  assert.ok(actual.items.every(item => item.draft.date === null && item.draft.startTime === null))
})

test('schema rejects missing fields, invalid dates/times, unknown properties and structures', () => {
  const mutations: ((value: ScheduleAnalysis) => void)[] = [
    value => { delete (value.items[0].draft as Partial<AnalysisItem['draft']>).date },
    value => { value.items[0].draft.date = '2026-02-30' },
    value => { value.items[0].draft.startTime = '25:00' },
    value => { value.items[0].draft.startTime = '3pm' },
    value => { value.items[0].confidence = 2 },
    value => { Object.assign(value.items[0].draft, { repeat: 'weekly' }) },
    value => { Object.assign(value.items[0], { type: 'planner' }) },
    value => { Object.assign(value, { items: {} }) },
    value => { Object.assign(value, { version: 2 }) },
    value => { value.items = [] },
    value => { value.items[0].draft.categoryId = 'invented' },
    value => { value.items[0].evidence.date = '2026-10-14' },
    value => { value.items[0].evidence.date = '회의' },
    value => { value.items[1].uncertainties = [] },
  ]
  for (const mutate of mutations) {
    const value = fixture()
    mutate(value)
    assert.throws(() => validateScheduleAnalysis(value, { text, categoryIds: ['work'] }), AnalysisError)
  }
})

test('relationships reject absent IDs, duplicates and dependency cycles', () => {
  for (const relations of [
    [{ fromId: 'absent', toId: 'report', type: 'before', reason: 'x' }],
    [{ fromId: 'meeting', toId: 'report', type: 'before', reason: 'x' }, { fromId: 'report', toId: 'meeting', type: 'before', reason: 'y' }],
  ]) assert.throws(() => validateScheduleAnalysis({ ...fixture(), relations }), AnalysisError)
})

test('invalid JSON, refusals and truncated output are rejected', async () => {
  for (const body of [
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '```json {} ```' }] }] },
    { status: 'completed', output: [] },
  ]) {
    const provider = createOpenAIAnalysisProvider({ key: 'mock', fetch: async () => Response.json(body) })
    await assert.rejects(resolveScheduleAnalysis(text, context, { provider }), AnalysisError)
  }
})

test('API failure stops analysis, never falls back to a collapsed schedule, and does not mutate existing data', async () => {
  const existing = Object.freeze([{ id: 'existing', title: '기존 일정' }])
  for (const status of [401, 429, 500]) {
    const provider = createOpenAIAnalysisProvider({ key: 'mock', fetch: async () => new Response('provider details should not leak', { status }) })
    await assert.rejects(resolveScheduleAnalysis(text, context, { provider }), { code: status === 429 ? 'AI_RATE_LIMITED' : 'AI_UNAVAILABLE' })
  }
  const timeout = createOpenAIAnalysisProvider({ key: 'mock', fetch: async () => { throw new DOMException('timeout', 'TimeoutError') } })
  await assert.rejects(resolveScheduleAnalysis(text, context, { provider: timeout }), { code: 'AI_UNAVAILABLE' })
  await assert.rejects(resolveScheduleAnalysis(text, context), { code: 'AI_NOT_CONFIGURED' })
  assert.deepEqual(existing, [{ id: 'existing', title: '기존 일정' }])
})

test('Planner never calls AI and cannot become a normal schedule', async () => {
  let calls = 0
  await assert.rejects(resolveScheduleAnalysis('이번 주 공부 계획 세워줘', context, { provider: { async analyze() { calls++; return fixture() } } }), { code: 'PLANNER_REQUIRED' })
  assert.equal(calls, 0)
})

test('complex conversation creates reach analysis, and complex mutations never use single-item updates', () => {
  assert.equal(conversationIntent('내일 회의하고 운동 추가해줘?', [], null, context.today, []).type, 'create')
  assert.equal(conversationIntent('회의 바꿔줘 그리고 운동 완료해줘', [], null, context.today, []).type, 'reply')
})

test('API validates multi-item contract again and legacy single wrapper never truncates it', async () => {
  const client = clientReturning(fixture())
  assert.equal((await analyzeScheduleFromText(client, { text, timezone: 'Asia/Seoul' })).items.length, 2)
  await assert.rejects(parseScheduleFromText(client, { text, timezone: 'Asia/Seoul' }), { code: 'MULTIPLE_ITEMS' })
  const value = fixture(); value.items[0].draft.date = 'bad'
  await assert.rejects(analyzeScheduleFromText(clientReturning(value), { text, timezone: 'Asia/Seoul' }), { code: 'AI_RESPONSE_INVALID' })
})

test('Edge supports CORS, validation errors and safe error logs without text/key/provider bodies', async () => {
  const logs: Record<string, unknown>[] = []
  const handler = createScheduleHandler({ getEnv: () => undefined, authorize: async () => true, loadPersonal: async () => context, provider: { async analyze() { return fixture() } }, log: entry => logs.push(entry) })
  assert.equal((await handler(new Request('http://local', { method: 'OPTIONS' }))).status, 204)
  const request = (text: string, format: string | undefined = 'analysis-v1') => new Request('http://local', { method: 'POST', body: JSON.stringify({ text, timezone: 'Asia/Seoul', format }) })
  const success = await handler(request(text))
  assert.equal(success.status, 200)
  assert.equal(success.headers.get('Access-Control-Allow-Origin'), '*')
  assert.equal((await success.json()).items.length, 2)
  const planner = await handler(request('계획 세워줘'))
  assert.equal(planner.status, 422)
  const legacy = await handler(new Request('http://local', { method: 'POST', body: JSON.stringify({ text, timezone: 'Asia/Seoul' }) }))
  assert.equal(legacy.status, 502)
  const failing = createScheduleHandler({ getEnv: () => undefined, authorize: async () => true, loadPersonal: async () => context, provider: { async analyze() { return {} as ScheduleAnalysis } }, log: entry => logs.push(entry) })
  const failed = await failing(request(text))
  assert.equal(failed.status, 502)
  assert.equal((await failed.json()).error.code, 'AI_RESPONSE_INVALID')
  assert.ok(logs.some(entry => entry.code === 'AI_RESPONSE_INVALID'))
  assert.ok(!JSON.stringify(logs).includes(text))
  const unauthorized = createScheduleHandler({ getEnv: () => undefined, authorize: async () => false, loadPersonal: async () => { throw new Error('must not read DB') } })
  assert.equal((await unauthorized(request(text))).status, 401)
})

test('review requires a date and explicit unknown-time confirmation, preserves missing end time', () => {
  const item = fixture().items[0]
  const input = reviewedWorkInput(item, item.draft, false, ['work'])
  assert.equal(input.endTime, null)
  assert.equal(input.duration, null)
  assert.throws(() => reviewedWorkInput(item, { ...item.draft, date: null }, false, ['work']), { code: 'DATE_REQUIRED' })
  assert.throws(() => reviewedWorkInput(item, { ...item.draft, startTime: null }, false, ['work']), { code: 'TIME_REQUIRED' })
  assert.equal(reviewedWorkInput(item, { ...item.draft, startTime: null }, true, ['work']).allDay, true)
})
