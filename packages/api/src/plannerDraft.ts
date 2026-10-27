import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { AppError } from './errors.ts'
import { isRecord } from './guards.ts'
import { validatePlannerDraft,type PlannerDraft,type PlannerDraftState } from '../../types/src/plannerDraft.ts'
async function invoke(client:SupabaseClient<Database>,body:Record<string,unknown>):Promise<PlannerDraftState>{
 const {data,error}=await client.functions.invoke('planner-draft',{body})
 if(error){const response=isRecord(error)&&error.context instanceof Response?error.context:null;const value:unknown=await response?.clone().json().catch(()=>null);if(isRecord(value)&&isRecord(value.error)&&typeof value.error.code==='string'&&typeof value.error.message==='string')throw new AppError(value.error.code,value.error.message);if(response?.status===401)throw new AppError('AUTH_REQUIRED','로그인이 만료되었어요. 이 기기의 초안은 유지됩니다.');throw new AppError('DRAFT_SYNC_FAILED','서버에 연결하지 못했어요. 이 기기의 초안은 유지되며 다시 시도할 수 있어요.')}
 if(!isRecord(data)||!Number.isSafeInteger(data.revision)||Number(data.revision)<0||!Object.hasOwn(data,'draft')||(data.updatedAt!==null&&typeof data.updatedAt!=='string'))throw new AppError('INVALID_DRAFT','초안 응답을 확인하지 못했어요.')
 return {revision:Number(data.revision),draft:data.draft===null?null:validatePlannerDraft(data.draft),updatedAt:data.updatedAt as string|null}
}
export function loadPlannerDraft(client:SupabaseClient<Database>){return invoke(client,{action:'load'})}
export function savePlannerDraft(client:SupabaseClient<Database>,revision:number,draft:PlannerDraft){validatePlannerDraft(draft);return invoke(client,{action:'save',revision,input:draft.input,token:draft.plan.approval!.token,edits:draft.edits})}
export function clearPlannerDraft(client:SupabaseClient<Database>,revision:number){return invoke(client,{action:'clear',revision})}
