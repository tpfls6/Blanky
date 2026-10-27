import assert from 'node:assert/strict'
import { withPlannerTestUser } from './planner-test-user.mjs'
import { createPreferenceRepository } from '../packages/api/src/preferenceRepository.ts'
import { validatePlanningRecommendation } from '../packages/types/src/planningSchema.ts'
import { editsFromRecommendation } from '../packages/scheduling/src/approval.ts'
import { localDate,nextDate } from '../packages/scheduling/src/time.ts'
const invoke=async(client,name,body)=>{const response=await client.functions.invoke(name,{body});if(response.error){const value=await response.error.context?.clone?.().json?.().catch(()=>null);throw new Error(name+': '+(value?.error?.code??response.error.name))}return response.data}
await withPlannerTestUser(async({client,userId,admin,email,password})=>{
 const repo=createPreferenceRepository(client),initial=await repo.get(userId)??{userId,locale:'ko',notificationsEnabled:false,theme:'light',accentColor:'blue',scheduleDefaultView:'all',weekStartsOn:0,autoClassification:true,autoSaveAfterClassification:false,settings:{},updatedAt:new Date().toISOString()}
 const preference={...initial,timezone:'Asia/Seoul',dayStartTime:'09:00',dayEndTime:'21:00',defaultDuration:30,settings:{...initial.settings,scheduling:{workDays:[1,2,3,4,5,6,7],maxDailyMinutes:120,breakMinutes:10,allowSplit:false,placementMode:'focus',preferredStartTime:'14:00',preferredEndTime:'16:00'}}}
 await repo.save(preference);const loaded=await repo.get(userId);assert.equal(loaded.settings.scheduling.preferredStartTime,'14:00');assert.equal(loaded.defaultDuration,30)
 await client.auth.signOut();const relogin=await client.auth.signInWithPassword({email,password});assert.equal(relogin.error,null);assert.equal((await repo.get(userId)).settings.scheduling.preferredStartTime,'14:00')
 const startDate=nextDate(localDate(new Date().toISOString(),'Asia/Seoul'),1),endDate=nextDate(startDate,2)
 const text='자료 정리 30분, 발표 연습 30분 해야 해. 내일부터 일정 알아서 짜줘.'
 const plan=validatePlanningRecommendation(await invoke(client,'plan-tasks',{text,settings:{startDate,endDate,maxDailyMinutes:600}}),text)
 assert.equal(plan.result.settings.maxDailyMinutes,120);assert.equal(plan.result.settings.allowSplit,false);assert.equal(plan.result.blocks.length,2);assert.equal(plan.result.blocks[0].startAt.slice(11,16),'14:00')
 assert.equal((await client.from('schedules').select('id')).data.length,0)
 const edits=editsFromRecommendation(plan).map(edit=>({...edit,confirmed:true}))
 const partial=await invoke(client,'approve-plan',{token:plan.approval.token,blocks:[edits[0]]});assert.equal(partial.schedules.length,1)
 edits[1].title='사용자 수정 남은 작업';edits[1].priority='high'
 const remaining=validatePlanningRecommendation(await invoke(client,'replan-tasks',{mode:'remaining',token:plan.approval.token,edits}))
 assert.equal(remaining.approval.previewId,plan.approval.previewId);assert.equal(remaining.result.blocks.length,1);assert.equal(remaining.result.blocks[0].id,edits[1].id);assert.equal(remaining.result.blocks[0].title,edits[1].title);assert.equal(remaining.result.blocks[0].priority,'high')
 assert.equal((await client.from('schedules').select('id')).data.length,1)
 const rest=editsFromRecommendation(remaining).map(edit=>({...edit,confirmed:true})),restBody={token:remaining.approval.token,blocks:rest}
 await invoke(client,'approve-plan',restBody);await invoke(client,'approve-plan',restBody);assert.equal((await client.from('schedules').select('id')).data.length,2)
 const ai=partial.schedules[0]
 const fixed=await client.from('schedules').insert({user_id:userId,title:'고정 일정 테스트',kind:'event',date:ai.date,start_time:ai.start_time,end_time:ai.end_time,duration_minutes:ai.duration_minutes}).select('*').single();assert.equal(fixed.error,null)
 const inspect=await invoke(client,'replan-tasks',{mode:'inspect'});assert.ok(inspect.conflicts.some(row=>row.id===ai.id))
 const before=(await client.from('schedules').select('*').order('id')).data
 const preview=await invoke(client,'replan-tasks',{mode:'reschedule'}),move=validatePlanningRecommendation(preview.recommendation)
 assert.ok(move.changes.some(change=>change.scheduleId===ai.id));assert.ok(!move.changes.some(change=>change.scheduleId===fixed.data.id))
 assert.deepEqual((await client.from('schedules').select('*').order('id')).data,before)
 const changes=editsFromRecommendation(move).map(edit=>({...edit,confirmed:true})),moveBody={token:move.approval.token,blocks:changes}
 await repo.save({...preference,dayEndTime:'20:00'})
 const settingsChanged=await client.functions.invoke('approve-plan',{body:moveBody});assert.ok(settingsChanged.error);assert.equal((await settingsChanged.error.context.json()).error.code,'SCHEDULE_CONFLICT')
 await repo.save(preference)
 const newConflict=await client.from('schedules').insert({user_id:userId,title:'승인 직전 충돌 테스트',kind:'event',date:changes[0].date,start_time:changes[0].startTime,end_time:changes[0].endTime}).select('id').single();assert.equal(newConflict.error,null)
 const blocked=await client.functions.invoke('approve-plan',{body:moveBody});assert.ok(blocked.error);assert.equal((await blocked.error.context.json()).error.code,'SCHEDULE_CONFLICT')
 assert.equal((await client.from('schedules').delete().eq('id',newConflict.data.id)).error,null)
 const moved=await invoke(client,'approve-plan',moveBody);assert.ok(moved.schedules.some(row=>row.id===ai.id));const again=await invoke(client,'approve-plan',moveBody);assert.deepEqual(again.schedules.map(row=>row.id),moved.schedules.map(row=>row.id))
 const after=(await client.from('schedules').select('*').order('id')).data;assert.equal(after.length,3);assert.deepEqual(after.find(row=>row.id===fixed.data.id),fixed.data);assert.notEqual(after.find(row=>row.id===ai.id).start_time,ai.start_time)
 const history=(await client.from('schedule_changes').select('*').eq('schedule_id',ai.id)).data;assert.ok(history.some(row=>row.action==='updated'&&row.source==='ai_chat'))
 const atomicBefore=(await client.from('schedules').select('*').order('id')).data,revision=await client.rpc('planner_snapshot',{})
 const aiRows=atomicBefore.filter(row=>row.planner_approval_key)
 const updateRows=aiRows.map((row,index)=>({targetId:row.id,expectedUpdatedAt:row.updated_at,key:row.planner_approval_key,title:'atomic rollback only',startAt:row.date+'T'+row.start_time.slice(0,5)+':00+09:00',endAt:row.date+'T'+row.end_time.slice(0,5)+':00+09:00',durationMinutes:row.duration_minutes,priority:index?'unsupported':'medium'}))
 const rollback=await admin.rpc('approve_planner',{p_user_id:userId,p_revision:revision.data.revision,p_rows:updateRows});assert.ok(rollback.error);assert.deepEqual((await client.from('schedules').select('*').order('id')).data,atomicBefore)
 const forge=await client.from('schedules').update({planner_metadata:{dependencies:[]}}).eq('id',ai.id);assert.ok(forge.error)
 await withPlannerTestUser(async({client:other})=>{
  assert.equal((await other.from('schedules').select('id').eq('user_id',userId)).data.length,0)
  assert.equal(await createPreferenceRepository(other).get(userId),null)
  const foreign=await other.functions.invoke('replan-tasks',{body:{mode:'remaining',token:plan.approval.token,edits}});assert.ok(foreign.error)
  const denied=await other.rpc('approve_planner',{p_user_id:userId,p_revision:'fake',p_rows:[]});assert.ok(denied.error)
 })
 console.log(JSON.stringify({actualOpenAI:'passed',preferencePersistence:'passed',preferenceRelogin:'passed',savedSettingsPrecedence:'passed',focusWindow:'passed',partialRemaining:'passed',stableLineage:'passed',reschedulePreviewReadOnly:'passed',latestConflict:'passed',sameScheduleIdUpdated:'passed',fixedProtected:'passed',idempotency:'passed',history:'passed',rlsIsolation:'passed',metadataForgeryDenied:'passed',latestSettings:'passed',atomicUpdateRollback:'passed'}))
})
