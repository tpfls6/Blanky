import { schedulingSettings } from '../../../packages/scheduling/src/settings.ts'
import type { SchedulingSettings } from '../../../packages/types/src/planning.ts'
import type { PlannerEdit } from '../../../packages/types/src/planning.ts'
import { validateApprovalRequest } from '../../../packages/types/src/plannerApproval.ts'
import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import { validatePlannerEdits } from '../../../packages/scheduling/src/approval.ts'
import { localInstant, zonedISO } from '../../../packages/scheduling/src/time.ts'
import { mapScheduleRow } from '../../../packages/api/src/scheduleRepository.ts'
import type { BusySchedule } from '../../../packages/scheduling/src/engine.ts'
import { openPlanner } from '../_shared/plannerToken.ts'

export type ApprovalSnapshot = { revision:string;rows:Record<string,unknown>[];calendars:{id:string;timezone:string;is_default_personal:boolean}[] }
export type ApprovalDependencies = { userId:string;secret:string;now:string;loadSettings?:()=>Promise<Partial<SchedulingSettings>>;snapshot:()=>Promise<ApprovalSnapshot>;commit:(revision:string,rows:Record<string,unknown>[])=>Promise<Record<string,unknown>[]> }
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
export function createApprovePlanHandler(deps:{authenticate:(request:Request)=>Promise<ApprovalDependencies|null>;log?:(entry:Record<string,unknown>)=>void}) {
 return async(request:Request)=>{
  const requestId=crypto.randomUUID(),json=(value:unknown,status=200)=>Response.json(value,{status,headers:{...cors,'X-Request-Id':requestId}})
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  if(request.method!=='POST')return json({error:{code:'METHOD_NOT_ALLOWED',message:'POST 요청만 지원합니다.'}},405)
  try {
   const auth=await deps.authenticate(request)
   if(!auth)return json({error:{code:'AUTH_REQUIRED',message:'로그인이 만료되었어요. 다시 로그인한 뒤 적용해 주세요.'}},401)
   const raw=await request.text();if(raw.length>1500000)throw new AnalysisError('INVALID_INPUT','추천 요청이 너무 커요.')
   let payload;try{payload=validateApprovalRequest(JSON.parse(raw))}catch{throw new AnalysisError('INVALID_INPUT','수정한 일정 형식을 확인해 주세요.')}
   const signed=await openPlanner(payload.token,auth.userId,auth.secret,Date.parse(auth.now))
   const snapshot=await auth.snapshot() // Always fresh, never trusts browser's schedule list.
   if(auth.loadSettings){
    const current=await auth.loadSettings()
    if(Object.entries(current).some(([name,value])=>value!==undefined&&JSON.stringify(value)!==JSON.stringify(signed.recommendation.result.settings[name as keyof SchedulingSettings])))throw new AnalysisError('SCHEDULE_CONFLICT','작업 시간 설정이 바뀌었어요. 새 설정으로 다시 추천해 주세요.')
    signed.recommendation.result.settings=schedulingSettings({...signed.recommendation.result.settings,...current,now:auth.now})
   }
   const targets=signed.context?.targets??{}
   for(const edit of payload.blocks.filter(row=>row.included)){
    const target=targets[edit.id];if(!target)continue
    const current=snapshot.rows.find(row=>row.id===target.id)
    if(!current||current.user_id!==auth.userId||current.planner_approval_key!==target.key||current.status==='done')throw new AnalysisError('SCHEDULE_CONFLICT','재배치 대상 일정이 변경되거나 삭제되었어요. 다시 확인해 주세요.')
   }
   const calendar=snapshot.calendars.find(row=>row.is_default_personal)
   if(!calendar)throw new AnalysisError('CALENDAR_REQUIRED','개인 캘린더를 불러오지 못했어요.')
   const zone=signed.recommendation.result.settings.timezone,prefix=signed.previewId+':'
   const saved=snapshot.rows.filter(row=>typeof row.planner_approval_key==='string'&&row.planner_approval_key.startsWith(prefix)&&signed.recommendation.result.blocks.some(block=>block.id===String(row.planner_approval_key).slice(prefix.length)))
   const replayIds=saved.map(row=>String(row.planner_approval_key).slice(prefix.length))
   const selectedIds=payload.blocks.filter(row=>row.included).map(row=>row.id)
   const actualEdit=(row:Record<string,unknown>):PlannerEdit=>{
    const sourceZone=snapshot.calendars.find(calendar=>calendar.id===row.calendar_id)?.timezone
    if(!sourceZone)throw new AnalysisError('SCHEDULE_DATA_INVALID','캘린더 타임존을 확인할 수 없어요.')
    const start=zonedISO(localInstant(String(row.date),String(row.start_time).slice(0,5),sourceZone),zone)
    const end=zonedISO(localInstant(String(row.end_date??row.date),String(row.end_time).slice(0,5),sourceZone),zone)
    return {id:String(row.planner_approval_key).slice(prefix.length),title:String(row.title),date:start.slice(0,10),startTime:start.slice(11,16),endTime:end.slice(11,16),durationMinutes:Number(row.duration_minutes),priority:row.priority as PlannerEdit['priority'],included:true,confirmed:true}
   }
   const already=saved.filter(row=>!selectedIds.includes(String(row.planner_approval_key).slice(prefix.length))).map(actualEdit)
   const existing:BusySchedule[]=snapshot.rows.filter(row=>!payload.blocks.some(edit=>edit.included&&targets[edit.id]?.id===row.id)).filter(row=>!selectedIds.includes(String(row.planner_approval_key??'').slice(prefix.length))||!String(row.planner_approval_key??'').startsWith(prefix)).map(row=>{
    const calendar=snapshot.calendars.find(calendar=>calendar.id===row.calendar_id)
    if(!calendar)throw new AnalysisError('SCHEDULE_DATA_INVALID','캘린더를 확인할 수 없어요.')
    return {...mapScheduleRow(row),...(row.planner_approval_key?{kind:'task' as const}:{}),timezone:calendar.timezone}
   })
   const validated=validatePlannerEdits(signed.recommendation,payload.blocks,existing,auth.now,already,replayIds)
   const rows=validated.map(row=>{
    const target=targets[row.edit.id]
    const targetCalendar=target?snapshot.calendars.find(calendar=>calendar.id===target.calendarId):calendar
    if(!targetCalendar)throw new AnalysisError('SCHEDULE_DATA_INVALID','대상 캘린더를 확인해 주세요.')
    // The existing DB stores wall clocks; refuse ambiguous target calendar clock values.
    for(const instant of [row.start,row.end]) {
     const local=zonedISO(instant,targetCalendar.timezone)
     if(localInstant(local.slice(0,10),local.slice(11,16),targetCalendar.timezone)!==instant)throw new AnalysisError('CONSTRAINT_VIOLATION','캘린더에 정확하게 저장할 수 없는 DST 시각이에요.')
    }
    const unit=signed.context?.units.find(unit=>unit.id===row.edit.id)
    const dependencies=unit?signed.context!.units.filter(other=>unit.dependencies.includes(other.taskId)||unit.dependencies.includes(other.id)||!!other.approvalKey&&unit.dependencies.includes(other.approvalKey)).map(other=>targets[other.id]?.key??(signed.recommendation.mode==='reschedule'?other.taskId:prefix+other.id)):signed.recommendation.result.blocks.filter(block=>row.source.task.dependencies.includes(block.sourceTaskId)).map(block=>prefix+block.id)
    const userEdited=row.edit.title!==row.block.title||row.edit.priority!==row.block.priority||row.edit.durationMinutes!==row.block.durationMinutes||row.edit.date!==row.block.startAt.slice(0,10)||row.edit.startTime!==row.block.startAt.slice(11,16)
    const oldMetadata=target?snapshot.rows.find(item=>item.id===target.id)?.planner_metadata as {userEdited?:boolean;hasUserEdits?:boolean}|null:null
    return {...(target?{targetId:target.id,expectedUpdatedAt:target.updatedAt}:{}),metadata:{lastPreviewId:signed.previewId,lastBlockId:row.edit.id,deadline:row.source.task.deadline,dependencies,originGroup:signed.recommendation.mode==='reschedule'?unit?.taskId:prefix+(unit?.taskId??row.source.task.id),occurrence:unit?.occurrence??row.block.occurrence,origin:'ai_recommendation',userEdited,hasUserEdits:userEdited||oldMetadata?.hasUserEdits===true||oldMetadata?.userEdited===true},key:target?.key??prefix+row.edit.id,title:row.edit.title.trim(),startAt:zonedISO(row.start,zone),endAt:zonedISO(row.end,zone),durationMinutes:row.edit.durationMinutes,priority:row.edit.priority,kind:row.source.task.sourceItem?.type??'task',categoryId:row.source.task.sourceItem?.draft.categoryId??null,dueDate:row.source.task.sourceItem?.type==='event'?null:row.source.task.deadline,sourceText:signed.inputText??signed.recommendation.analysis.analysis.items.map(item=>item.draft.title).join(' · ')}
   })
   const committed=await auth.commit(snapshot.revision,rows)
   return json({schedules:committed,applied:committed.map(row=>({blockId:Object.entries(targets).find(([,target])=>target.id===row.id)?.[0]??String(row.planner_approval_key).slice(prefix.length),scheduleId:String(row.id)}))})
  } catch(caught) {
   const error=caught instanceof AnalysisError?caught:new AnalysisError('APPROVAL_FAILED','저장을 완료하지 못했어요. 입력과 추천은 유지되며 같은 요청으로 다시 시도할 수 있어요.')
   deps.log?.({requestId,code:error.code,ok:false})
   return json({error:{code:error.code,message:error.message},requestId},error.code==='AUTH_REQUIRED'?401:error.code==='SCHEDULE_CONFLICT'?409:400)
  }
 }
}
