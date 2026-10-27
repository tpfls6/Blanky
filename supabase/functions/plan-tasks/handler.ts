import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import { validatePlanTasksRequest, validatePlanningRecommendation } from '../../../packages/types/src/planningSchema.ts'
import { createPlanningRecommendation, type PlannerDependencies } from '../../../packages/scheduling/src/planner.ts'
import type { PlanningRecommendation } from '../../../packages/types/src/planning.ts'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
export function createPlanTasksHandler(deps: { authenticate: (request: Request) => Promise<PlannerDependencies | null>; seal?: (plan: PlanningRecommendation, authenticated: PlannerDependencies, input:string) => Promise<NonNullable<PlanningRecommendation['approval']>>; log?: (entry: Record<string, unknown>) => void }) {
  return async (request: Request) => {
    const requestId = crypto.randomUUID(), started = Date.now()
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...cors, 'X-Request-Id': requestId } })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 지원합니다.' } }, 405)
    try {
      const authenticated = await deps.authenticate(request)
      if (!authenticated) return json({ error: { code: 'AUTH_REQUIRED', message: '로그인 후 계획을 요청해 주세요.' } }, 401)
      const raw = await request.text()
      if (raw.length > 40000) throw new AnalysisError('INVALID_INPUT', '입력 내용이 너무 길어요.')
      let body: unknown
      try { body = JSON.parse(raw) } catch { throw new AnalysisError('INVALID_INPUT', '입력 내용을 확인해 주세요.') }
      let payload
      try { payload = validatePlanTasksRequest(body) } catch { throw new AnalysisError('INVALID_INPUT', '계획 요청 형식을 확인해 주세요.') }
      const recommendation = validatePlanningRecommendation(await createPlanningRecommendation(payload, authenticated), payload.text)
      if(deps.seal) recommendation.approval=await deps.seal(recommendation,authenticated,payload.text)
      deps.log?.({ requestId, ok: true, blocks: recommendation.result.blocks.length, latencyMs: Date.now() - started })
      return json(recommendation)
    } catch (caught) {
      const error = caught instanceof AnalysisError ? caught : new AnalysisError('PLANNING_FAILED', '기존 일정 또는 설정을 읽지 못해 추천을 중단했어요.')
      deps.log?.({ requestId, ok: false, code: error.code, latencyMs: Date.now() - started })
      return json({ error: { code: error.code, message: error.message }, requestId }, error.code === 'INVALID_INPUT' ? 400 : 502)
    }
  }
}
