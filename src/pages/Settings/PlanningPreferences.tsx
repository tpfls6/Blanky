import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../../state/useLibrary.ts'
import { schedulingSettings } from '../../../packages/scheduling/src/settings.ts'
import { createPreferenceRepository } from '@blanky/api'
import { getSupabaseClient, isSupabaseConfigured } from '../../services/supabase/client.ts'
import { toStoredPreference } from '../../services/preferences/index.ts'
import type { Settings } from '../../types/records.ts'

export function PlanningPreferences(){
 const {settings,updateSettings}=useLibrary()
 const [editedDraft,setDraft]=useState(()=>schedulingSettings({...settings.scheduling,timezone:settings.timezone,dayStartTime:settings.dayStartTime,dayEndTime:settings.dayEndTime,defaultDurationMinutes:settings.taskDefaultDuration}))
 const [dirty,setDirty]=useState(false)
 const draft=dirty?editedDraft:schedulingSettings({...settings.scheduling,timezone:settings.timezone,dayStartTime:settings.dayStartTime,dayEndTime:settings.dayEndTime,defaultDurationMinutes:settings.taskDefaultDuration})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const patch=(value:Partial<typeof draft>)=>{setDraft(current=>({...(!dirty?draft:current),...value}));setDirty(true)}
 const save=async()=>{setBusy(true);setMessage('');try{
  schedulingSettings(draft)
  if(!isSupabaseConfigured)throw new Error('로그인과 서버 연결을 확인해 주세요. 아직 저장하지 않았어요.')
  const client=getSupabaseClient(),auth=await client.auth.getUser()
  if(auth.error||!auth.data.user)throw new Error('로그인이 만료되었어요. 다시 로그인해 주세요.')
  const {dayStartTime,dayEndTime,defaultDurationMinutes}=draft
  const scheduling=Object.fromEntries(Object.entries(draft).filter(([name])=>!['now','startDate','endDate','timezone','dayStartTime','dayEndTime','defaultDurationMinutes'].includes(name)))
  const next:Settings={...settings,dayStartTime,dayEndTime,taskDefaultDuration:defaultDurationMinutes,defaultEventMinutes:defaultDurationMinutes,scheduling}
  const repo=createPreferenceRepository(client),current=await repo.get(auth.data.user.id),stored=toStoredPreference(auth.data.user.id,next)
  await repo.save({...stored,timezone:current?.timezone??stored.timezone,settings:{...current?.settings,...stored.settings}})
  updateSettings(next);setMessage('개인화 설정을 저장했어요. 새 계획부터 적용됩니다.')
 }catch(error){setMessage(error instanceof Error?error.message:'저장하지 못했어요. 설정을 유지했으니 다시 시도해 주세요.')}finally{setBusy(false)}}
 return <section aria-label="AI 작업 시간 설정" className="space-y-4">
  <div><h3 className="text-sm font-medium">AI 작업 시간</h3><p className="mt-1 text-xs text-neutral-500">사용자 설정을 AI 추천보다 우선 적용합니다. <Link className="text-blue-600" to="/">Planner 열기</Link></p></div>
  <div className="flex flex-wrap gap-2" role="group" aria-label="작업 가능한 요일">{['월','화','수','목','금','토','일'].map((day,index)=><button key={day} type="button" aria-pressed={draft.workDays.includes(index+1)} className={draft.workDays.includes(index+1)?'chip chip-on':'chip'} onClick={()=>patch({workDays:draft.workDays.includes(index+1)?draft.workDays.filter(value=>value!==index+1):[...draft.workDays,index+1].sort()})}>{day}</button>)}</div>
  <div className="grid grid-cols-2 gap-3">{(['dayStartTime','dayEndTime'] as const).map((key,index)=><label key={key} className="text-xs">{index?'작업 종료':'작업 시작'}<input className="field mt-1 w-full" type="time" value={draft[key]} onChange={e=>patch({[key]:e.target.value})}/></label>)}<label className="text-xs">하루 최대 작업(분)<input className="field mt-1 w-full" type="number" min="25" max="1440" value={draft.maxDailyMinutes} onChange={e=>patch({maxDailyMinutes:Number(e.target.value)})}/></label><label className="text-xs">기본 소요시간(분)<select className="field mt-1 w-full" value={draft.defaultDurationMinutes} onChange={e=>patch({defaultDurationMinutes:Number(e.target.value),minBlockMinutes:Math.min(draft.minBlockMinutes,Number(e.target.value))})}>{[15,30,45,60,90,120].map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
  <details><summary className="cursor-pointer text-sm text-blue-600">고급 설정</summary><div className="mt-3 space-y-3">
   <label className="block text-xs">기본 배치 방식<select className="field mt-1 w-full" value={draft.placementMode} onChange={e=>patch({placementMode:e.target.value as 'earliest'|'focus'})}><option value="earliest">가능한 빠른 시간</option><option value="focus">선호 집중 시간 우선</option></select></label>
   <div className="grid grid-cols-2 gap-3">{(['preferredStartTime','preferredEndTime'] as const).map((key,index)=><label key={key} className="text-xs">집중 시간 {index?'종료':'시작'}<input className="field mt-1 w-full" type="time" value={draft[key]??''} onChange={e=>patch({[key]:e.target.value||null})}/></label>)}</div>
   <button type="button" className="text-xs text-neutral-500" onClick={()=>patch({preferredStartTime:null,preferredEndTime:null,placementMode:'earliest'})}>집중 시간 지정 해제</button>
   <label className="block text-xs">작업 사이 휴식(분)<input className="field mt-1 w-full" type="number" min="0" max="240" value={draft.breakMinutes} onChange={e=>patch({breakMinutes:Number(e.target.value)})}/></label>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.allowSplit!==false} onChange={e=>patch({allowSplit:e.target.checked})}/>긴 작업 분할 허용</label>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.useManualHistory===true} onChange={e=>patch({useManualHistory:e.target.checked})}/>최근 직접 수정 이력 참고</label><p className="text-xs text-neutral-500">같은 제목을 두 번 이상 직접 수정한 경우에만 최근 소요시간과 우선순위를 참고합니다. 자동 학습이 아니며 확인 후 적용합니다.</p>
  </div></details>
  <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void save()}>{busy?'저장 중…':'개인화 설정 저장'}</button>{message&&<p role="status" className="text-sm text-blue-600">{message}</p>}
 </section>
}
