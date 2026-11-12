import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../../state/useLibrary.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { schedulingSettings } from '../../../packages/scheduling/src/settings.ts'
import { createPreferenceRepository } from '@blanky/api'
import { getSupabaseClient, isSupabaseConfigured } from '../../services/supabase/client.ts'
import { toStoredPreference } from '../../services/preferences/index.ts'
import type { Settings } from '../../types/records.ts'

export function PlanningPreferences(){
 const {t,locale}=useI18n()
 // Monday first, matching workDays 1–7; the weekday names follow the app language.
 const dayNames=[1,2,3,4,5,6,7].map(day=>new Intl.DateTimeFormat(locale,{weekday:'short'}).format(new Date(2024,0,day)))
 const {settings,updateSettings}=useLibrary()
 const [editedDraft,setDraft]=useState(()=>schedulingSettings({...settings.scheduling,timezone:settings.timezone,dayStartTime:settings.dayStartTime,dayEndTime:settings.dayEndTime,defaultDurationMinutes:settings.taskDefaultDuration}))
 const [dirty,setDirty]=useState(false)
 const draft=dirty?editedDraft:schedulingSettings({...settings.scheduling,timezone:settings.timezone,dayStartTime:settings.dayStartTime,dayEndTime:settings.dayEndTime,defaultDurationMinutes:settings.taskDefaultDuration})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const patch=(value:Partial<typeof draft>)=>{setDraft(current=>({...(!dirty?draft:current),...value}));setDirty(true)}
 const save=async()=>{setBusy(true);setMessage('');try{
  try{schedulingSettings(draft)}catch{throw new Error(t('settings.ai.planning.invalid'))}
  if(!isSupabaseConfigured)throw new Error(t('settings.ai.planning.notConnected'))
  const client=getSupabaseClient(),auth=await client.auth.getUser()
  if(auth.error||!auth.data.user)throw new Error(t('settings.ai.planning.loginExpired'))
  const {dayStartTime,dayEndTime,defaultDurationMinutes}=draft
  const scheduling=Object.fromEntries(Object.entries(draft).filter(([name])=>!['now','startDate','endDate','timezone','dayStartTime','dayEndTime','defaultDurationMinutes'].includes(name)))
  const next:Settings={...settings,dayStartTime,dayEndTime,taskDefaultDuration:defaultDurationMinutes,defaultEventMinutes:defaultDurationMinutes,scheduling}
  const repo=createPreferenceRepository(client),current=await repo.get(auth.data.user.id),stored=toStoredPreference(auth.data.user.id,next)
  await repo.save({...stored,timezone:current?.timezone??stored.timezone,settings:{...current?.settings,...stored.settings}})
  updateSettings(next);setMessage(t('settings.ai.planning.saved'))
 }catch(error){setMessage(error instanceof Error?error.message:t('settings.ai.planning.saveFailed'))}finally{setBusy(false)}}
 return <section aria-label={t('settings.ai.workHoursLabel')} className="space-y-4">
  <div><h3 className="text-sm font-medium">{t('settings.ai.workHoursTitle')}</h3><p className="mt-1 text-xs text-neutral-500">{t('settings.ai.workHoursHint')} <Link className="text-blue-600" to="/">{t('settings.ai.openPlanner')}</Link></p></div>
  <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.ai.planning.workDays')}>{dayNames.map((day,index)=><button key={index} type="button" aria-pressed={draft.workDays.includes(index+1)} className={draft.workDays.includes(index+1)?'chip chip-on':'chip'} onClick={()=>patch({workDays:draft.workDays.includes(index+1)?draft.workDays.filter(value=>value!==index+1):[...draft.workDays,index+1].sort()})}>{day}</button>)}</div>
  <div className="grid grid-cols-2 gap-3">{(['dayStartTime','dayEndTime'] as const).map((key,index)=><label key={key} className="text-xs">{t(index?'settings.ai.planning.dayEnd':'settings.ai.planning.dayStart')}<input className="field mt-1 w-full" type="time" value={draft[key]} onChange={e=>patch({[key]:e.target.value})}/></label>)}<label className="text-xs">{t('settings.ai.planning.maxDaily')}<input className="field mt-1 w-full" type="number" min="25" max="1440" value={draft.maxDailyMinutes} onChange={e=>patch({maxDailyMinutes:Number(e.target.value)})}/></label><label className="text-xs">{t('settings.ai.planning.defaultDuration')}<select className="field select mt-1 w-full" value={draft.defaultDurationMinutes} onChange={e=>patch({defaultDurationMinutes:Number(e.target.value),minBlockMinutes:Math.min(draft.minBlockMinutes,Number(e.target.value))})}>{[15,30,45,60,90,120].map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
  <details><summary className="cursor-pointer text-sm text-blue-600">{t('settings.ai.planning.advanced')}</summary><div className="mt-3 space-y-3">
   <label className="block text-xs">{t('settings.ai.planning.placement')}<select className="field select mt-1 w-full" value={draft.placementMode} onChange={e=>patch({placementMode:e.target.value as 'earliest'|'focus'})}><option value="earliest">{t('settings.ai.planning.placementEarliest')}</option><option value="focus">{t('settings.ai.planning.placementFocus')}</option></select></label>
   <div className="grid grid-cols-2 gap-3">{(['preferredStartTime','preferredEndTime'] as const).map((key,index)=><label key={key} className="text-xs">{t(index?'settings.ai.planning.focusEnd':'settings.ai.planning.focusStart')}<input className="field mt-1 w-full" type="time" value={draft[key]??''} onChange={e=>patch({[key]:e.target.value||null})}/></label>)}</div>
   <button type="button" className="text-xs text-neutral-500" onClick={()=>patch({preferredStartTime:null,preferredEndTime:null,placementMode:'earliest'})}>{t('settings.ai.planning.clearFocus')}</button>
   <label className="block text-xs">{t('settings.ai.planning.breakMinutes')}<input className="field mt-1 w-full" type="number" min="0" max="240" value={draft.breakMinutes} onChange={e=>patch({breakMinutes:Number(e.target.value)})}/></label>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.allowSplit!==false} onChange={e=>patch({allowSplit:e.target.checked})}/>{t('settings.ai.planning.allowSplit')}</label>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.useManualHistory===true} onChange={e=>patch({useManualHistory:e.target.checked})}/>{t('settings.ai.planning.useHistory')}</label><p className="text-xs text-neutral-500">{t('settings.ai.planning.useHistoryHint')}</p>
  </div></details>
  <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void save()}>{busy?t('settings.ai.planning.saving'):t('settings.ai.planning.save')}</button>{message&&<p role="status" className="text-sm text-blue-600">{message}</p>}
 </section>
}
