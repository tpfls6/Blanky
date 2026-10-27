import assert from 'node:assert/strict'
import { withPlannerTestUser } from './planner-test-user.mjs'
import { validatePlanningRecommendation } from '../packages/types/src/planningSchema.ts'
import { editsFromRecommendation } from '../packages/scheduling/src/approval.ts'
await withPlannerTestUser(async({client,admin,userId})=>{
 const text='이번 주에 데이터 분석 30분, 문서 작성 30분 해야 해. 일정 알아서 짜줘.'
 const {data,error}=await client.functions.invoke('plan-tasks',{body:{text}})
 if(error)throw new Error('Authenticated Planner request failed: '+(await error.context?.clone?.().json?.().catch(()=>({})))?.error?.code)
 const plan=validatePlanningRecommendation(data,text)
 assert.ok(plan.approval?.token);assert.equal(plan.result.tasks.length,2);assert.ok(plan.result.blocks.length>=2)
 const snapshot=await client.rpc('planner_snapshot',{});assert.equal(snapshot.error,null);assert.equal(snapshot.data.rows.length,0)
 const blocks=editsFromRecommendation(plan).map(edit=>({...edit,confirmed:true,title:edit.title+' 승인 테스트'}))
 const request={token:plan.approval.token,blocks}
 const firstBlock=plan.result.blocks[0]
 const fixed=await client.from('schedules').insert({user_id:userId,title:'test-only conflict',date:firstBlock.startAt.slice(0,10),start_time:firstBlock.startAt.slice(11,16),end_time:firstBlock.endAt.slice(11,16),duration_minutes:firstBlock.durationMinutes,kind:'event'}).select('id').single()
 assert.equal(fixed.error,null)
 const conflict=await client.functions.invoke('approve-plan',{body:request})
 assert.ok(conflict.error);assert.equal((await conflict.error.context.json()).error.code,'SCHEDULE_CONFLICT')
 assert.equal((await client.from('schedules').select('id')).data.length,1,'Conflict must not store any approved block')
 assert.equal((await client.from('schedules').delete().eq('id',fixed.data.id)).error,null)
 const baselineHistory=(await client.from('schedule_changes').select('id')).data.length
 const first=await client.functions.invoke('approve-plan',{body:request})
 if(first.error){const body=await first.error.context?.json?.();throw new Error('Approval failed: '+body?.error?.code)}
 assert.equal(first.data.schedules.length,blocks.length)
 const replay=await client.functions.invoke('approve-plan',{body:request});assert.equal(replay.error,null)
 assert.deepEqual(replay.data.schedules.map(row=>row.id),first.data.schedules.map(row=>row.id))
 const count=await client.from('schedules').select('id');assert.equal(count.data.length,blocks.length)
 const history=await client.from('schedule_changes').select('id,source');assert.equal(history.data.length,baselineHistory+blocks.length);assert.equal(history.data.filter(row=>row.source==='ai_chat').length,blocks.length)
 const denied=await client.rpc('approve_planner',{p_user_id:userId,p_revision:'fake',p_rows:[]});assert.ok(denied.error,'User must not call privileged RPC')
 // Prove database atomicity using this test account only: second row violates priority.
 const fresh=await client.rpc('planner_snapshot',{})
 const base={key:'atomic-test:'+crypto.randomUUID(),title:'atomic-only',startAt:plan.result.blocks[0].startAt,endAt:plan.result.blocks[0].endAt,durationMinutes:30,priority:'medium',kind:'task',categoryId:null,dueDate:null,sourceText:'test'}
 const changed=await client.from('schedules').insert({user_id:userId,title:'test-only revision change',date:firstBlock.startAt.slice(0,10),start_time:'20:00',end_time:'20:30',kind:'event'}).select('id').single()
 assert.equal(changed.error,null)
 const race=await admin.rpc('approve_planner',{p_user_id:userId,p_revision:fresh.data.revision,p_rows:[base]})
 assert.ok(race.error?.message.includes('SCHEDULE_CONFLICT'),'Database must recheck revision under lock')
 assert.equal((await client.from('schedules').delete().eq('id',changed.data.id)).error,null)
 const latest=await client.rpc('planner_snapshot',{})
 const rollback=await admin.rpc('approve_planner',{p_user_id:userId,p_revision:latest.data.revision,p_rows:[base,{...base,key:'atomic-test:'+crypto.randomUUID(),priority:'unsupported'}]})
 assert.ok(rollback.error)
 const after=await client.from('schedules').select('id');assert.equal(after.data.length,blocks.length,'Failed transaction must not leave first inserted row')
 console.log(JSON.stringify({authenticatedPlanner:'passed',freshConflict:'passed',snapshotRace:'passed',approval:'passed',history:'passed',idempotency:'passed',privilegedRpcDenied:'passed',atomicRollback:'passed',preApprovalWrites:0,testOnlySchedules:blocks.length}))
})
