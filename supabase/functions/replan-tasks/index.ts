import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../../../packages/api/src/database.generated.ts'
import { createPreferenceRepository } from '../../../packages/api/src/preferenceRepository.ts'
import { planningPreferences } from '../../../packages/scheduling/src/preferences.ts'
import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import type { ApprovalSnapshot } from '../approve-plan/handler.ts'
import { createReplanHandler } from './handler.ts'
declare const Deno:{serve:(handler:(request:Request)=>Promise<Response>)=>void;env:{get:(name:string)=>string|undefined}}
Deno.serve(createReplanHandler({authenticate:async request=>{
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('PLANNER_SIGNING_SECRET')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')
 if(!url||!key||!secret||!token)return null
 const client=createClient<Database>(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}}),auth=await client.auth.getUser(token)
 if(auth.error||!auth.data.user)return null
 const userId=auth.data.user.id
 return {userId,secret,now:new Date(Date.now()+5*60000).toISOString(),loadSettings:async()=>planningPreferences(await createPreferenceRepository(client).get(userId)),snapshot:async()=>{const {data,error}=await client.rpc('planner_snapshot',{});if(error)throw new AnalysisError('REPLAN_FAILED','최신 일정을 조회하지 못했어요.');return data as unknown as ApprovalSnapshot}}
},log:entry=>console.log(JSON.stringify(entry))}))
