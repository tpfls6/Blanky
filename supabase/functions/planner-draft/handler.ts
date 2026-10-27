import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import { validateDraftEdits, validatePlannerDraft, type PlannerDraft, type PlannerDraftState } from '../../../packages/types/src/plannerDraft.ts'
import { editsFromRecommendation } from '../../../packages/scheduling/src/approval.ts'
import { localInstant,zonedISO } from '../../../packages/scheduling/src/time.ts'
import { openPlanner } from '../_shared/plannerToken.ts'
import type { ApprovalSnapshot } from '../approve-plan/handler.ts'
export type StoredDraft={revision:number;payload:PlannerDraft|null;updated_at:string}
export type DraftDependencies={userId:string;secret:string;now:string;read:()=>Promise<StoredDraft|null>;write:(revision:number,payload:PlannerDraft|null)=>Promise<StoredDraft>;snapshot:()=>Promise<ApprovalSnapshot>}
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
export function createDraftHandler(deps:{authenticate:(request:Request)=>Promise<DraftDependencies|null>;log?:(entry:Record<string,unknown>)=>void}){return async(request:Request)=>{
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:cors})
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
 if(request.method!=='POST')return json({error:{code:'METHOD_NOT_ALLOWED',message:'POST 요청을 사용해 주세요.'}},405)
 try{
  const auth=await deps.authenticate(request);if(!auth)return json({error:{code:'AUTH_REQUIRED',message:'로그인이 만료되었어요. 이 기기의 초안은 유지됩니다.'}},401)
  const raw=await request.text();if(raw.length>2000000)throw new AnalysisError('INVALID_DRAFT','초안 데이터가 너무 커요.')
  let body;try{body=JSON.parse(raw)}catch{throw new AnalysisError('INVALID_DRAFT','초안 요청 형식을 확인해 주세요.')}
  if(!body||typeof body!=='object'||!['load','save','clear'].includes(body.action)||Object.keys(body).some(key=>!['action','revision','input','token','edits'].includes(key)))throw new AnalysisError('INVALID_DRAFT','초안 요청 형식을 확인해 주세요.')
  const canonical=async(draft:PlannerDraft):Promise<PlannerDraft>=>{
   const signed=await openPlanner(draft.plan.approval!.token,auth.userId,auth.secret,Date.parse(auth.now),true)
   const plan={...signed.recommendation,approval:draft.plan.approval},edits=validateDraftEdits(draft.edits,plan),snapshot=await auth.snapshot(),prefix=signed.previewId+':'
   const saved:string[]=[],defaults=editsFromRecommendation(plan)
   for(const block of plan.result.blocks){
    const target=signed.context?.targets?.[block.id]
    const row=snapshot.rows.find(row=>target?row.id===target.id&&(row.planner_metadata as {lastPreviewId?:string;lastBlockId?:string}|null)?.lastPreviewId===signed.previewId&&(row.planner_metadata as {lastBlockId?:string}|null)?.lastBlockId===block.id:row.planner_approval_key===prefix+block.id)
    if(!row)continue
    const sourceZone=snapshot.calendars.find(calendar=>calendar.id===row.calendar_id)?.timezone;if(!sourceZone)throw new AnalysisError('INVALID_DRAFT','초안 일정의 캘린더를 확인하지 못했어요.')
    const start=zonedISO(localInstant(String(row.date),String(row.start_time).slice(0,5),sourceZone),plan.result.settings.timezone),end=zonedISO(localInstant(String(row.end_date??row.date),String(row.end_time).slice(0,5),sourceZone),plan.result.settings.timezone)
    const actual={id:block.id,title:String(row.title),date:start.slice(0,10),startTime:start.slice(11,16),endTime:end.slice(11,16),durationMinutes:Number(row.duration_minutes),priority:row.priority as 'high'|'medium'|'low',included:true,confirmed:true}
    const index=edits.findIndex(edit=>edit.id===block.id);if(index<0)edits.push(actual);else edits[index]=actual
    saved.push(block.id)
   }
   for(const edit of defaults)if(!edits.some(row=>row.id===edit.id))edits.push(edit)
   return validatePlannerDraft({...draft,plan,edits,saved})
  }
  const envelope=async(stored:StoredDraft|null):Promise<PlannerDraftState>=>({revision:stored?.revision??0,draft:stored?.payload?await canonical(validatePlannerDraft(stored.payload)):null,updatedAt:stored?.updated_at??null})
  if(body.action==='load')return json(await envelope(await auth.read()))
  if(!Number.isSafeInteger(body.revision)||body.revision<0)throw new AnalysisError('INVALID_DRAFT','초안 버전을 확인해 주세요.')
  if(body.action==='clear')return json(await envelope(await auth.write(body.revision,null)))
  if(typeof body.input!=='string'||!body.input.trim()||body.input.length>8000||typeof body.token!=='string')throw new AnalysisError('INVALID_DRAFT','초안 입력을 확인해 주세요.')
  const signed=await openPlanner(body.token,auth.userId,auth.secret,Date.parse(auth.now),true)
  const plan={...signed.recommendation,approval:{token:body.token,previewId:signed.previewId,expiresAt:signed.expiresAt}}
  const draft=await canonical({input:body.input,plan,edits:validateDraftEdits(body.edits,plan),saved:[]})
  const stored=await auth.write(body.revision,draft)
  return json({revision:stored.revision,draft:stored.payload,updatedAt:stored.updated_at})
 }catch(caught){const error=caught instanceof AnalysisError?caught:new AnalysisError('DRAFT_SYNC_FAILED','초안을 동기화하지 못했어요. 이 기기의 입력과 수정 내용은 유지됩니다.');deps.log?.({code:error.code,ok:false});return json({error:{code:error.code,message:error.message}},error.code==='DRAFT_CONFLICT'?409:400)}
}}
