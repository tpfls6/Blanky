// Read-only reproduction: never creates calendar records.
import { existsSync } from 'node:fs'
import { createOpenAIAnalysisProvider } from '../packages/parse/src/analysisProvider.ts'
import { resolveScheduleAnalysis } from '../packages/parse/src/resolve.ts'
if (existsSync('supabase/functions/.env')) process.loadEnvFile('supabase/functions/.env')
const text = '화요일 9시부터 13시, 목/금 9시부터 6시 주마다 근로있는데 일정 추가해줘.'
let output
const provider = createOpenAIAnalysisProvider({ key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL, fetch: async (...args) => {
  const response = await fetch(...args)
  const body = await response.clone().json()
  output = body.output
  return response
} })
try {
  const result = await resolveScheduleAnalysis(text, { today: new Date(2026, 9, 15), categories: [] }, { provider, timezone: 'Asia/Seoul' })
  console.log(JSON.stringify({ status: 'passed', result, writes: 0 }))
} catch (error) {
  console.log(JSON.stringify({ status: 'failed', code: error.code, output, writes: 0 }))
  process.exitCode = 1
}
