// Explicit live test: synthetic calendar only, no Supabase writes or user records.
import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import { createOpenAIPlanningProvider } from '../packages/parse/src/planningProvider.ts'
import { createPlanningRecommendation } from '../packages/scheduling/src/planner.ts'
import { validatePlanningRecommendation } from '../packages/types/src/planningSchema.ts'
if (existsSync('supabase/functions/.env')) process.loadEnvFile('supabase/functions/.env')
const text='이번 주에 시험 공부 5시간, 발표자료 수정 3시간, 운동 2번 해야 해. 일정 알아서 짜줘.'
if (!process.env.OPENAI_API_KEY) {
  console.log(JSON.stringify({status:'not_run',reason:'OPENAI_API_KEY missing'}))
  process.exitCode=1
} else {
  try {
    const recommendation=await createPlanningRecommendation({text},{
      now:'2026-10-13T00:00:00Z',
      provider:createOpenAIPlanningProvider({key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_PLANNING_MODEL,fetch:async(...args)=>{
        const response=await fetch(...args)
        if(process.env.SCHEDULING_LIVE_DEBUG==='1') {const body=await response.clone().json();console.log(JSON.stringify({status:response.status,output:body.output,errorCode:body.error?.code}))}
        return response
      }}),
      loadSettings:async()=>({startDate:'2026-10-13',endDate:'2026-10-18'}),
      loadCategories:async()=>[{id:'study',name:'공부',parentId:null},{id:'work',name:'업무',parentId:null},{id:'health',name:'운동',parentId:null}],
      loadSchedules:async()=>[{id:'fixed',kind:'event',status:'todo',date:'2026-10-13',startTime:'09:00',endTime:'11:00',duration:120,timezone:'Asia/Seoul'}],
    })
    validatePlanningRecommendation(recommendation,text)
    const {analysis,result}=recommendation
    assert.equal(analysis.tasks.length,3)
    assert.ok(analysis.tasks.some(task=>task.durationMinutes===300&&!task.durationIsEstimate))
    assert.ok(analysis.tasks.some(task=>task.durationMinutes===180&&!task.durationIsEstimate))
    assert.ok(analysis.tasks.some(task=>task.occurrences===2))
    assert.ok(result.blocks.length>0)
    assert.ok(result.blocks.every(block=>!(Date.parse(block.startAt)<Date.parse('2026-10-13T11:00:00+09:00')&&Date.parse(block.endAt)>Date.parse('2026-10-13T09:00:00+09:00'))))
    console.log(JSON.stringify({status:'passed',provider:'openai',scenario:'task_semantics_plus_deterministic_allocation',tasks:analysis.tasks,blocks:result.blocks,unplaced:result.tasks.filter(task=>task.status!=='scheduled'),writes:0}))
  } catch(error) {
    console.log(JSON.stringify({status:'failed',code:error.code??'ASSERTION_FAILED',writes:0}))
    process.exitCode=1
  }
}
