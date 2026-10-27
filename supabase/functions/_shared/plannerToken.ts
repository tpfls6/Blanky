import { unitsFromPlan, type ReplanContext } from '../../../packages/scheduling/src/replanning.ts'
import type { PlanningRecommendation } from '../../../packages/types/src/planning.ts'
import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import { validatePlanningRecommendation } from '../../../packages/types/src/planningSchema.ts'
const encoder=new TextEncoder()
const b64=(bytes:Uint8Array)=>{let text='';for(let offset=0;offset<bytes.length;offset+=8192)text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
const unb64=(text:string)=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),character=>character.charCodeAt(0))
async function key(secret:string) { if(!secret)throw new AnalysisError('PLANNING_FAILED','서버 승인 설정을 확인해 주세요.');return crypto.subtle.importKey('raw',encoder.encode('blanky-planner-v1:'+secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']) }
export type SignedPlanner = { userId:string;previewId:string;expiresAt:string;recommendation:PlanningRecommendation;inputText?:string;context?:ReplanContext }
export async function sealPlanner(recommendation:PlanningRecommendation,userId:string,secret:string,now=Date.now(),inputText?:string,context?:ReplanContext,rootId?:string) {
  const previewId=rootId??crypto.randomUUID(),expiresAt=new Date(now+2*60*60*1000).toISOString()
  const payload=b64(encoder.encode(JSON.stringify({userId,previewId,expiresAt,recommendation,inputText,context:context??{units:unitsFromPlan(recommendation)}})))
  const signature=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(payload))))
  const token=payload+'.'+signature
  if(token.length>1000000)throw new AnalysisError('REPLAN_LIMIT','계획 데이터가 너무 커요. 작업 범위를 나누어 주세요.')
  return {token,previewId,expiresAt}
}
export async function openPlanner(token:string,userId:string,secret:string,now=Date.now(),allowExpired=false):Promise<SignedPlanner> {
  try {
    if(typeof token!=='string'||token.length>1000000)throw new Error()
    const [payload,signature,...rest]=token.split('.')
    if(rest.length||!await crypto.subtle.verify('HMAC',await key(secret),unb64(signature),encoder.encode(payload)))throw new Error()
    const data=JSON.parse(new TextDecoder().decode(unb64(payload))) as SignedPlanner
    if(data.userId!==userId||!data.previewId||(!Number.isFinite(Date.parse(data.expiresAt))||(!allowExpired&&Date.parse(data.expiresAt)<=now)))throw new Error()
    validatePlanningRecommendation(data.recommendation)
    return data
  } catch {throw new AnalysisError('PREVIEW_EXPIRED','추천이 만료되었거나 변경되었어요. 원본 입력으로 다시 생성해 주세요.')}
}
