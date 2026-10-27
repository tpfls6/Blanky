import { planningPreferences } from '../../../packages/scheduling/src/preferences.ts'
import { createPreferenceRepository } from '../../../packages/api/src/preferenceRepository.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../../../packages/api/src/database.generated.ts'
import { asJson } from '../../../packages/api/src/json.ts'
import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import { createApprovePlanHandler, type ApprovalSnapshot } from './handler.ts'
declare const Deno:{serve:(handler:(request:Request)=>Promise<Response>)=>void;env:{get:(name:string)=>string|undefined}}
Deno.serve(createApprovePlanHandler({authenticate:async request=>{
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')
 if(!url||!anon||!service||!token)return null
 const client=createClient<Database>(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}})
 const {data,error}=await client.auth.getUser(token);if(error||!data.user)return null
 const userId=data.user.id,admin=createClient<Database>(url,service,{auth:{persistSession:false}})
 return {userId,secret:Deno.env.get('PLANNER_SIGNING_SECRET')??service,now:new Date().toISOString(),loadSettings:async()=>planningPreferences(await createPreferenceRepository(client).get(userId)),snapshot:async()=>{
  const {data,error}=await client.rpc('planner_snapshot',{})
  if(error)throw new AnalysisError('APPROVAL_FAILED','최신 일정을 조회하지 못했어요. 연결과 서버 설정을 확인해 주세요.')
  return data as unknown as ApprovalSnapshot
 },commit:async(revision,rows)=>{
  const {data,error}=await admin.rpc('approve_planner',{p_user_id:userId,p_revision:revision,p_rows:asJson(rows)})
  if(error){
   if(/SCHEDULE_CONFLICT/.test(error.message))throw new AnalysisError('SCHEDULE_CONFLICT','검사 중 기존 일정이 변경되었어요. 다시 확인한 후 적용해 주세요.')
   if(/APPROVAL_CHANGED/.test(error.message))throw new AnalysisError('APPROVAL_CHANGED','이미 적용한 일정이 수정되었어요. 중복 저장하지 않았어요.')
   throw new AnalysisError('APPROVAL_FAILED','선택한 일정을 저장하지 못했어요. 모든 변경은 취소되었으며 다시 시도할 수 있어요.')
  }
  return data as unknown as Record<string,unknown>[]
 }}
},log:entry=>console.log(JSON.stringify(entry))}))
