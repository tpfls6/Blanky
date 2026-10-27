import test from 'node:test'
import assert from 'node:assert/strict'
import type { PlanningRecommendation, PlannerEdit } from '../packages/types/src/planning.ts'


import { editsFromRecommendation, validatePlannerEdits } from '../packages/scheduling/src/approval.ts'
import { sealPlanner, openPlanner } from '../supabase/functions/_shared/plannerToken.ts'
import { createApprovePlanHandler, type ApprovalSnapshot } from '../supabase/functions/approve-plan/handler.ts'
import { approvePlanner } from '../packages/api/src/plannerApproval.ts'
import { patchPlannerEdit } from '../src/features/ai/plannerEdits.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/api/src/database.generated.ts'

const now='2026-10-13T00:00:00Z',secret='test-only-secret',owner='11111111-1111-4111-8111-111111111111'
import {approvalFixture} from './fixtures/planner.ts'
const snapshot=():ApprovalSnapshot=>({revision:'v1',rows:[],calendars:[{id:'calendar',timezone:'Asia/Seoul',is_default_personal:true}]})
const edits=(plan:PlanningRecommendation)=>editsFromRecommendation(plan).map(edit=>({...edit,confirmed:true}))
function row(edit:PlannerEdit){return {id:'existing',user_id:owner,calendar_id:'calendar',title:edit.title,date:edit.date,start_time:edit.startTime,end_time:edit.endTime,duration_minutes:edit.durationMinutes,kind:'task',priority:edit.priority,status:'todo',created_at:now,updated_at:now}}

test('signed preview is bound to user, contents and expiry and contains no writes',async()=>{
 const plan=approvalFixture(),signed=await sealPlanner(plan,owner,secret,Date.parse(now))
 assert.equal((await openPlanner(signed.token,owner,secret,Date.parse(now))).recommendation.result.blocks.length,2)
 await assert.rejects(openPlanner(signed.token,'other',secret,Date.parse(now)),{code:'PREVIEW_EXPIRED'})
 await assert.rejects(openPlanner(signed.token+'x',owner,secret,Date.parse(now)),{code:'PREVIEW_EXPIRED'})
 await assert.rejects(openPlanner(signed.token,owner,secret,Date.parse(now)+7200001),{code:'PREVIEW_EXPIRED'})
})
test('user title/time/duration/priority edits override recommendations; excluded blocks are not approved',()=>{
 const plan=approvalFixture(),draft=edits(plan)
 draft[0]=patchPlannerEdit(draft[0],{title:'사용자 제목',startTime:'14:00',durationMinutes:30,priority:'high'})
 draft[1].included=false
 const validated=validatePlannerEdits(plan,draft,[],now)
 assert.equal(validated.length,1);assert.equal(validated[0].edit.endTime,'14:30');assert.equal(validated[0].edit.priority,'high')
 assert.equal(validated[0].edit.title,'사용자 제목')
 draft[0]=patchPlannerEdit(draft[0],{durationMinutes:90})
 assert.equal(validatePlannerEdits(plan,draft,[],now)[0].edit.durationMinutes,90,'User duration overrides AI effort when hard constraints permit it')
})
test('estimate confirmation, deadline, work hours and daily limits block invalid approval',()=>{
 const plan=approvalFixture(),draft=editsFromRecommendation(plan)
 assert.throws(()=>validatePlannerEdits(plan,draft,[],now),{code:'CONFIRMATION_REQUIRED'})
 const confirmed=edits(plan);confirmed[0].date='2026-10-16'
 assert.throws(()=>validatePlannerEdits(plan,confirmed,[],now),{code:'CONSTRAINT_VIOLATION'})
 confirmed[0].date='2026-10-13';confirmed[0].startTime='08:00';confirmed[0].endTime='09:00'
 assert.throws(()=>validatePlannerEdits(plan,confirmed,[],now),{code:'CONSTRAINT_VIOLATION'})
 plan.result.settings.maxDailyMinutes=60
 assert.throws(()=>validatePlannerEdits(plan,edits(plan),[],now),{code:'CONSTRAINT_VIOLATION'})
})
test('new existing events and overlaps between edited blocks stop the entire approval',()=>{
 const plan=approvalFixture(),draft=edits(plan)
 assert.throws(()=>validatePlannerEdits(plan,draft,[{id:'fixed',date:draft[0].date,startTime:'09:00',endTime:'10:00',duration:60,status:'todo',kind:'event'}],now),{code:'SCHEDULE_CONFLICT'})
 draft[1]={...draft[1],startTime:draft[0].startTime,endTime:draft[0].endTime}
 assert.throws(()=>validatePlannerEdits(plan,draft,[],now),{code:'SCHEDULE_CONFLICT'})
})
test('approval handler re-reads latest schedules before one atomic commit and keeps modified values',async()=>{
 const plan=approvalFixture(),signed=await sealPlanner(plan,owner,secret,Date.parse(now)),draft=edits(plan)
 draft[0].title='수정 제목'
 const calls:string[]=[]
 const handler=createApprovePlanHandler({authenticate:async()=>({userId:owner,secret,now,snapshot:async()=>{calls.push('snapshot');return snapshot()},commit:async(revision,rows)=>{calls.push('commit');assert.equal(revision,'v1');assert.equal(rows.length,2);assert.equal(rows[0].title,'수정 제목');return rows.map((data,index)=>({...row(draft[index]),id:'saved-'+index,planner_approval_key:data.key}))}})})
 const response=await handler(new Request('http://local',{method:'POST',body:JSON.stringify({token:signed.token,blocks:draft})}))
 assert.equal(response.status,200);assert.deepEqual(calls,['snapshot','commit'])
 const body=await response.json();assert.equal(body.schedules.length,2)
 const client={auth:{async getUser(){return {data:{user:{id:owner}},error:null}}},functions:{async invoke(){return {data:body,error:null}}}} as unknown as SupabaseClient<Database>
 const mapped=await approvePlanner(client,{token:signed.token,blocks:draft})
 assert.equal(mapped.schedules[0].userId,owner,'The DB response is mapped exactly once')
 assert.equal(mapped.schedules[0].title,'수정 제목')
})
test('latest conflict prevents commit and an RPC concurrency conflict is surfaced without partial response',async()=>{
 const plan=approvalFixture(),signed=await sealPlanner(plan,owner,secret,Date.parse(now)),draft=edits(plan)
 let commits=0
 const handler=createApprovePlanHandler({authenticate:async()=>({userId:owner,secret,now,snapshot:async()=>({...snapshot(),rows:[row(draft[0])]}),commit:async()=>{commits++;return []}})})
 const request=()=>new Request('http://local',{method:'POST',body:JSON.stringify({token:signed.token,blocks:draft})})
 const response=await handler(request());assert.equal(response.status,409);assert.equal(commits,0)
})
test('login expiry prevents any snapshot or save; malformed recommendation keys are rejected',async()=>{
 const handler=createApprovePlanHandler({authenticate:async()=>null})
 assert.equal((await handler(new Request('http://local',{method:'POST',body:'{}'}))).status,401)
 const client={auth:{async getUser(){return {data:{user:null},error:null}}},functions:{async invoke(){throw new Error('must not save')}}} as unknown as SupabaseClient<Database>
 await assert.rejects(approvePlanner(client,{token:'test',blocks:edits(approvalFixture())}),{code:'AUTH_REQUIRED'})
 const invalid=edits(approvalFixture());invalid[0].id='invented'
 assert.throws(()=>validatePlannerEdits(approvalFixture(),invalid,[],now),{code:'INVALID_INPUT'})
})
test('server retry recognizes already approved IDs without duplicating fixed interval checks',async()=>{
 const plan=approvalFixture(),signed=await sealPlanner(plan,owner,secret,Date.parse(now)),draft=edits(plan),saved=row(draft[0])
 const existing={...saved,planner_approval_key:signed.previewId+':'+draft[0].id}
 let commits=0
 const handler=createApprovePlanHandler({authenticate:async()=>({userId:owner,secret,now,snapshot:async()=>({...snapshot(),rows:[existing]}),commit:async()=>{commits++;return [existing]}})})
 const response=await handler(new Request('http://local',{method:'POST',body:JSON.stringify({token:signed.token,blocks:[draft[0]]})}))
 assert.equal(response.status,200);assert.equal(commits,1)
})
