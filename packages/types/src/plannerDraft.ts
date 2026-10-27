import type { PlannerEdit, PlanningRecommendation } from './planning.ts'
import { AnalysisError } from './aiSchema.ts'
import { validatePlanningRecommendation } from './planningSchema.ts'
export type PlannerDraft={input:string;plan:PlanningRecommendation;edits:PlannerEdit[];saved:string[]}
export type PlannerDraftState={revision:number;draft:PlannerDraft|null;updatedAt:string|null}
/** Drafts may contain unfinished fields; approval uses the stricter approval schema. */
export function validateDraftEdits(value:unknown,plan:PlanningRecommendation):PlannerEdit[]{
 const fail=():never=>{throw new AnalysisError('INVALID_DRAFT','초안 데이터를 확인할 수 없어요. 이 기기의 수정 내용은 유지됩니다.')}
 if(!Array.isArray(value)||value.length>200)fail()
 const ids=new Set(plan.result.blocks.map(block=>block.id)),seen=new Set<string>()
 return (value as unknown[]).map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))return fail()
  const row=item as Record<string,unknown>,keys=['id','title','date','startTime','endTime','durationMinutes','priority','included','confirmed']
  if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key))||typeof row.id!=='string'||!ids.has(row.id)||seen.has(row.id))return fail()
  seen.add(row.id)
  for(const key of ['title','date','startTime','endTime'] as const)if(typeof row[key]!=='string'||row[key].length>(key==='title'?500:20))fail()
  if(typeof row.durationMinutes!=='number'||!Number.isFinite(row.durationMinutes)||row.durationMinutes<0||row.durationMinutes>1000000||!['high','medium','low'].includes(String(row.priority))||typeof row.included!=='boolean'||typeof row.confirmed!=='boolean')fail()
  return structuredClone(row) as unknown as PlannerEdit
 })
}
export function validatePlannerDraft(value:unknown):PlannerDraft{
 const fail=():never=>{throw new AnalysisError('INVALID_DRAFT','초안을 읽지 못했어요. 기존 일정은 변경하지 않았어요.')}
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 const row=value as Record<string,unknown>
 if(Object.keys(row).some(key=>!['input','plan','edits','saved'].includes(key))||typeof row.input!=='string'||!row.input.trim()||row.input.length>8000||!Array.isArray(row.saved)||row.saved.some(id=>typeof id!=='string')||row.saved.length>200)fail()
 const plan=validatePlanningRecommendation(row.plan)
 if(!plan.approval)fail()
 const ids=new Set(plan.result.blocks.map(block=>block.id))
 if((row.saved as string[]).some(id=>!ids.has(id))||new Set(row.saved as string[]).size!==(row.saved as string[]).length)fail()
 return {input:row.input as string,plan,edits:validateDraftEdits(row.edits,plan),saved:[...row.saved as string[]]}
}
