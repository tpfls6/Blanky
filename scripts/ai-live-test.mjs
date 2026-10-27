// Explicit opt-in live test. Synthetic input only; never writes user data.
import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import { createOpenAIAnalysisProvider } from '../packages/parse/src/analysisProvider.ts'
import { resolveScheduleAnalysis } from '../packages/parse/src/resolve.ts'

if (existsSync('supabase/functions/.env')) process.loadEnvFile('supabase/functions/.env')
if (!process.env.OPENAI_API_KEY) {
  console.log(JSON.stringify({ provider: 'openai', status: 'not_run', reason: 'OPENAI_API_KEY missing' }))
  process.exitCode = 1
} else {
  const provider = createOpenAIAnalysisProvider({ key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL,
    fetch: async (...args) => {
      const response = await fetch(...args)
      if (process.env.AI_LIVE_DEBUG === '1') {
        const body = await response.clone().json()
        console.log(JSON.stringify({ status: response.status, output: body.output, errorCode: body.error?.code }))
      }
      return response
    },
  })
  const inputs = [
    '내일 오후 3시 회의하고 금요일까지 보고서 제출하기',
    '자료 조사하고 그 다음 초안 작성하기',
  ]
  for (const text of inputs) {
    if (process.env.AI_LIVE_SCENARIO === 'order' && text !== inputs[1]) continue
    const started = Date.now()
    try {
      const result = await resolveScheduleAnalysis(text, { today: new Date(2026, 9, 13), categories: [{ id: 'work', name: '업무', parentId: null }] }, { provider, timezone: 'Asia/Seoul' })
      assert.equal(result.route, 'ai')
      assert.equal(result.items.length, 2)
      if (text === inputs[0]) {
        assert.equal(result.items[0].type, 'event')
        assert.equal(result.items[0].draft.date, '2026-10-14')
        assert.equal(result.items[0].draft.startTime, '15:00')
        assert.equal(result.items[1].type, 'task')
        assert.equal(result.items[1].draft.dueDate, '2026-10-16')
      } else {
        assert.ok(result.items.every(item => item.draft.date === null && item.draft.startTime === null))
        assert.ok(result.relations.length > 0)
      }
      console.log(JSON.stringify({ provider: 'openai', status: 'passed', scenario: text === inputs[0] ? 'split_event_task_deadline' : 'unknown_dates_order', latencyMs: Date.now() - started, result }))
    } catch (error) {
      console.log(JSON.stringify({ provider: 'openai', status: 'failed', code: error.code ?? 'ASSERTION_FAILED', latencyMs: Date.now() - started }))
      process.exitCode = 1
      break
    }
  }
}
