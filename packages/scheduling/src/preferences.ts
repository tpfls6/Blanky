import type { UserPreference } from '../../types/src/preference.ts'
import type { SchedulingSettings } from '../../types/src/planning.ts'
export function planningPreferences(preference:UserPreference|null):Partial<SchedulingSettings>{
 if(!preference)return {}
 const raw=preference.settings.scheduling
 const saved=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{}
 const allowed=['workDays','maxDailyMinutes','breakMinutes','minBlockMinutes','maxBlockMinutes','repeatOnSeparateDays','allowSplit','placementMode','preferredStartTime','preferredEndTime','useManualHistory']
 return {timezone:preference.timezone,dayStartTime:preference.dayStartTime,dayEndTime:preference.dayEndTime,defaultDurationMinutes:preference.defaultDuration,...Object.fromEntries(Object.entries(saved).filter(([name])=>allowed.includes(name)))} as Partial<SchedulingSettings>
}

/** Explicit manual changes and user edits inside approvals; automatic AI changes are excluded. */
export function manualHistorySamples(rows:{source:unknown;action:unknown;after_data:unknown}[]){
 return rows.flatMap(row=>{
  const value=row.after_data as Record<string,unknown>|null,meta=value?.planner_metadata as {userEdited?:boolean}|null
  const explicit=row.source==='manual'&&row.action==='updated'||row.source==='ai_chat'&&meta?.userEdited===true
  return explicit&&value&&typeof value.title==='string'&&typeof value.duration_minutes==='number'&&['high','medium','low'].includes(String(value.priority))?[{title:value.title,duration:value.duration_minutes,priority:value.priority as 'high'|'medium'|'low'}]:[]
 })
}
