import assert from 'node:assert/strict'
import {createClient} from '@supabase/supabase-js'
import {withPlannerTestUser} from './planner-test-user.mjs'
import {validatePlanningRecommendation} from '../packages/types/src/planningSchema.ts'
import {editsFromRecommendation} from '../packages/scheduling/src/approval.ts'
import {unitsFromPlan} from '../packages/scheduling/src/replanning.ts'
import {localDate,nextDate} from '../packages/scheduling/src/time.ts'
const invoke=async(client,name,body)=>{const response=await client.functions.invoke(name,{body});if(response.error){const value=await response.error.context?.clone?.().json?.().catch(()=>null);throw new Error(name+': '+(value?.error?.code??response.error.name))}return response.data}
await withPlannerTestUser(async({client,userId,email,password,url,key})=>{
 const otherDevice=createClient(url,key,{auth:{persistSession:false}});assert.equal((await otherDevice.auth.signInWithPassword({email,password})).error,null)
 const startDate=nextDate(localDate(new Date().toISOString(),'Asia/Seoul'),1),endDate=nextDate(startDate,29)
 const text='매일 자료 정리 30분을 1회씩 총 30번 해야 해. 일정 알아서 짜줘.'
 const plan=validatePlanningRecommendation(await invoke(client,'plan-tasks',{text,settings:{startDate,endDate,breakMinutes:0,maxDailyMinutes:480}}),text)
 const units=unitsFromPlan(plan);console.log(JSON.stringify({testOnly:true,originalTasks:plan.result.tasks.map(outcome=>({duration:outcome.task.durationMinutes,splittable:outcome.task.splittable,requested:outcome.requestedMinutes,remaining:outcome.remainingMinutes,deadline:outcome.task.deadline})),workUnits:units.length}));assert.ok(units.length>20);assert.equal(plan.result.tasks.length,1)
 const edits=editsFromRecommendation(plan).map(edit=>({...edit,confirmed:true}))
 const replanned=validatePlanningRecommendation(await invoke(client,'replan-tasks',{mode:'remaining',token:plan.approval.token,edits}))
 assert.ok(replanned.result.tasks.length>20);assert.equal(replanned.result.tasks.length,units.length)
 assert.ok(replanned.result.blocks.every(block=>units.some(unit=>unit.id===block.id)));assert.equal(replanned.result.tasks.reduce((sum,row)=>sum+row.requestedMinutes,0),plan.result.tasks.reduce((sum,row)=>sum+row.requestedMinutes,0))
 const draftEdits=editsFromRecommendation(replanned).map(edit=>({...edit,confirmed:true}));draftEdits[0].title='기기 A에서 수정';draftEdits[1].included=false
 const initial=await invoke(client,'planner-draft',{action:'load'});assert.equal(initial.revision,0);assert.equal(initial.draft,null)
 const payload={action:'save',revision:0,input:text,token:replanned.approval.token,edits:draftEdits}
 const saved=await invoke(client,'planner-draft',payload);assert.equal(saved.revision,1)
 const loaded=await invoke(otherDevice,'planner-draft',{action:'load'});assert.equal(loaded.draft.edits[0].title,draftEdits[0].title);assert.equal(loaded.draft.edits[1].included,false)
 assert.equal((await client.from('schedules').select('id')).data.length,0)
 const fromA=structuredClone(payload);fromA.revision=1;fromA.edits[0].priority='high'
 await invoke(client,'planner-draft',fromA)
 const fromB=structuredClone(payload);fromB.revision=1;fromB.edits[0].title='기기 B 충돌'
 const conflict=await otherDevice.functions.invoke('planner-draft',{body:fromB});assert.ok(conflict.error);assert.equal((await conflict.error.context.json()).error.code,'DRAFT_CONFLICT')
 const current=await invoke(otherDevice,'planner-draft',{action:'load'});assert.equal(current.revision,2);assert.equal(current.draft.edits[0].title,'기기 A에서 수정');assert.equal(current.draft.edits[0].priority,'high')
 const first=current.draft.edits[0];await invoke(client,'approve-plan',{token:replanned.approval.token,blocks:[first]})
 const approved=await invoke(otherDevice,'planner-draft',{action:'load'});assert.ok(approved.draft.saved.includes(first.id));assert.equal((await client.from('schedules').select('id')).data.length,1)
 await withPlannerTestUser(async({client:foreign})=>{
  const deniedRead=await foreign.from('planner_drafts').select('*').eq('user_id',userId);assert.equal(deniedRead.data.length,0)
  assert.ok((await foreign.from('planner_drafts').insert({user_id:userId,revision:1,payload:{}})).error)
  assert.ok((await foreign.rpc('write_planner_draft',{p_user_id:userId,p_expected_revision:2,p_payload:null})).error)
  const foreignSignature=await foreign.functions.invoke('planner-draft',{body:{...payload,revision:0}});assert.ok(foreignSignature.error)
 })
 const cleared=await invoke(client,'planner-draft',{action:'clear',revision:2});assert.equal(cleared.revision,3);assert.equal(cleared.draft,null)
 const stale=await otherDevice.functions.invoke('planner-draft',{body:{...payload,revision:2}});assert.ok(stale.error);assert.equal((await stale.error.context.json()).error.code,'DRAFT_CONFLICT')
 assert.equal((await invoke(otherDevice,'planner-draft',{action:'load'})).draft,null)
 console.log(JSON.stringify({actualOpenAI:'passed',replanWorkUnits:units.length,stableIds:'passed',independentAuthenticatedSessions:'passed',crossDeviceEdits:'passed',preApprovalScheduleWrites:0,revisionConflict:'passed',approvedStatusFromDB:'passed',rlsIsolation:'passed',privilegedWritesDenied:'passed',clearTombstone:'passed'}))
})
