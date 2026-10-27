import type { PlanningRecommendation,PlanningAnalysis,PlanningTask } from '../../packages/types/src/planning.ts'
import {scheduleTasks} from '../../packages/scheduling/src/engine.ts'
import {schedulingSettings} from '../../packages/scheduling/src/settings.ts'
import {localDate,nextDate} from '../../packages/scheduling/src/time.ts'
export function approvalFixture(now="2026-10-13T00:00:00Z"):PlanningRecommendation {
 const item=(id:string)=>({id,type:'task' as const,source:'ai' as const,confidence:0.9,draft:{title:id,date:null,startTime:null,endTime:null,dueDate:null,endDate:null,categoryId:null},evidence:{date:null,startTime:null,endTime:null,dueDate:null,endDate:null},categoryReason:null,uncertainties:[]})
 const metadata=(sourceTaskId:string)=>({sourceTaskId,durationMinutes:60,durationIsEstimate:true,durationEvidence:null,occurrences:1,occurrencesEvidence:null,priority:'medium' as const,priorityIsEstimate:true,deadline:null,deadlineIsEstimate:false,deadlineEvidence:null,splittable:true,preferredChunkMinutes:null,notes:[]})
 const analysis:PlanningAnalysis={version:1,intent:'PLAN_TASKS',analysis:{version:1,route:'ai',items:[item('one'),item('two')],relations:[],warnings:[]},tasks:[metadata('one'),metadata('two')]}
 const tasks:PlanningTask[]=analysis.tasks.map(meta=>({id:meta.sourceTaskId,title:meta.sourceTaskId,sourceItem:item(meta.sourceTaskId),durationMinutes:60,durationIsEstimate:true,priority:'medium',priorityIsEstimate:true,deadline:null,deadlineIsEstimate:false,occurrences:1,dependencies:[],splittable:true,preferredChunkMinutes:null,confirmationNeeded:[]}))
 return {analysis,result:scheduleTasks(tasks,[],schedulingSettings({startDate:localDate(now,'Asia/Seoul'),endDate:nextDate(localDate(now,'Asia/Seoul'),2),now}))}
}
