import { resolveScheduleAnalysis } from '../../../packages/parse/src/resolve.ts'
import { PlannerRequiredError } from '../../../packages/parse/src/intentRouter.ts'
import { createOpenAIAnalysisProvider } from '../../../packages/parse/src/analysisProvider.ts'
import type { AnalysisProvider } from '../../../packages/parse/src/analysisProvider.ts'
import { createOpenAIIntentProvider, type IntentProvider } from '../../../packages/parse/src/intentAnalysis.ts'
import { formatISODate } from '../../../packages/utils/src/date.ts'
import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import type { CategoryRef, LearnedRule } from '../../../packages/parse/src/model.ts'
import { createAIMeter, meterLimits, quotaDay, QUOTA_CODES, QUOTA_MESSAGE, type QuotaStore } from '../../../packages/parse/src/aiMeter.ts'

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
  intentProvider?: IntentProvider
  /** Per-user daily counter. Missing or failing stores deny paid calls (rules still answer). */
  quotaStore?: (request: Request) => Promise<QuotaStore | null>
  now?: () => Date
  log?: (entry: Record<string, unknown>) => void
}) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(), started = Date.now()
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...headers, 'X-Request-Id': requestId } })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: '지원하지 않는 요청입니다.' } }, 405)
    let textLength = 0, format = 'legacy'
    let meter: ReturnType<typeof createAIMeter> | null = null
    // Counts, tokens, cost and latency only: no text, user id or key ever reaches the log.
    const usage = () => meter ? meter.summary() : {}
    try {
      if (!await deps.authorize(request)) return json({ error: { code: 'AUTH_REQUIRED', message: '로그인 후 AI 분석을 이용해 주세요.' } }, 401)
      if (Number(request.headers.get('content-length')) > 40000) throw new AnalysisError('INVALID_INPUT', '입력 내용이 너무 길어요.')
      const raw = await request.text()
      if (raw.length > 40000) throw new AnalysisError('INVALID_INPUT', '입력 내용이 너무 길어요.')
      let body: unknown
      try { body = JSON.parse(raw) } catch { throw new AnalysisError('INVALID_INPUT', '입력 내용을 확인해 주세요.') }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AnalysisError('INVALID_INPUT', '입력 내용을 확인해 주세요.')
      const payload = body as Record<string, unknown>
      if (Object.keys(payload).some(key => !['text', 'timezone', 'format', 'ai'].includes(key)) || (payload.format !== undefined && payload.format !== 'analysis-v1' && payload.format !== 'intents-v1') || (payload.ai !== undefined && payload.ai !== false)) throw new AnalysisError('INVALID_INPUT', '지원하지 않는 입력 형식이에요.')
      format = typeof payload.format === 'string' ? payload.format : 'legacy'
      // ai:false only narrows a request (the client already spent this message's AI call on intents).
      const allowAI = payload.ai !== false
      const text = typeof payload.text === 'string' ? payload.text.trim() : ''
      textLength = text.length
      if (!text || text.length > 8000) throw new AnalysisError('INVALID_INPUT', '1~8000자 이내로 입력해 주세요.')
      const timezone = typeof payload.timezone === 'string' ? payload.timezone : 'Asia/Seoul'
      let today: Date
      try { today = zonedToday(timezone) } catch { throw new AnalysisError('INVALID_INPUT', '시간대 설정을 확인해 주세요.') }
      const store = deps.quotaStore ? await deps.quotaStore(request).catch(() => null) : null
      meter = createAIMeter({ store, limits: meterLimits(deps.getEnv), day: quotaDay((deps.now ?? (() => new Date()))(), deps.getEnv('AI_QUOTA_TIMEZONE') || 'Asia/Seoul') })
      const openAI = { key: deps.getEnv('OPENAI_API_KEY'), model: deps.getEnv('OPENAI_MODEL'), meter }
      // Intent analysis reads only the sentence; saved schedules are matched on the client.
      if (payload.format === 'intents-v1') {
        if (!allowAI) throw new AnalysisError('INVALID_INPUT', '지원하지 않는 입력 형식이에요.')
        if (!deps.intentProvider && deps.getEnv('AI_PROVIDER') === 'local') throw new AnalysisError('AI_NOT_CONFIGURED', 'AI 분석이 아직 설정되지 않았어요.')
        const provider = deps.intentProvider ?? createOpenAIIntentProvider(openAI)
        const intents = await provider.analyze({ text, today: formatISODate(today), timezone })
        deps.log?.({ requestId, format, source: 'intents', count: Array.isArray((intents as { intents?: unknown[] }).intents) ? (intents as { intents: unknown[] }).intents.length : 0, ok: true, latencyMs: Date.now() - started, textLength, ...usage() })
        return json(intents)
      }
      const personal = await deps.loadPersonal(request)
      const threshold = Number(deps.getEnv('AI_CONFIDENCE_THRESHOLD'))
      const resolve = (provider: AnalysisProvider | undefined) => resolveScheduleAnalysis(text, { today, ...personal }, {
        timezone,
        threshold: threshold > 0 && threshold <= 1 ? threshold : undefined,
        provider,
      })
      const provider = !allowAI ? undefined : deps.provider ?? (deps.getEnv('AI_PROVIDER') === 'local' ? undefined : createOpenAIAnalysisProvider(openAI))
      let result: Awaited<ReturnType<typeof resolveScheduleAnalysis>>
      let fallback: string | null = null
      try {
        result = await resolve(provider)
      } catch (caught) {
        const quota = caught instanceof AnalysisError && QUOTA_CODES.has(caught.code)
        if (!allowAI && caught instanceof AnalysisError && caught.code === 'AI_NOT_CONFIGURED') throw new AnalysisError('AI_SKIPPED', '규칙만으로는 분석하지 못한 문장이에요.')
        if (!quota) throw caught
        // Over quota: the rule layer still answers what it can read on its own.
        const denied = caught as AnalysisError
        try { result = await resolve(undefined) } catch (rules) {
          if (rules instanceof AnalysisError && rules.code === 'AI_NOT_CONFIGURED') throw new AnalysisError(denied.code === 'AI_QUOTA_UNAVAILABLE' ? 'AI_QUOTA_UNAVAILABLE' : 'AI_QUOTA_EXCEEDED', denied.message || QUOTA_MESSAGE)
          throw rules
        }
        fallback = denied.code
      }
      if (payload.format !== 'analysis-v1' && result.items.length !== 1) throw new AnalysisError('MULTIPLE_ITEMS', '여러 항목이 분석되었어요. 최신 분석 화면에서 확인해 주세요.')
      deps.log?.({ requestId, format, source: result.route, count: result.items.length, ok: true, latencyMs: Date.now() - started, textLength, ...(fallback ? { fallback } : {}), ...usage() })
      if (payload.format === 'analysis-v1') return json(result)
      const item = result.items[0]
      return json({ type: item.type, source: item.source, confidence: item.confidence, draft: item.draft })
    } catch (caught) {
      const error = caught instanceof AnalysisError || caught instanceof PlannerRequiredError ? caught : new AnalysisError('SCHEDULE_PARSE_FAILED', '일정을 분석하지 못했어요. 저장하지 않았으니 다시 시도해 주세요.')
      deps.log?.({ requestId, format, code: error.code, ok: false, latencyMs: Date.now() - started, textLength, ...usage() })
      const status = error.code === 'INVALID_INPUT' ? 400 : error.code === 'PLANNER_REQUIRED' || error.code === 'AI_SKIPPED' ? 422 : QUOTA_CODES.has(error.code) ? 429 : error.code === 'AI_NOT_CONFIGURED' ? 503 : 502
      return json({ error: { code: error.code, message: error.message }, requestId }, status)
    }
  }
}
