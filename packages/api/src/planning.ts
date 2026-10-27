import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import type { PlanTasksRequest, PlanningRecommendation } from '../../types/src/planning.ts'
import { validatePlanTasksRequest, validatePlanningRecommendation } from '../../types/src/planningSchema.ts'
import { AppError } from './errors.ts'
import { AnalysisError } from '../../types/src/aiSchema.ts'
import { isRecord } from './guards.ts'
export const PLAN_TASKS_FUNCTION = 'plan-tasks'
export async function planTasksFromText(client: SupabaseClient<Database>, request: PlanTasksRequest): Promise<PlanningRecommendation> {
  let payload: PlanTasksRequest
  try { payload = validatePlanTasksRequest(request) } catch { throw new AppError('INVALID_INPUT', '계획 요청 형식을 확인해 주세요.') }
  const { data, error } = await client.functions.invoke(PLAN_TASKS_FUNCTION, { body: payload })
  if (error) {
    const response = isRecord(error) && error.context instanceof Response ? error.context : null
    if (response) {
      if(response.status===401)throw new AppError('AUTH_REQUIRED','로그인이 만료되었어요. 다시 로그인한 뒤 원본 입력으로 요청해 주세요.')
      const body: unknown = await response.clone().json().catch(() => null)
      if (isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string' && typeof body.error.message === 'string') throw new AppError(body.error.code, body.error.message)
    }
    throw new AppError('PLANNING_FAILED', '계획 추천을 불러오지 못했어요. 기존 일정은 변경되지 않았어요.')
  }
  try { return validatePlanningRecommendation(data, request.text) } catch (caught) {
    if (caught instanceof AnalysisError) throw new AppError(caught.code, caught.message)
    throw caught
  }
}

export async function replanTasks(client:SupabaseClient<Database>,request:{mode:'remaining'|'reschedule'|'inspect';token?:string;edits?:import('../../types/src/planning.ts').PlannerEdit[]}):Promise<{recommendation:PlanningRecommendation|null;conflicts:{id:string;title:string;date:string}[]}>{
 const auth=await client.auth.getUser();if(auth.error||!auth.data.user)throw new AppError('AUTH_REQUIRED','다시 로그인한 뒤 재계획해 주세요.')
 const {data,error}=await client.functions.invoke('replan-tasks',{body:request})
 if(error){const response=isRecord(error)&&error.context instanceof Response?error.context:null;const body=await response?.clone().json().catch(()=>null);if(isRecord(body)&&isRecord(body.error)&&typeof body.error.message==='string')throw new AppError(String(body.error.code),body.error.message);throw new AppError('REPLAN_FAILED','재계획 서버에 연결하지 못했어요. 기존 일정과 입력은 유지됩니다.')}
 if(request.mode==='remaining')return {recommendation:validatePlanningRecommendation(data),conflicts:[]}
 if(!isRecord(data)||!Array.isArray(data.conflicts)||data.conflicts.some(row=>!isRecord(row)||typeof row.id!=='string'||typeof row.title!=='string'||typeof row.date!=='string'))throw new AppError('AI_RESPONSE_INVALID','재배치 응답을 확인할 수 없어요.')
 return {recommendation:data.recommendation?validatePlanningRecommendation(data.recommendation):null,conflicts:data.conflicts as {id:string;title:string;date:string}[]}
}
