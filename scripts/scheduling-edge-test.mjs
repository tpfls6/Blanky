// No writes: deployment smoke and optional authenticated end-to-end check.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { validateScheduleAnalysis } from '../packages/types/src/aiSchema.ts'
import { validatePlanningRecommendation } from '../packages/types/src/planningSchema.ts'
if(existsSync('.env'))process.loadEnvFile('.env')
const url=process.env.VITE_SUPABASE_URL??process.env.SUPABASE_URL
const key=process.env.VITE_SUPABASE_ANON_KEY??process.env.SUPABASE_ANON_KEY
if(!url||!key)throw new Error('Supabase public configuration missing')
const endpoint=url.replace(/\/$/,'')+'/functions/v1/plan-tasks'
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'}
const preflight=await fetch(endpoint,{method:'OPTIONS'})
assert.equal(preflight.status,204)
const unauth=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({text:'이번 주 공부 계획 세워줘'})})
assert.equal(unauth.status,401)
assert.equal((await unauth.json()).error?.code,'AUTH_REQUIRED')
console.log(JSON.stringify({deployment:'passed',checks:['CORS','anonymous_denied'],writes:0}))
const token=process.env.AI_TEST_USER_TOKEN
if(!token)console.log(JSON.stringify({authenticatedAnalysis:'not_run',authenticatedPlanner:'not_run',blockedAt:'authenticated user token unavailable',writes:0}))
else {
  const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}})
  const {data:auth,error:authError}=await client.auth.getUser(token)
  assert.ok(!authError&&auth.user,'Token must belong to a logged-in user')
  const snapshot=async()=>{
    const [schedules,history]=await Promise.all([client.from('schedules').select('id,updated_at').order('id'),client.from('schedule_changes').select('id,created_at').order('id')])
    if(schedules.error||history.error)throw new Error('RLS-protected snapshot read failed')
    return JSON.stringify({schedules:schedules.data,history:history.data})
  }
  const before=await snapshot()
  const authHeaders={...headers,Authorization:`Bearer ${token}`}
  const text='내일 오후 3시 회의하고 금요일까지 보고서 제출하기'
  const analysisResponse=await fetch(url.replace(/\/$/,'')+'/functions/v1/parse-schedule',{method:'POST',headers:authHeaders,body:JSON.stringify({text,timezone:'Asia/Seoul',format:'analysis-v1'})})
  assert.equal(analysisResponse.status,200)
  assert.equal(validateScheduleAnalysis(await analysisResponse.json(),{text}).items.length,2)
  const planningText='이번 주에 공부 5시간, 운동 2번 해야 해. 일정 알아서 짜줘.'
  const planResponse=await fetch(endpoint,{method:'POST',headers:authHeaders,body:JSON.stringify({text:planningText})})
  assert.equal(planResponse.status,200)
  validatePlanningRecommendation(await planResponse.json(),planningText)
  assert.equal(await snapshot(),before,'Planner must not change schedules or change history')
  console.log(JSON.stringify({authenticatedAnalysis:'passed',authenticatedPlanner:'passed',existingDataUnchanged:true,writes:0}))
}
