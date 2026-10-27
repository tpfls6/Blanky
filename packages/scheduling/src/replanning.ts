import type { PlanningRecommendation, PlanningAnalysis, PlanningTask, SchedulingSettings, PlannerEdit } from '../../types/src/planning.ts'
import { AnalysisError } from '../../types/src/aiSchema.ts'
import { scheduleTasks, getBusyIntervals, type BusySchedule } from './engine.ts'
import { epoch, localInstant, zonedISO, localDate } from './time.ts'

export type WorkUnit={approvalKey?:string;id:string;taskId:string;title:string;duration:number;priority:PlanningTask['priority'];deadline:string|null;occurrence:number;dependencies:string[];confirmationNeeded:string[];kind:'task'|'event';categoryId:string|null}
export type ReplanContext={units:WorkUnit[];targets?:Record<string,{id:string;key:string;updatedAt:string;calendarId:string}>}
export function unitsFromPlan(plan:PlanningRecommendation):WorkUnit[]{
 const units:WorkUnit[]=[]
 for(const outcome of plan.result.tasks){
  const task=outcome.task,duration=task.durationMinutes??plan.result.settings.defaultDurationMinutes
  for(let occurrence=1;occurrence<=task.occurrences;occurrence++){
   const blocks=plan.result.blocks.filter(block=>block.sourceTaskId===task.id&&block.occurrence===occurrence)
   const base={taskId:task.id,title:task.title,priority:task.priority,deadline:task.deadline,occurrence,dependencies:task.dependencies,confirmationNeeded:outcome.confirmationNeeded,kind:task.sourceItem?.type??'task',categoryId:task.sourceItem?.draft.categoryId??null}
   units.push(...blocks.map(block=>({...base,id:block.id,title:block.title,duration:block.durationMinutes,priority:block.priority})))
   let remaining=duration-blocks.reduce((sum,block)=>sum+block.durationMinutes,0),part=0
   while(remaining>0){let length=Math.min(remaining,task.splittable&&plan.result.settings.allowSplit!==false?plan.result.settings.maxBlockMinutes:remaining);if(remaining>length&&remaining-length<plan.result.settings.minBlockMinutes)length-=plan.result.settings.minBlockMinutes-(remaining-length);if(length<=0)length=remaining;units.push({...base,id:task.id+':'+occurrence+':remaining:'+ ++part,duration:length});remaining-=length}
  }
 }
 return units
}
export function findPlannerConflicts(rows:(BusySchedule&{plannerApprovalKey?:string|null})[],settings:SchedulingSettings):string[]{
 const ids:string[]=[]
 for(const row of rows){
  if(!row.plannerApprovalKey||row.status==='done')continue
  const mine=getBusyIntervals([row],settings).intervals.filter(interval=>interval.end>epoch(settings.now))
  const others=getBusyIntervals(rows.filter(other=>other.id!==row.id),settings).intervals
  if(mine.some(a=>others.some(b=>a.start<b.end&&a.end>b.start)))ids.push(row.id)
 }
 return ids.sort()
}
/** Stable work-unit IDs survive regeneration; saved IDs are never allocated again. */
export function recommendUnits(units:WorkUnit[],existing:BusySchedule[],settings:SchedulingSettings,saved:Map<string,{end:number}>=new Map(),edits:PlannerEdit[]=[]):PlanningRecommendation{
 const remaining=units.filter(unit=>!saved.has(unit.id))
 if(settings.allowSplit===false&&remaining.some(unit=>remaining.some(other=>other!==unit&&other.taskId===unit.taskId&&other.occurrence===unit.occurrence)))throw new AnalysisError('SPLIT_DISABLED','이전 계획에서 나뉜 작업이 남아 있어요. 분할을 허용하거나 남은 작업 범위를 조정해 주세요.')
 if(!remaining.length)throw new AnalysisError('NO_REMAINING','남은 작업이 없어요.')
 if(remaining.length>200)throw new AnalysisError('REPLAN_LIMIT','한 번에 재계획할 작업은 200개까지예요. 계획 범위를 나누어 주세요.')
 const ids=new Map(remaining.map((unit,index)=>[unit.id,'work_'+index]))
 const tasks:PlanningTask[]=remaining.map(unit=>{
  const edit=edits.find(edit=>edit.id===unit.id)
  const predecessors=units.filter(other=>unit.dependencies.includes(other.taskId)||unit.dependencies.includes(other.id)||!!other.approvalKey&&unit.dependencies.includes(other.approvalKey))
  const dependencyEnd=Math.max(0,...predecessors.flatMap(other=>saved.has(other.id)?[saved.get(other.id)!.end+settings.breakMinutes*60000]:[]))
  return {id:ids.get(unit.id)!,title:edit?.title.trim()||unit.title,sourceItem:null,durationMinutes:edit?.durationMinutes??unit.duration,durationIsEstimate:false,priority:edit?.priority??unit.priority,priorityIsEstimate:false,deadline:unit.deadline,deadlineIsEstimate:false,occurrences:1,dependencies:predecessors.filter(other=>!saved.has(other.id)).map(other=>ids.get(other.id)??'missing_dependency').concat(unit.dependencies.filter(dependency=>!units.some(other=>other.id===dependency||other.taskId===dependency||other.approvalKey===dependency)).map(()=> 'missing_dependency')),splittable:false,preferredChunkMinutes:null,confirmationNeeded:unit.confirmationNeeded,originGroup:unit.taskId,repeatIndex:unit.occurrence,excludedDates:settings.repeatOnSeparateDays?units.filter(other=>other.taskId===unit.taskId&&other.occurrence!==unit.occurrence&&saved.has(other.id)).map(other=>localDate(new Date(saved.get(other.id)!.end-1).toISOString(),settings.timezone)):[],notBefore:dependencyEnd?new Date(dependencyEnd).toISOString():null}
 })
 const result=scheduleTasks(tasks,existing,settings)
 const analysis:PlanningAnalysis={version:1,intent:'PLAN_TASKS',analysis:{version:1,route:'ai',items:tasks.map((task,index)=>({id:task.id,type:remaining[index].kind,source:'ai',confidence:1,draft:{title:task.title,date:null,startTime:null,endTime:null,endDate:null,dueDate:null,categoryId:remaining[index].categoryId},evidence:{date:null,startTime:null,endTime:null,endDate:null,dueDate:null},categoryReason:null,uncertainties:[]})),relations:[],warnings:['기존 작업과 사용자 수정값으로 다시 계산한 추천입니다. 자동 학습 결과가 아니에요.']},tasks:tasks.map(task=>({sourceTaskId:task.id,durationMinutes:task.durationMinutes,durationIsEstimate:false,durationEvidence:task.durationMinutes+'분',occurrences:1,occurrencesEvidence:null,priority:task.priority,priorityIsEstimate:false,deadline:task.deadline,deadlineIsEstimate:false,deadlineEvidence:task.deadline,splittable:false,preferredChunkMinutes:null,notes:task.confirmationNeeded}))}
 for(const outcome of result.tasks)outcome.task.sourceItem=analysis.analysis.items.find(item=>item.id===outcome.task.id)!
 for(const block of result.blocks){const unit=remaining[tasks.findIndex(task=>task.id===block.sourceTaskId)];block.id=unit.id;block.occurrence=unit.occurrence}
 // Each unit represents one approved fragment; repetition spacing is checked at its original task boundary below.
 result.warnings.push(...analysis.analysis.warnings)
 return {analysis,result,mode:'remaining'}
}
export function rowInstant(row:BusySchedule,zone:string){if(!row.startTime||!row.endTime)throw new AnalysisError('SCHEDULE_DATA_INVALID','시간이 없는 일정은 재배치할 수 없어요.');return {start:localInstant(row.date,row.startTime,zone),end:localInstant(row.endDate??row.date,row.endTime,zone)}}
export function beforeTimes(row:BusySchedule,zone:string,targetZone:string){const value=rowInstant(row,zone);return {beforeStart:zonedISO(value.start,targetZone),beforeEnd:zonedISO(value.end,targetZone)}}
