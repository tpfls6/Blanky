import assert from 'node:assert/strict'
import test from 'node:test'
import { createAIMeter, estimateCostUsd, quotaDay, type QuotaStore } from '../packages/parse/src/aiMeter.ts'
import { requestStructuredOutput } from '../packages/parse/src/openAITransport.ts'
import { createScheduleHandler } from '../supabase/functions/parse-schedule/handler.ts'
import { createPlanTasksHandler } from '../supabase/functions/plan-tasks/handler.ts'
import { AnalysisError } from '../packages/types/src/aiSchema.ts'
import { analyzeOnce } from '../src/features/ai/analyzeOnce.ts'
import { evaluateCase, parseDataset, summarize } from '../scripts/ai-eval/evaluate.ts'
import type { IntentExtraction } from '../packages/parse/src/intents.ts'
import type { IntentPlan } from '../src/features/ai/intentPlan.ts'
import type { ScheduleAnalysis } from '../packages/types/src/ai.ts'

const KEY = 'sk-test-not-a-real-key'
const EMPTY_INTENTS = { version: 1, intents: [], questions: [] }
const LIMITS = { dailyCalls: 2, dailyTokens: 0, perRequestCalls: 3 }

/** In-memory stand-in for consume_ai_call / record_ai_usage (same contract, single-threaded). */
function memoryStore(callLimitOverride?: number) {
  const rows = new Map<string, { calls: number; tokens: number; cost: number }>()
  const consumed: string[] = []
  const store: QuotaStore = {
    async consume({ day, callLimit, tokenLimit }) {
      consumed.push(day)
      const row = rows.get(day) ?? { calls: 0, tokens: 0, cost: 0 }
      rows.set(day, row)
      const limit = callLimitOverride ?? callLimit
      if (row.calls >= limit || (tokenLimit > 0 && row.tokens >= tokenLimit)) return { allowed: false, calls: row.calls, tokens: row.tokens }
      row.calls += 1
      return { allowed: true, calls: row.calls, tokens: row.tokens }
    },
    async record({ day, inputTokens, outputTokens, costMicroUsd }) {
      const row = rows.get(day)!
      row.tokens += inputTokens + outputTokens
      row.cost += costMicroUsd
    },
  }
  return { store, rows, consumed }
}

/** Fake OpenAI Responses endpoint: counts calls, never touches the network. */
function fakeOpenAI(answer: unknown = EMPTY_INTENTS, status = 200) {
  const calls: RequestInit[] = []
  const fetch = (async (_url: string, init: RequestInit) => {
    calls.push(init)
    if (status !== 200) return new Response('{}', { status })
    return Response.json({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }],
      usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 400 } },
    })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

test('cost estimate uses the price table and treats dated snapshots as their family', () => {
  assert.equal(estimateCostUsd('gpt-4o-mini', 1_000_000, 0), 0.15)
  assert.equal(estimateCostUsd('gpt-4o-mini-2024-07-18', 0, 1_000_000), 0.6)
  assert.equal(estimateCostUsd('unknown-model', 10, 10), null)
})

test('transport fails closed without a quota store and never reaches the provider', async () => {
  const openai = fakeOpenAI()
  const meter = createAIMeter({ store: null, limits: LIMITS, day: '2026-11-09' })
  await assert.rejects(requestStructuredOutput({ key: KEY, fetch: openai.fetch, meter }, {}, 'x', {}), (error: AnalysisError) => error.code === 'AI_QUOTA_UNAVAILABLE')
  assert.equal(openai.calls.length, 0)
})

test('daily limit stops the third call before fetch; tokens and cost are measured from the response', async () => {
  const openai = fakeOpenAI()
  const { store, rows } = memoryStore()
  for (let index = 0; index < 2; index++) {
    const meter = createAIMeter({ store, limits: LIMITS, day: '2026-11-09' })
    await requestStructuredOutput({ key: KEY, fetch: openai.fetch, meter }, {}, 'x', {})
    const summary = meter.summary()
    assert.equal(summary.aiCalls, 1)
    assert.equal(summary.inputTokens, 1000)
    assert.equal(summary.outputTokens, 200)
    assert.equal(summary.cachedInputTokens, 400)
    assert.equal(summary.estCostUsd, Number(((600 * 0.15 + 400 * 0.075 + 200 * 0.6) / 1e6).toFixed(6)))
  }
  const meter = createAIMeter({ store, limits: LIMITS, day: '2026-11-09' })
  await assert.rejects(requestStructuredOutput({ key: KEY, fetch: openai.fetch, meter }, {}, 'x', {}), (error: AnalysisError) => error.code === 'AI_QUOTA_EXCEEDED')
  assert.equal(openai.calls.length, 2)
  assert.equal(rows.get('2026-11-09')!.tokens, 2400)
  assert.equal(meter.summary().denied, 'AI_QUOTA_EXCEEDED')
})

test('one request cannot fan out beyond the per-request cap; failed calls still count', async () => {
  const openai = fakeOpenAI(EMPTY_INTENTS, 500)
  const meter = createAIMeter({ store: memoryStore().store, limits: { dailyCalls: 99, dailyTokens: 0, perRequestCalls: 1 }, day: '2026-11-09' })
  await assert.rejects(requestStructuredOutput({ key: KEY, fetch: openai.fetch, meter }, {}, 'x', {}), (error: AnalysisError) => error.code === 'AI_UNAVAILABLE')
  await assert.rejects(requestStructuredOutput({ key: KEY, fetch: openai.fetch, meter }, {}, 'x', {}), (error: AnalysisError) => error.code === 'AI_REQUEST_LIMIT')
  assert.equal(openai.calls.length, 1)
  assert.equal(meter.summary().aiCalls, 1)
})

// --- parse-schedule handler -------------------------------------------------------------------

const COMPLEX = '내일 오전 10시 회의하고 금요일 오후 2시 병원' // no comma: the router asks for AI
const NOW = new Date('2026-11-09T03:00:00Z') // 12:00 in Seoul

function scheduleHandler(options: { store?: QuotaStore | null; env?: Record<string, string> } = {}) {
  const logs: Record<string, unknown>[] = []
  const handler = createScheduleHandler({
    getEnv: key => ({ OPENAI_API_KEY: KEY, AI_DAILY_CALL_LIMIT: '1', ...options.env })[key],
    authorize: async request => request.headers.get('Authorization') === 'Bearer ok',
    loadPersonal: async () => ({ categories: [], rules: [] }),
    quotaStore: async () => options.store ?? null,
    now: () => NOW,
    log: entry => logs.push(entry),
  })
  const call = (body: Record<string, unknown>) => handler(new Request('https://x/parse', { method: 'POST', headers: { Authorization: 'Bearer ok' }, body: JSON.stringify(body) }))
  return { call, logs }
}

async function withFetch<T>(fake: typeof globalThis.fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = fake
  try { return await run() } finally { globalThis.fetch = original }
}

test('ai:false runs rules only: an AI-only sentence returns AI_SKIPPED without consuming quota or calling the model', async () => {
  const openai = fakeOpenAI()
  const quota = memoryStore()
  const { call } = scheduleHandler({ store: quota.store })
  const response = await withFetch(openai.fetch, () => call({ text: '퇴근하고 장보고 저녁에 엄마한테 전화하기', timezone: 'Asia/Seoul', format: 'analysis-v1', ai: false }))
  assert.equal(response.status, 422)
  assert.equal((await response.json()).error.code, 'AI_SKIPPED')
  assert.equal(openai.calls.length, 0)
  assert.equal(quota.consumed.length, 0)
})

test('ai:false still saves what the rules read on their own', async () => {
  const openai = fakeOpenAI()
  const { call } = scheduleHandler({ store: memoryStore().store })
  const response = await withFetch(openai.fetch, () => call({ text: '내일 오후 3시 회의', timezone: 'Asia/Seoul', format: 'analysis-v1', ai: false }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).items[0].draft.startTime, '15:00')
  assert.equal(openai.calls.length, 0)
})

test('the body cannot widen access: ai:true, a user id or unknown keys are rejected', async () => {
  const { call } = scheduleHandler({ store: memoryStore().store })
  for (const extra of [{ ai: true }, { userId: 'someone-else' }, { limit: 999 }, { ai: false, format: 'intents-v1' }]) {
    const response = await call({ text: '내일 오후 3시 회의', timezone: 'Asia/Seoul', format: 'analysis-v1', ...extra })
    assert.equal(response.status, 400, JSON.stringify(extra))
  }
})

test('over quota: simple sentences still parse by rules, AI-only sentences get 429, and nothing reaches the model', async () => {
  const openai = fakeOpenAI()
  const quota = memoryStore(0)
  const { call, logs } = scheduleHandler({ store: quota.store })
  await withFetch(openai.fetch, async () => {
    const simple = await call({ text: '내일 오후 3시 회의', timezone: 'Asia/Seoul', format: 'analysis-v1' })
    assert.equal(simple.status, 200)
    const blocked = await call({ text: '퇴근하고 장보고 저녁에 엄마한테 전화하기', timezone: 'Asia/Seoul', format: 'analysis-v1' })
    assert.equal(blocked.status, 429)
    assert.equal((await blocked.json()).error.code, 'AI_QUOTA_EXCEEDED')
    const intents = await call({ text: '토요일 약속 일요일로 옮겨줘', timezone: 'Asia/Seoul', format: 'intents-v1' })
    assert.equal(intents.status, 429)
  })
  assert.equal(openai.calls.length, 0)
  assert.equal(logs.at(-1)!.denied, 'AI_QUOTA_EXCEEDED')
})

test('over quota a multi-clause sentence falls back to the rule split instead of failing', async () => {
  const openai = fakeOpenAI()
  const { call, logs } = scheduleHandler({ store: memoryStore(0).store })
  const response = await withFetch(openai.fetch, () => call({ text: COMPLEX, timezone: 'Asia/Seoul', format: 'analysis-v1' }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).items.length, 2)
  assert.equal(openai.calls.length, 0)
  assert.equal(logs.at(-1)!.fallback, 'AI_QUOTA_EXCEEDED')
})

test('a missing quota store denies AI (fail closed) but keeps rule parsing', async () => {
  const openai = fakeOpenAI()
  const { call } = scheduleHandler({ store: null })
  await withFetch(openai.fetch, async () => {
    assert.equal((await call({ text: '내일 오후 3시 회의', timezone: 'Asia/Seoul', format: 'analysis-v1' })).status, 200)
    assert.equal((await call({ text: '토요일 약속 일요일로 옮겨줘', timezone: 'Asia/Seoul', format: 'intents-v1' })).status, 429)
  })
  assert.equal(openai.calls.length, 0)
})

test('quota day is the server day in Seoul: a client timezone cannot reset it', async () => {
  const openai = fakeOpenAI()
  const quota = memoryStore()
  const { call } = scheduleHandler({ store: quota.store })
  await withFetch(openai.fetch, async () => {
    for (const timezone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Seoul']) await call({ text: '토요일 약속 일요일로 옮겨줘', timezone, format: 'intents-v1' })
  })
  assert.deepEqual(quota.consumed, ['2026-11-09', '2026-11-09', '2026-11-09'])
  assert.equal(quotaDay(NOW), '2026-11-09')
  assert.equal(openai.calls.length, 1, 'limit 1: only the first call reached the model')
})

test('logs carry usage only: no input text, key or user id', async () => {
  const openai = fakeOpenAI()
  const { call, logs } = scheduleHandler({ store: memoryStore().store })
  const text = '토요일 비밀 약속 일요일로 옮겨줘'
  await withFetch(openai.fetch, () => call({ text, timezone: 'Asia/Seoul', format: 'intents-v1' }))
  const line = JSON.stringify(logs)
  assert.ok(!line.includes('비밀') && !line.includes(KEY) && !line.includes('Bearer'))
  assert.equal(logs[0].aiCalls, 1)
  assert.equal(logs[0].inputTokens, 1000)
  assert.equal(logs[0].format, 'intents-v1')
  assert.equal(typeof logs[0].llmLatencyMs, 'number')
})

test('plan-tasks reports a quota denial as 429 and logs usage', async () => {
  const logs: Record<string, unknown>[] = []
  const handler = createPlanTasksHandler({
    authenticate: async () => ({
      userId: 'u', now: '2026-11-09T03:00:00.000Z',
      provider: { analyzeTasks: async () => { throw new AnalysisError('AI_QUOTA_EXCEEDED', 'quota') } },
      loadSettings: async () => ({}), loadSchedules: async () => [], loadCategories: async () => [],
      usage: () => ({ aiCalls: 0, denied: 'AI_QUOTA_EXCEEDED' }),
    }),
    log: entry => logs.push(entry),
  })
  const response = await handler(new Request('https://x/plan', { method: 'POST', body: JSON.stringify({ text: '이번 주 공부 5시간 일정 짜줘' }) }))
  assert.equal(response.status, 429)
  assert.equal(logs[0].denied, 'AI_QUOTA_EXCEEDED')
})

// --- one AI call per message (client) -------------------------------------------------------

const ANALYSIS = { version: 1, route: 'parser', items: [], relations: [], warnings: [] } as unknown as ScheduleAnalysis
const INTENTS = { text: 'x', source: 'ai', unresolved: [], questions: [], intents: [] } as unknown as IntentExtraction
const planWith = (count: number) => ({ actions: Array.from({ length: count }, () => ({ op: 'create' })), questions: [], confirm: [], mode: 'auto', source: 'ai' }) as unknown as IntentPlan
const failing = (code: string) => Object.assign(new Error(code), { code })

test('analyzeOnce: no intent AI → one normal analysis', async () => {
  const seen: unknown[] = []
  const result = await analyzeOnce({ intentAI: null, analyze: async options => { seen.push(options); return ANALYSIS }, planFromIntents: () => planWith(1) })
  assert.deepEqual(seen, [{}])
  assert.ok('analysis' in result)
})

test('analyzeOnce: after intent AI the analysis asks for rules only', async () => {
  const seen: unknown[] = []
  await analyzeOnce({ intentAI: INTENTS, analyze: async options => { seen.push(options); return ANALYSIS }, planFromIntents: () => planWith(1) })
  assert.deepEqual(seen, [{ ai: false }])
})

test('analyzeOnce: rules cannot read it → AI intents become a confirmed plan, no second AI call', async () => {
  const seen: unknown[] = []
  const result = await analyzeOnce({ intentAI: INTENTS, analyze: async options => { seen.push(options); throw failing('AI_SKIPPED') }, planFromIntents: () => planWith(2) })
  assert.deepEqual(seen, [{ ai: false }])
  assert.ok('plan' in result && result.plan.mode === 'preview')
})

test('analyzeOnce: unusable intents or an old server fall back to the normal analysis', async () => {
  const seen: unknown[] = []
  await analyzeOnce({ intentAI: INTENTS, analyze: async options => { seen.push(options); if (options.ai === false) throw failing('AI_SKIPPED'); return ANALYSIS }, planFromIntents: () => planWith(0) })
  assert.deepEqual(seen, [{ ai: false }, {}])
  const old: unknown[] = []
  await analyzeOnce({ intentAI: INTENTS, analyze: async options => { old.push(options); if (options.ai === false) throw failing('INVALID_INPUT'); return ANALYSIS }, planFromIntents: () => planWith(1) })
  assert.deepEqual(old, [{ ai: false }, {}])
  await assert.rejects(analyzeOnce({ intentAI: INTENTS, analyze: async () => { throw failing('AI_QUOTA_EXCEEDED') }, planFromIntents: () => planWith(1) }), /AI_QUOTA_EXCEEDED/)
})

// --- offline evaluation tool ----------------------------------------------------------------

test('offline eval: dataset validation, rule-only and delegation counts', async () => {
  assert.throws(() => parseDataset('{"id":"a","text":"x"}\n{"id":"a","text":"y"}'), /duplicate/)
  const rows = parseDataset([
    '// comment',
    '{"id":"simple","text":"내일 오후 3시 회의","expect":{"date":"2026-11-10","startTime":"15:00"}}',
    '{"id":"planner","text":"다음 주 계획 세워줘","expect":{"route":"planner"}}',
    '{"id":"memo","text":"메모: 우산 챙기기","expect":{"capture":"memo"}}',
  ].join('\n'))
  const results = await Promise.all(rows.map(evaluateCase))
  const report = summarize(results)
  assert.equal(report.cases, 3)
  assert.equal(report.labeled.passed, 3)
  assert.deepEqual(report.llmByStep, { intents: 0, analysis: 0, planning: 1 })
  assert.equal(report.ruleOnlyRate, 0.6667)
})
