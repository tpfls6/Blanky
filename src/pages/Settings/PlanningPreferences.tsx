import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { schedulingSettings } from '../../../packages/scheduling/src/settings.ts'
import { createPreferenceRepository } from '@blanky/api'
import { getSupabaseClient, isSupabaseConfigured } from '../../services/supabase/client.ts'
import { toStoredPreference } from '../../services/preferences/index.ts'
import type { Settings } from '../../types/records.ts'
import { SETTINGS_COMPACT_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { MBlock, MCard, MHint, MLabel, MRow, MSheet, MSwitch, MTimeField } from './mobileRows.tsx'

type Draft=ReturnType<typeof schedulingSettings>
type PlannerSheet='hours'|'max'|'duration'|'advanced'

export function PlanningPreferences(){
 const {t,locale}=useI18n()
 // Monday first, matching workDays 1–7; the weekday names follow the app language.
 const dayNames=[1,2,3,4,5,6,7].map(day=>new Intl.DateTimeFormat(locale,{weekday:'short'}).format(new Date(2024,0,day)))
 const {settings,updateSettings}=useLibrary()
 const [editedDraft,setDraft]=useState(()=>schedulingSettings({...settings.scheduling,timezone:settings.timezone,dayStartTime:settings.dayStartTime,dayEndTime:settings.dayEndTime,defaultDurationMinutes:settings.taskDefaultDuration}))
 const [dirty,setDirty]=useState(false)
 const current=dirty?editedDraft:schedulingSettings({...settings.scheduling,timezone:settings.timezone,dayStartTime:settings.dayStartTime,dayEndTime:settings.dayEndTime,defaultDurationMinutes:settings.taskDefaultDuration})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const draft=current
 const patch=(value:Partial<typeof draft>)=>{setDraft(previous=>({...(!dirty?draft:previous),...value}));setDirty(true)}
 const compact=useMediaQuery(SETTINGS_COMPACT_QUERY)
 const [sheet,setSheet]=useState<PlannerSheet|null>(null),[sheetDraft,setSheetDraft]=useState<Draft|null>(null),[timeOpen,setTimeOpen]=useState<string|null>(null)
 // `override` lets a phone sheet save the values it just edited; the desktop button saves the current draft.
 const save=async(override?:Draft)=>{const draft=override??current;setBusy(true);setMessage('');try{
  try{schedulingSettings(draft)}catch{throw new Error(t('settings.ai.planning.invalid'))}
  if(!isSupabaseConfigured)throw new Error(t('settings.ai.planning.notConnected'))
  const client=getSupabaseClient(),auth=await client.auth.getUser()
  if(auth.error||!auth.data.user)throw new Error(t('settings.ai.planning.loginExpired'))
  const {dayStartTime,dayEndTime,defaultDurationMinutes}=draft
  const scheduling=Object.fromEntries(Object.entries(draft).filter(([name])=>!['now','startDate','endDate','timezone','dayStartTime','dayEndTime','defaultDurationMinutes'].includes(name)))
  const next:Settings={...settings,dayStartTime,dayEndTime,taskDefaultDuration:defaultDurationMinutes,defaultEventMinutes:defaultDurationMinutes,scheduling}
  const repo=createPreferenceRepository(client),current=await repo.get(auth.data.user.id),stored=toStoredPreference(auth.data.user.id,next)
  await repo.save({...stored,timezone:current?.timezone??stored.timezone,settings:{...current?.settings,...stored.settings}})
  updateSettings(next);setMessage(t('settings.ai.planning.saved'));if(compact)setDirty(false);return true
 }catch(error){setMessage(error instanceof Error?error.message:t('settings.ai.planning.saveFailed'));return false}finally{setBusy(false)}}
 if(compact){
  // Phones: the week follows the schedule's first weekday; long values open sheets that save with the same function.
  const order=settings.weekStartsOn===0?[7,1,2,3,4,5,6]:[1,2,3,4,5,6,7]
  const open=(name:PlannerSheet)=>{setMessage('');setSheetDraft(draft);setTimeOpen(null);setSheet(name)}
  const edit=(value:Partial<Draft>)=>setSheetDraft(previous=>previous&&{...previous,...value})
  const close=()=>{setSheet(null);setSheetDraft(null)}
  const commit=async()=>{if(!sheetDraft)return;setDraft(sheetDraft);setDirty(true);if(await save(sheetDraft))close()}
  const minutes=(value:number)=>t('settings.schedule.minutes',{count:value})
  const s=sheetDraft
  return <section aria-label={t('settings.ai.workHoursLabel')}>
   <MLabel>{t('settings.ai.plannerTitle')}</MLabel>
   <MCard>
    <MBlock title={t('settings.ai.planning.workDays')}>
     <div className="more-days" role="group" aria-label={t('settings.ai.planning.workDays')}>{order.map(day=><button key={day} type="button" aria-pressed={draft.workDays.includes(day)} onClick={()=>patch({workDays:draft.workDays.includes(day)?draft.workDays.filter(value=>value!==day):[...draft.workDays,day].sort()})}>{dayNames[day-1]}</button>)}</div>
    </MBlock>
    <MRow label={t('settings.mobile.workTime')} value={`${draft.dayStartTime} – ${draft.dayEndTime}`} onPress={()=>open('hours')} data-settings-row="work-hours"/>
    <MRow label={t('settings.mobile.maxDaily')} value={minutes(draft.maxDailyMinutes)} onPress={()=>open('max')} data-settings-row="max-daily"/>
    <MRow label={t('settings.mobile.defaultDuration')} value={minutes(draft.defaultDurationMinutes)} onPress={()=>open('duration')} data-settings-row="default-duration"/>
    <MRow icon={<SlidersHorizontal size={18} strokeWidth={1.6} aria-hidden="true"/>} label={t('settings.ai.planning.advanced')} hint={t('settings.mobile.advancedHint')} onPress={()=>open('advanced')} data-settings-row="advanced"/>
   </MCard>
   {dirty?<div className="more-save-row"><span>{t('settings.mobile.unsaved')}</span><button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void save()}>{busy?t('settings.ai.planning.saving'):t('settings.ai.planning.save')}</button></div>:null}
   {message&&!sheet?<p role="status" className="more-hint more-hint-accent">{message}</p>:<MHint>{t('settings.mobile.plannerHint')} <Link className="text-accent-text" to={ROUTES.quickAdd}>{t('settings.ai.openPlanner')}</Link></MHint>}
   {sheet&&s?<MSheet title={sheet==='hours'?t('settings.mobile.workTime'):sheet==='max'?t('settings.mobile.maxDaily'):sheet==='duration'?t('settings.mobile.defaultDuration'):t('settings.ai.planning.advanced')} onClose={close} onSave={()=>void commit()} busy={busy} saveLabel={busy?t('settings.ai.planning.saving'):t('settings.ai.planning.save')}>
    {sheet==='hours'?<div className="more-times">{(['dayStartTime','dayEndTime'] as const).map((key,index)=><MTimeField key={key} label={t(index?'settings.ai.planning.dayEnd':'settings.ai.planning.dayStart')} value={s[key]} open={timeOpen===key} onToggle={()=>setTimeOpen(timeOpen===key?null:key)} onChange={value=>edit({[key]:value})}/>)}</div>:null}
    {sheet==='max'?<label className="block text-xs">{t('settings.ai.planning.maxDaily')}<input className="field mt-1 w-full" type="number" inputMode="numeric" min="25" max="1440" value={s.maxDailyMinutes} onChange={e=>edit({maxDailyMinutes:Number(e.target.value)})}/></label>:null}
    {sheet==='duration'?<div className="more-options" role="radiogroup" aria-label={t('settings.ai.planning.defaultDuration')}>{[15,30,45,60,90,120].map(value=><button key={value} type="button" role="radio" aria-checked={s.defaultDurationMinutes===value} onClick={()=>edit({defaultDurationMinutes:value,minBlockMinutes:Math.min(s.minBlockMinutes,value)})}>{minutes(value)}</button>)}</div>:null}
    {sheet==='advanced'?<div className="space-y-3">
     <label className="block text-xs">{t('settings.ai.planning.placement')}<select className="field select mt-1 w-full" value={s.placementMode} onChange={e=>edit({placementMode:e.target.value as 'earliest'|'focus'})}><option value="earliest">{t('settings.ai.planning.placementEarliest')}</option><option value="focus">{t('settings.ai.planning.placementFocus')}</option></select></label>
     <div className="more-times">{(['preferredStartTime','preferredEndTime'] as const).map((key,index)=><MTimeField key={key} label={t(index?'settings.ai.planning.focusEnd':'settings.ai.planning.focusStart')} value={s[key]??null} fallback={index?'12:00':'09:00'} emptyLabel={t('settings.mobile.empty')} open={timeOpen===key} onToggle={()=>setTimeOpen(timeOpen===key?null:key)} onChange={value=>edit({[key]:value})}/>)}</div>
     <button type="button" className="text-xs text-neutral-500" onClick={()=>edit({preferredStartTime:null,preferredEndTime:null,placementMode:'earliest'})}>{t('settings.ai.planning.clearFocus')}</button>
     <label className="block text-xs">{t('settings.ai.planning.breakMinutes')}<input className="field mt-1 w-full" type="number" inputMode="numeric" min="0" max="240" value={s.breakMinutes} onChange={e=>edit({breakMinutes:Number(e.target.value)})}/></label>
     <div className="more-card"><MSwitch label={t('settings.ai.planning.allowSplit')} checked={s.allowSplit!==false} onChange={()=>edit({allowSplit:s.allowSplit===false})}/><MSwitch label={t('settings.ai.planning.useHistory')} hint={t('settings.ai.planning.useHistoryHint')} checked={s.useManualHistory===true} onChange={()=>edit({useManualHistory:s.useManualHistory!==true})}/></div>
    </div>:null}
    {message?<p role="status" className="mt-3 text-sm text-accent-text">{message}</p>:null}
   </MSheet>:null}
  </section>
 }
 return <section aria-label={t('settings.ai.workHoursLabel')} className="space-y-4">
  <div><h3 className="text-sm font-medium">{t('settings.ai.workHoursTitle')}</h3><p className="mt-1 text-xs text-neutral-500">{t('settings.ai.workHoursHint')} <Link className="text-blue-600" to={ROUTES.quickAdd}>{t('settings.ai.openPlanner')}</Link></p></div>
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
