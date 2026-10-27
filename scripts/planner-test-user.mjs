// Test accounts only. Credentials stay in memory and are never printed.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
export function projectKeys(){
 let output
 try{output=execFileSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c','supabase.cmd projects api-keys --project-ref drqauskbpizxjnfquktz --reveal --output json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})}catch{throw new Error('Project server credentials unavailable')}
 const body=JSON.parse(output)
 const find=(value)=>{
  if(!value||typeof value!=='object')return null
  if((value.name==='service_role'||value.type==='secret')&&typeof value.api_key==='string')return value.api_key
  if(typeof value.service_role==='string')return value.service_role
  for(const item of Object.values(value)){const found=find(item);if(found)return found}
  return null
 }
 const service=find(body)
 if(!service)throw new Error('No server credential available; response fields: '+Object.keys(body).join(','))
 return service
}
async function cleanTestUser(admin,userId,runId){
 const {data:check}=await admin.auth.admin.getUserById(userId)
 if(check.user?.app_metadata?.blanky_planner_test_run!==runId||check.user.email!==`blanky-planner-${runId}@example.com`)throw new Error('Test cleanup identity check failed')
 // Delete test schedules while auth user still exists so activity triggers remain valid.
 const schedules=await admin.from('schedules').delete().eq('user_id',userId)
 if(schedules.error)throw new Error('Test schedule cleanup failed: '+schedules.error.code)
 const history=await admin.from('schedule_changes').delete().eq('user_id',userId)
 if(history.error)throw new Error('Test history cleanup failed: '+history.error.code)
 const {error}=await admin.auth.admin.deleteUser(userId)
 if(error)throw new Error('Test-only account cleanup failed')
}
export async function withPlannerTestUser(run){
 if(existsSync('.env'))process.loadEnvFile('.env')
 const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_ANON_KEY
 if(!url||!key)throw new Error('Public Supabase configuration missing')
 const admin=createClient(url,projectKeys(),{auth:{persistSession:false}})
 const runId=crypto.randomUUID(),email=`blanky-planner-${runId}@example.com`,password=crypto.randomUUID()+'Aa!9'
 const {data:created,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{blanky_planner_test_run:runId},user_metadata:{name:'Planner Test'}})
 if(error||!created.user)throw new Error('Test user creation failed: '+(error?.code??'unknown'))
 const userId=created.user.id,client=createClient(url,key,{auth:{persistSession:false}})
 try {
  const {data:session,error:loginError}=await client.auth.signInWithPassword({email,password})
  if(loginError||!session.session)throw new Error('Test login failed')
  await run({admin,client,url,key,userId,email,password,token:session.session.access_token,runId})
 } finally {
  await cleanTestUser(admin,userId,runId)
  console.log(JSON.stringify({testAccountCleanup:'passed',existingAccountsTouched:false}))
 }
}
if(process.argv.includes('--inspect')){projectKeys();console.log(JSON.stringify({testAdminCredentialAvailable:true}))}
if(process.argv.includes('--cleanup')){
 if(existsSync('.env'))process.loadEnvFile('.env')
 const admin=createClient(process.env.VITE_SUPABASE_URL,projectKeys(),{auth:{persistSession:false}})
 const {data,error}=await admin.auth.admin.listUsers({page:1,perPage:1000});if(error)throw new Error('Test cleanup lookup failed')
 let cleaned=0
 for(const user of data.users){const runId=user.app_metadata?.blanky_planner_test_run;if(typeof runId==='string'&&user.email===`blanky-planner-${runId}@example.com`){await cleanTestUser(admin,user.id,runId);cleaned++}}
 console.log(JSON.stringify({testOnlyAccountsCleaned:cleaned,existingAccountsTouched:false}))
}
