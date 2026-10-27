import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../../../packages/api/src/database.generated.ts'
import { asJson } from '../../../packages/api/src/json.ts'
import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import type { ApprovalSnapshot } from '../approve-plan/handler.ts'
import { createDraftHandler, type StoredDraft } from './handler.ts'
declare const Deno:{serve:(handler:(request:Request)=>Promise<Response>)=>void;env:{get:(name:string)=>string|undefined}}
Deno.serve(createDraftHandler({authenticate:async request=>{
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')
 if(!url||!anon||!service||!token)return null
 const client=createClient<Database>(url,anon,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}}),auth=await client.auth.getUser(token)
 if(auth.error||!auth.data.user)return null
 const userId=auth.data.user.id,admin=createClient<Database>(url,service,{auth:{persistSession:false}})
 return {userId,secret:Deno.env.get('PLANNER_SIGNING_SECRET')??service,now:new Date().toISOString(),read:async()=>{const {data,error}=await client.from('planner_drafts').select('*').eq('user_id',userId).maybeSingle();if(error)throw new Error('Draft read failed');return data as unknown as StoredDraft|null},snapshot:async()=>{const {data,error}=await client.rpc('planner_snapshot',{});if(error)throw new Error('Snapshot failed');return data as unknown as ApprovalSnapshot},write:async(revision,payload)=>{const {data,error}=await admin.rpc('write_planner_draft',{p_user_id:userId,p_expected_revision:revision,p_payload:payload===null?null:asJson(payload)});if(error){if(error.message.includes('DRAFT_CONFLICT'))throw new AnalysisError('DRAFT_CONFLICT','다른 기기에서 초안이 변경되었어요. 불러오거나 이 기기의 초안으로 저장해 주세요.');throw new Error('Draft write failed')}return data![0] as unknown as StoredDraft}}
},log:entry=>console.log(JSON.stringify(entry))}))
