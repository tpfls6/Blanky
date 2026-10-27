import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import type { PlannerApprovalRequest } from '../../types/src/planning.ts'
import { validateApprovalRequest } from '../../types/src/plannerApproval.ts'
import { mapScheduleRow } from './scheduleRepository.ts'
import { AppError } from './errors.ts'
import { isRecord } from './guards.ts'
export async function approvePlanner(client:SupabaseClient<Database>,request:PlannerApprovalRequest) {
  validateApprovalRequest(request)
  const {data:auth,error:authError}=await client.auth.getUser()
  if(authError&&/fetch|network|timeout/i.test(authError.message))throw new AppError('NETWORK_ERROR','인증 서버에 연결하지 못했어요. 수정 내용은 유지되며 다시 시도할 수 있어요.')
  if(authError||!auth.user)throw new AppError('AUTH_REQUIRED','로그인이 만료되었어요. 다시 로그인한 뒤 적용해 주세요.')
  const {data,error}=await client.functions.invoke('approve-plan',{body:request})
  if(error){
    if(isRecord(error)&&error.context instanceof Response){
      const body:unknown=await error.context.clone().json().catch(()=>null)
      if(isRecord(body)&&isRecord(body.error)&&typeof body.error.code==='string'&&typeof body.error.message==='string')throw new AppError(body.error.code,body.error.message)
      if(error.context.status===401)throw new AppError('AUTH_REQUIRED','로그인이 만료되었어요. 다시 로그인해 주세요.')
    }
    throw new AppError('APPROVAL_FAILED','연결 또는 저장 요청에 실패했어요. 추천은 유지되며 다시 시도할 수 있어요.')
  }
  if(!isRecord(data)||!Array.isArray(data.schedules)||!Array.isArray(data.applied))throw new AppError('INVALID_RESPONSE','저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.')
  const applied=data.applied.map((row:unknown)=>{
    if(!isRecord(row)||typeof row.blockId!=='string'||typeof row.scheduleId!=='string')throw new AppError('INVALID_RESPONSE','저장 결과를 확인하지 못했어요.')
    return {blockId:row.blockId,scheduleId:row.scheduleId}
  })
  return {schedules:data.schedules.map(mapScheduleRow),applied}
}
