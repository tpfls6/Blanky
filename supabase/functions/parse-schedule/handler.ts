import { resolveScheduleAnalysis } from '../../../packages/parse/src/resolve.ts'
import { PlannerRequiredError } from '../../../packages/parse/src/intentRouter.ts'
import { createOpenAIAnalysisProvider } from '../../../packages/parse/src/analysisProvider.ts'
import type { AnalysisProvider } from '../../../packages/parse/src/analysisProvider.ts'
import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import type { CategoryRef, LearnedRule } from '../../../packages/parse/src/model.ts'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function zonedToday(timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const read = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return new Date(read('year'), read('month') - 1, read('day'))
}
export function createScheduleHandler(deps: {
  getEnv: (key: string) => string | undefined
  authorize: (request: Request) => Promise<boolean>
  loadPersonal: (request: Request) => Promise<{ categories: CategoryRef[]; rules: LearnedRule[] }>
  provider?: AnalysisProvider
  log?: (entry: Record<string, unknown>) => void
}) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(), started = Date.now()
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...headers, 'X-Request-Id': requestId } })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: '지원하지 않는 요청입니다.' } }, 405)
    let textLength = 0
    try {
      if (!await deps.authorize(request)) return json({ error: { code: 'AUTH_REQUIRED', message: '로그인 후 AI 분석을 이용해 주세요.' } }, 401)
      if (Number(request.headers.get('content-length')) > 40000) throw new AnalysisError('INVALID_INPUT', '입력 내용이 너무 길어요.')
      const raw = await request.text()
      if (raw.length > 40000) throw new AnalysisError('INVALID_INPUT', '입력 내용이 너무 길어요.')
      let body: unknown
      try { body = JSON.parse(raw) } catch { throw new AnalysisError('INVALID_INPUT', '입력 내용을 확인해 주세요.') }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AnalysisError('INVALID_INPUT', '입력 내용을 확인해 주세요.')
      const payload = body as Record<string, unknown>
      if (Object.keys(payload).some(key => !['text', 'timezone', 'format'].includes(key)) || (payload.format !== undefined && payload.format !== 'analysis-v1')) throw new AnalysisError('INVALID_INPUT', '지원하지 않는 입력 형식이에요.')
      const text = typeof payload.text === 'string' ? payload.text.trim() : ''
      textLength = text.length
      if (!text || text.length > 8000) throw new AnalysisError('INVALID_INPUT', '1~8000자 이내로 입력해 주세요.')
      const timezone = typeof payload.timezone === 'string' ? payload.timezone : 'Asia/Seoul'
      let today: Date
      try { today = zonedToday(timezone) } catch { throw new AnalysisError('INVALID_INPUT', '시간대 설정을 확인해 주세요.') }
      const personal = await deps.loadPersonal(request)
      const threshold = Number(deps.getEnv('AI_CONFIDENCE_THRESHOLD'))
      const result = await resolveScheduleAnalysis(text, { today, ...personal }, {
        timezone,
        threshold: threshold > 0 && threshold <= 1 ? threshold : undefined,
        provider: deps.provider ?? (deps.getEnv('AI_PROVIDER') === 'local' ? undefined : createOpenAIAnalysisProvider({ key: deps.getEnv('OPENAI_API_KEY'), model: deps.getEnv('OPENAI_MODEL') })),
      })
      if (payload.format !== 'analysis-v1' && result.items.length !== 1) throw new AnalysisError('MULTIPLE_ITEMS', '여러 항목이 분석되었어요. 최신 분석 화면에서 확인해 주세요.')
      deps.log?.({ requestId, source: result.route, count: result.items.length, ok: true, latencyMs: Date.now() - started, textLength })
      if (payload.format === 'analysis-v1') return json(result)
      const item = result.items[0]
      return json({ type: item.type, source: item.source, confidence: item.confidence, draft: item.draft })
    } catch (caught) {
      const error = caught instanceof AnalysisError || caught instanceof PlannerRequiredError ? caught : new AnalysisError('SCHEDULE_PARSE_FAILED', '일정을 분석하지 못했어요. 저장하지 않았으니 다시 시도해 주세요.')
      deps.log?.({ requestId, code: error.code, ok: false, latencyMs: Date.now() - started, textLength })
      const status = error.code === 'INVALID_INPUT' ? 400 : error.code === 'PLANNER_REQUIRED' ? 422 : error.code === 'AI_NOT_CONFIGURED' ? 503 : 502
      return json({ error: { code: error.code, message: error.message }, requestId }, status)
    }
  }
}
