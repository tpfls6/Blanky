import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalFixture } from './fixtures/planner.ts'
import { schedulingSettings } from '../packages/scheduling/src/settings.ts'
import { scheduleTasks } from '../packages/scheduling/src/engine.ts'
import { recommendUnits, unitsFromPlan, findPlannerConflicts } from '../packages/scheduling/src/replanning.ts'
import { planningPreferences, manualHistorySamples } from '../packages/scheduling/src/preferences.ts'
import { createPlanningRecommendation } from '../packages/scheduling/src/planner.ts'
import { validatePlanningRecommendation } from '../packages/types/src/planningSchema.ts'
import { editsFromRecommendation, validatePlannerEdits } from '../packages/scheduling/src/approval.ts'
import { sealPlanner, openPlanner } from '../supabase/functions/_shared/plannerToken.ts'
import { createReplanHandler } from '../supabase/functions/replan-tasks/handler.ts'
import { createApprovePlanHandler } from '../supabase/functions/approve-plan/handler.ts'
import type { ApprovalSnapshot } from '../supabase/functions/approve-plan/handler.ts'
const now='2026-10-13T00:00:00Z',secret='test-secret',userId='owner',plan=approvalFixture()
const base=()=>schedulingSettings({...plan.result.settings,now})
const task=()=>structuredClone(plan.result.tasks[0].task)
const snapshot=():ApprovalSnapshot=>({revision:'one',rows:[],calendars:[{id:'calendar',timezone:'Asia/Seoul',is_default_personal:true}]})
const raw=(id:string,ai=true)=>({id,user_id:userId,calendar_id:'calendar',kind:'task',title:id,date:'2026-10-13',start_time:'09:00',end_time:'10:00',duration_minutes:60,priority:'medium',status:'todo',created_at:now,updated_at:now,planner_approval_key:ai?'old:'+id:null,planner_metadata:ai?{dependencies:[],deadline:null}:null})
const request=(body:unknown)=>new Request('http://test',{method:'POST',body:JSON.stringify(body)})

test('new account optional timezone does not erase validated defaults',()=>{assert.equal(schedulingSettings({timezone:undefined},now).timezone,'Asia/Seoul')})
test('saved preferences map only allowed constraints and retain timezone',()=>{
 const value=planningPreferences({timezone:'America/New_York',dayStartTime:'10:00',dayEndTime:'18:00',defaultDuration:45,settings:{scheduling:{workDays:[2,4],allowSplit:false,placementMode:'focus',preferredStartTime:'14:00',preferredEndTime:'16:00',now:'forged',startDate:'forged'}}} as never)
 assert.equal(value.timezone,'America/New_York');assert.equal(value.allowSplit,false);assert.equal(value.defaultDurationMinutes,45);assert.equal(value.now,undefined);assert.equal(value.startDate,undefined)
 assert.throws(()=>schedulingSettings({...value,preferredEndTime:'09:00'},now))
})
test('work days/hours, preferred focus window and daily budget are respected deterministically',()=>{
 const settings={...base(),workDays:[2,3],dayStartTime:'10:00',dayEndTime:'18:00',maxDailyMinutes:60,placementMode:'focus' as const,preferredStartTime:'14:00',preferredEndTime:'16:00'}
 const tasks=[task(),{...task(),id:'other'}],result=scheduleTasks(tasks,[],settings)
 assert.equal(result.blocks[0].startAt.slice(11,16),'14:00');assert.equal(result.blocks[1].startAt.slice(0,10),'2026-10-14')
 assert.deepEqual(scheduleTasks(tasks,[],settings),result)
})
test('split setting changes allocation without inventing or dropping work',()=>{
 const long={...task(),durationMinutes:120},settings={...base(),maxBlockMinutes:60}
 assert.equal(scheduleTasks([long],[],{...settings,allowSplit:false}).blocks.length,0)
 assert.equal(scheduleTasks([long],[],{...settings,allowSplit:true}).blocks.length,2)
})
test('saved user constraints beat request and AI estimates; explicit task priority is preserved',async()=>{
 const analysis=structuredClone(plan.analysis);analysis.tasks[0].priority='high';analysis.tasks[0].priorityIsEstimate=false
 const result=await createPlanningRecommendation({text:'일정 알아서 짜줘',settings:{maxDailyMinutes:600}}, {now,provider:{analyzeTasks:async()=>analysis},loadSettings:async()=>({...base(),maxDailyMinutes:45,defaultDurationMinutes:45}),loadSchedules:async()=>[],loadCategories:async()=>[]})
 assert.equal(result.result.settings.maxDailyMinutes,45);assert.equal(result.result.tasks[0].task.durationMinutes,45);assert.equal(result.result.tasks[0].task.priority,'high')
})
test('history opt-in uses repeated direct edits only for estimated fields and labels provenance',async()=>{
 const analysis=structuredClone(plan.analysis)
 const result=await createPlanningRecommendation({text:'일정 알아서 짜줘'}, {now,provider:{analyzeTasks:async()=>analysis},loadSettings:async()=>({...base(),useManualHistory:true}),loadSchedules:async()=>[],loadCategories:async()=>[],loadManualHistory:async()=>[{title:'one',duration:45,priority:'high'},{title:'one',duration:30,priority:'low'}]})
 assert.equal(result.result.tasks[0].task.durationMinutes,45);assert.equal(result.result.tasks[0].task.priority,'high');assert.ok(result.result.tasks[0].task.confirmationNeeded.some(value=>value.includes('자동 학습')))
})
test('remaining unit IDs survive regeneration, user changes persist, and saved work is excluded',()=>{
 const units=unitsFromPlan(plan),saved=new Map([[units[0].id,{end:Date.parse(plan.result.blocks[0].endAt)}]])
 const edits=editsFromRecommendation(plan);edits[1].title='자동 학습';edits[1].priority='high';edits[1].durationMinutes=30
 const result=validatePlanningRecommendation(recommendUnits(units,[],base(),saved,edits))
 assert.equal(result.result.blocks.length,1);assert.equal(result.result.blocks[0].id,units[1].id);assert.equal(result.result.blocks[0].title,'자동 학습');assert.equal(result.result.blocks[0].durationMinutes,30)
})
test('remaining repetitions stay on separate days including already approved occurrence',()=>{
 const repeated={...task(),occurrences:2},p={...plan,result:scheduleTasks([repeated],[],base()),analysis:{...plan.analysis,analysis:{...plan.analysis.analysis,items:[plan.analysis.analysis.items[0]]},tasks:[{...plan.analysis.tasks[0],occurrences:2,occurrencesEvidence:'2?'}]}}
 const units=unitsFromPlan(p),saved=new Map([[units[0].id,{end:Date.parse(p.result.blocks[0].endAt)}]])
 const result=recommendUnits(units,[],base(),saved)
 assert.notEqual(result.result.blocks[0].startAt.slice(0,10),p.result.blocks[0].startAt.slice(0,10))
})
test('new fixed event detects AI conflict without marking fixed event movable',()=>{
 const ai={id:'ai',plannerApprovalKey:'key',date:'2026-10-13',startTime:'09:00',endTime:'10:00',duration:60,status:'todo' as const,kind:'task' as const}
 const fixed={...ai,id:'fixed',kind:'event' as const,plannerApprovalKey:null}
 assert.deepEqual(findPlannerConflicts([ai,fixed],base()),['ai']);assert.deepEqual(findPlannerConflicts([{...ai,status:'done'},fixed],base()),[])
})
test('replan server issues read-only signed comparison and approval targets original AI row',async()=>{
 const state={...snapshot(),rows:[raw('ai'),raw('fixed',false)]}
 const handler=createReplanHandler({authenticate:async()=>({userId,secret,now,snapshot:async()=>state,loadSettings:async()=>base()})})
 const before=structuredClone(state),response=await handler(request({mode:'reschedule'}));assert.equal(response.status,200)
 const body=await response.json(),recommended=validatePlanningRecommendation(body.recommendation);assert.deepEqual(state,before);assert.equal(recommended.changes?.[0].scheduleId,'ai');assert.ok(recommended.result.blocks[0].startAt.slice(11,16)>='10:10')
 const signed=await openPlanner(recommended.approval!.token,userId,secret,Date.parse(now));assert.equal(signed.context?.targets?.ai.key,'old:ai')
 let commits=0
 const approval=createApprovePlanHandler({authenticate:async()=>({userId,secret,now,snapshot:async()=>state,commit:async(_revision,rows)=>{commits++;assert.equal(rows[0].targetId,'ai');assert.equal(rows[0].key,'old:ai');return [{...raw('ai'),planner_approval_key:rows[0].key}]}})})
 const applied=await approval(request({token:recommended.approval!.token,blocks:editsFromRecommendation(recommended).map(edit=>({...edit,confirmed:true}))}));assert.equal(applied.status,200);assert.equal(commits,1)
})
test('latest settings/conflicts block approval and foreign signatures cannot inspect another user plan',async()=>{
 const signed=await sealPlanner(plan,userId,secret,Date.parse(now))
 const handler=createReplanHandler({authenticate:async()=>({userId:'other',secret,now,snapshot:async()=>snapshot(),loadSettings:async()=>base()})})
 assert.equal((await handler(request({mode:'remaining',token:signed.token,edits:[]}))).status,400)
 let commits=0
 const approval=createApprovePlanHandler({authenticate:async()=>({userId,secret,now,loadSettings:async()=>({dayStartTime:'15:00'}),snapshot:async()=>snapshot(),commit:async()=>{commits++;return []}})})
 assert.equal((await approval(request({token:signed.token,blocks:editsFromRecommendation(plan).map(edit=>({...edit,confirmed:true}))}))).status,409);assert.equal(commits,0)
})
test('remaining server preserves lineage key and does not write while regenerating',async()=>{
 const signed=await sealPlanner(plan,userId,secret,Date.parse(now)),draft=editsFromRecommendation(plan)
 const state={...snapshot(),rows:[{...raw('saved'),planner_approval_key:signed.previewId+':'+draft[0].id}]}
 const handler=createReplanHandler({authenticate:async()=>({userId,secret,now,snapshot:async()=>state,loadSettings:async()=>base()})})
 const before=structuredClone(state),response=await handler(request({mode:'remaining',token:signed.token,edits:draft}));assert.equal(response.status,200)
 const next=validatePlanningRecommendation(await response.json());assert.equal(next.approval!.previewId,signed.previewId);assert.equal(next.result.blocks.length,1);assert.equal(next.result.blocks[0].id,draft[1].id);assert.deepEqual(state,before)
 validatePlannerEdits(next,editsFromRecommendation(next).map(edit=>({...edit,confirmed:true})),[],now)
})

test('expired approval can renew remaining work but cannot authorize a write',async()=>{
 const signed=await sealPlanner(plan,userId,secret,Date.parse(now)),later=new Date(Date.parse(now)+3*3600000).toISOString()
 await assert.rejects(openPlanner(signed.token,userId,secret,Date.parse(later)),{code:'PREVIEW_EXPIRED'})
 const handler=createReplanHandler({authenticate:async()=>({userId,secret,now:later,snapshot:async()=>snapshot(),loadSettings:async()=>({})})})
 const response=await handler(request({mode:'remaining',token:signed.token,edits:[]}));assert.equal(response.status,200)
 const renewed=validatePlanningRecommendation(await response.json());assert.equal(renewed.approval!.previewId,signed.previewId);assert.ok(Date.parse(renewed.approval!.expiresAt)>Date.parse(later))
})
test('deleted predecessor stays unresolved and changed split policy cannot silently split leftover work',()=>{
 const units=unitsFromPlan(plan);units[1].dependencies=['deleted-key']
 const result=recommendUnits(units,[],base());assert.equal(result.result.tasks[1].status,'unscheduled');assert.equal(result.result.tasks[1].reason,'DEPENDENCY_UNSCHEDULED')
 assert.throws(()=>recommendUnits([units[0],{...units[0],id:'second-fragment'}],[],{...base(),allowSplit:false}),{code:'SPLIT_DISABLED'})
})

test('history separates explicit Planner edits from generated and automatic reschedule output',()=>{
 const value={title:'one',duration_minutes:45,priority:'high'}
 const samples=manualHistorySamples([{source:'manual',action:'updated',after_data:value},{source:'ai_chat',action:'created',after_data:{...value,planner_metadata:{userEdited:true}}},{source:'ai_chat',action:'updated',after_data:{...value,planner_metadata:{userEdited:false,hasUserEdits:true}}},{source:'ai_chat',action:'created',after_data:value}])
 assert.equal(samples.length,2);assert.equal(samples[0].duration,45)
})

test('200 work units retain IDs, dependencies and full validation; provider analysis stays capped at 20',()=>{
 const one=unitsFromPlan(plan)[0],units=Array.from({length:200},(_,index)=>({...one,id:'unit-'+index,taskId:'task-'+index,duration:25,dependencies:index?['task-'+(index-1)]:[]}))
 const settings={...base(),endDate:'2026-10-22',breakMinutes:0,maxDailyMinutes:720}
 const result=validatePlanningRecommendation(recommendUnits(units,[],settings));assert.equal(result.result.tasks.length,200);assert.equal(result.result.blocks.length,200);assert.equal(result.result.blocks.at(-1)!.id,'unit-199')
 assert.equal(validatePlannerEdits(result,editsFromRecommendation(result).map(edit=>({...edit,confirmed:true})),[],now).length,200)
 const forged={...result};delete forged.mode;assert.throws(()=>validatePlanningRecommendation(forged))
 assert.throws(()=>recommendUnits([...units,{...one,id:'unit-201'}],[],settings),{code:'REPLAN_LIMIT'})
})
