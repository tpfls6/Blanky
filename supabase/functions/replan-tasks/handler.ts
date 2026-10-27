import type { PlannerEdit, SchedulingSettings } from '../../../packages/types/src/planning.ts'
import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import { validateApprovalRequest } from '../../../packages/types/src/plannerApproval.ts'
import { schedulingSettings } from '../../../packages/scheduling/src/settings.ts'
import { findPlannerConflicts, recommendUnits, unitsFromPlan, rowInstant, beforeTimes, type WorkUnit } from '../../../packages/scheduling/src/replanning.ts'
import { localDate, nextDate } from '../../../packages/scheduling/src/time.ts'
import { mapScheduleRow } from '../../../packages/api/src/scheduleRepository.ts'
import { openPlanner, sealPlanner } from '../_shared/plannerToken.ts'
import type { ApprovalSnapshot } from '../approve-plan/handler.ts'
export type ReplanDependencies={userId:string;secret:string;now:string;snapshot:()=>Promise<ApprovalSnapshot>;loadSettings:()=>Promise<Partial<SchedulingSettings>>}
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
export function createReplanHandler(deps:{authenticate:(request:Request)=>Promise<ReplanDependencies|null>;log?:(entry:Record<string,unknown>)=>void}){return async(request:Request)=>{
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:cors})
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
 if(request.method!=='POST')return json({error:{code:'METHOD_NOT_ALLOWED',message:'POST 요청을 사용해 주세요.'}},405)
 try{
  const auth=await deps.authenticate(request);if(!auth)return json({error:{code:'AUTH_REQUIRED',message:'다시 로그인한 뒤 재계획해 주세요.'}},401)
  const raw=await request.text();if(raw.length>1500000)throw new AnalysisError('INVALID_INPUT','요청이 너무 커요.')
  let body;try{body=JSON.parse(raw)}catch{throw new AnalysisError('INVALID_INPUT','요청 형식을 확인해 주세요.')}
  if(!body||!['remaining','reschedule','inspect'].includes(body.mode)||Object.keys(body).some(key=>!['mode','token','edits'].includes(key)))throw new AnalysisError('INVALID_INPUT','재계획 요청 형식을 확인해 주세요.')
  const [snapshot,savedSettings]=await Promise.all([auth.snapshot(),auth.loadSettings()])
  const rows=snapshot.rows.map(raw=>{const row=mapScheduleRow(raw),calendar=snapshot.calendars.find(c=>c.id===row.calendarId);if(!calendar)throw new AnalysisError('SCHEDULE_DATA_INVALID','캘린더를 확인할 수 없어요.');return {...row,kind:row.plannerApprovalKey?'task' as const:row.kind,timezone:calendar.timezone,raw}})
  if(body.mode==='remaining'){
   const payload=validateApprovalRequest({token:body.token,blocks:body.edits??[]},true)
   const signed=await openPlanner(payload.token,auth.userId,auth.secret,Date.parse(auth.now),true)
   if(signed.context?.targets)throw new AnalysisError('INVALID_INPUT','재배치는 최신 충돌 목록에서 다시 생성해 주세요.')
   const units=signed.context?.units??unitsFromPlan(signed.recommendation),prefix=signed.previewId+':'
   const known=new Set(units.map(unit=>unit.id));if(payload.blocks.some(edit=>!known.has(edit.id)))throw new AnalysisError('INVALID_INPUT','요청 형식을 확인해 주세요.')
   const zone=savedSettings.timezone??signed.recommendation.result.settings.timezone,today=localDate(auth.now,zone)
   const startDate=signed.recommendation.result.settings.startDate<today?today:signed.recommendation.result.settings.startDate
   const endDate=signed.recommendation.result.settings.endDate<startDate?nextDate(startDate,6):signed.recommendation.result.settings.endDate
   const settings=schedulingSettings({...signed.recommendation.result.settings,...savedSettings,startDate,endDate,now:auth.now})
   const saved=new Map(rows.filter(row=>row.plannerApprovalKey?.startsWith(prefix)).map(row=>[row.plannerApprovalKey!.slice(prefix.length),{end:rowInstant(row,row.timezone).end}]))
   const plan=recommendUnits(units,rows,settings,saved,payload.blocks)
   plan.progress={approved:units.filter(unit=>saved.has(unit.id)).map(unit=>({id:unit.id,title:rows.find(row=>row.plannerApprovalKey===prefix+unit.id)?.title??unit.title})),remainingCount:units.filter(unit=>!saved.has(unit.id)).length}
   // Persist user semantic edits in the signed lineage, while keeping immutable work IDs.
   const updated=units.map(unit=>{const edit=payload.blocks.find((edit:PlannerEdit)=>edit.id===unit.id);return edit&&!saved.has(unit.id)?{...unit,title:edit.title,duration:edit.durationMinutes,priority:edit.priority}:unit})
   plan.approval=await sealPlanner(plan,auth.userId,auth.secret,Date.parse(auth.now),signed.inputText,{units:updated},signed.previewId)
   return json(plan)
  }
  if(body.token!==undefined||body.edits!==undefined)throw new AnalysisError('INVALID_INPUT','재계획 요청 형식을 확인해 주세요.')
  const settings=schedulingSettings({...savedSettings,now:auth.now})
  const conflicts=findPlannerConflicts(rows,settings)
  if(body.mode==='inspect')return json({conflicts:rows.filter(row=>conflicts.includes(row.id)).map(row=>({id:row.id,title:row.title,date:row.date})),recommendation:null})
  if(!conflicts.length)return json({conflicts:[],recommendation:null})
  const affected=new Set(conflicts)
  // Move dependent AI work together; fixed/manual work is never a target.
  let changed=true;while(changed){changed=false;for(const row of rows){const meta=row.raw.planner_metadata as {dependencies?:string[]}|null;if(row.plannerApprovalKey&&row.status!=='done'&&meta?.dependencies?.some(key=>rows.some(other=>affected.has(other.id)&&other.plannerApprovalKey===key))&&!affected.has(row.id)){affected.add(row.id);changed=true}}}
  const targets=rows.filter(row=>affected.has(row.id))
  if(targets.some(row=>row.repeat!=='none'||row.allDay||rowInstant(row,row.timezone).start<Date.parse(auth.now)))throw new AnalysisError('CONSTRAINT_VIOLATION','이미 시작했거나 반복되는 AI 일정은 직접 수정해 주세요. 다른 일정은 이동하지 않았어요.')
  const latest=targets.map(row=>localDate(new Date(rowInstant(row,row.timezone).end).toISOString(),settings.timezone)).sort().at(-1)!
  settings.endDate=latest>settings.endDate?nextDate(latest,7):settings.endDate
  const units:WorkUnit[]=targets.map(row=>{const meta=row.raw.planner_metadata as {deadline?:string|null;dependencies?:string[];originGroup?:string;occurrence?:number}|null;return {id:row.id,approvalKey:row.plannerApprovalKey!,taskId:meta?.originGroup??row.plannerApprovalKey!,title:row.title,duration:row.duration??Math.round((rowInstant(row,row.timezone).end-rowInstant(row,row.timezone).start)/60000),priority:row.priority,deadline:meta?.deadline??row.dueDate??null,occurrence:meta?.occurrence??1,dependencies:meta?.dependencies??[],confirmationNeeded:meta?[]:['이전 계획의 작업 관계 정보가 없어요. 작업 순서를 확인해 주세요.'],kind:row.raw.kind==='event'?'event':'task',categoryId:row.categoryId}})
  const fixed=rows.filter(row=>!affected.has(row.id)),saved=new Map(fixed.filter(row=>row.plannerApprovalKey).map(row=>[row.plannerApprovalKey!,{end:rowInstant(row,row.timezone).end}]))
  // Include completed predecessor anchors for dependency enforcement, never as movable work.
  const anchors:WorkUnit[]=fixed.filter(row=>row.plannerApprovalKey&&units.some(unit=>unit.dependencies.includes(row.plannerApprovalKey!)||unit.taskId===(row.raw.planner_metadata as {originGroup?:string}|null)?.originGroup)).map(row=>{const meta=row.raw.planner_metadata as {originGroup?:string;occurrence?:number}|null;return {id:row.plannerApprovalKey!,approvalKey:row.plannerApprovalKey!,taskId:meta?.originGroup??row.plannerApprovalKey!,title:row.title,duration:row.duration??60,priority:row.priority,deadline:row.dueDate??null,occurrence:meta?.occurrence??1,dependencies:[],confirmationNeeded:[],kind:'task',categoryId:row.categoryId}})
  const plan=recommendUnits([...units,...anchors],fixed,settings,saved)
  plan.mode='reschedule';plan.changes=targets.map(row=>({scheduleId:row.id,title:row.title,...beforeTimes(row,row.timezone,settings.timezone),blockId:row.id,reason:conflicts.includes(row.id)?'새 일정 또는 변경된 일정과 충돌':'영향받은 선후 관계 유지'}))
  const context={units:[...units,...anchors],targets:Object.fromEntries(targets.map(row=>[row.id,{id:row.id,key:row.plannerApprovalKey!,updatedAt:row.updatedAt,calendarId:row.calendarId}]))}
  plan.approval=await sealPlanner(plan,auth.userId,auth.secret,Date.parse(auth.now),'AI 일정 충돌 재배치',context)
  return json({conflicts:rows.filter(row=>conflicts.includes(row.id)).map(row=>({id:row.id,title:row.title,date:row.date})),recommendation:plan})
 }catch(caught){const error=caught instanceof AnalysisError?caught:new AnalysisError('REPLAN_FAILED','재계획하지 못했어요. 기존 일정과 입력은 유지됩니다.');deps.log?.({code:error.code,ok:false});return json({error:{code:error.code,message:error.message}},error.code==='AUTH_REQUIRED'?401:400)}
}}
