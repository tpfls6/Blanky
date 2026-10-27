// Read-only deployment smoke. Optional authenticated synthetic-input test.
import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import { validateScheduleAnalysis } from '../packages/types/src/aiSchema.ts'
if (existsSync('.env')) process.loadEnvFile('.env')
const base = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const publicKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
if (!base || !publicKey) throw new Error('Supabase public configuration missing')
const endpoint = base.replace(/\/$/, '') + '/functions/v1/parse-schedule'
const preflight = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } })
assert.equal(preflight.status, 204)
assert.ok(preflight.headers.get('Access-Control-Allow-Origin'))
const anonymous = await fetch(endpoint, { method: 'POST', headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '오늘 오후 3시 회의', timezone: 'Asia/Seoul', format: 'analysis-v1' }) })
assert.equal(anonymous.status, 401)
assert.equal((await anonymous.json()).error?.code, 'AUTH_REQUIRED')
console.log(JSON.stringify({ deployment: 'passed', checks: ['cors_preflight', 'anonymous_denied_before_AI'] }))
if (!process.env.AI_TEST_USER_TOKEN) {
  console.log(JSON.stringify({ authenticatedEdge: 'not_run', reason: 'AI_TEST_USER_TOKEN missing; no test user was created' }))
} else {
  for (const text of ['내일 오후 3시 회의', '내일 오후 3시 회의하고 금요일까지 보고서 제출하기', '이번 주 공부 계획 세워줘']) {
    const response = await fetch(endpoint, { method: 'POST', headers: { apikey: publicKey, Authorization: `Bearer ${process.env.AI_TEST_USER_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, timezone: 'Asia/Seoul', format: 'analysis-v1' }) })
    const body = await response.json()
    if (text.includes('계획')) {
      assert.equal(response.status, 422)
      assert.equal(body.error?.code, 'PLANNER_REQUIRED')
    } else {
      assert.equal(response.status, 200)
      const result = validateScheduleAnalysis(body, { text })
      assert.equal(result.items.length, text.includes('하고') ? 2 : 1)
    }
  }
  console.log(JSON.stringify({ authenticatedEdge: 'passed', writes: 0 }))
}
