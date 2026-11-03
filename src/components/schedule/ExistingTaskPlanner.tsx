import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlannerDraft, PlannerEdit, PlanningRecommendation } from '@blanky/types'
import { schedulingSettings } from '../../../packages/scheduling/src/settings.ts'
import { editsFromRecommendation } from '../../../packages/scheduling/src/approval.ts'
import type { BusySchedule } from '../../../packages/scheduling/src/engine.ts'
import { recommendExistingTasks, existingTaskUpdates, preserveExistingChoices, loadExistingPlanningTasks } from '../../features/ai/existingTaskPlanning.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { getPlannerSchedules } from '../../services/ai/index.ts'
import { getScheduleRepository } from '../../services/schedule/index.ts'
import { workFromSchedule } from '../../services/schedule/workStore.ts'
import { PlannerPreview } from './PlannerPreview.tsx'
import type { WorkItem } from '../../types/work.ts'

export function ExistingTaskPlanner({ task }: { task: WorkItem }) {
  const library = useLibrary()
  const current = useRef(library)
  useEffect(()=>{current.current=library},[library])
  const ids = [task.id]
  const dependencies: Record<string,string[]> = {}
  const [preview,setPreview] = useState<{plan:PlanningRecommendation; existing:BusySchedule[]; draft?:Pick<PlannerDraft,'edits'|'saved'>; key:string}|null>(null)
  const [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const [applying,setApplying] = useState(false)
  const generating = useRef(false)
  const lock = useRef(false), applied = useRef<PlannerEdit[]>([])
  const loadBusy = async (start:string,end:string) => isSupabaseConfigured
    ? [...current.current.items.filter(item => !current.current.isRemoteWork(item.id)), ...await getPlannerSchedules(start,end)]
    : current.current.items
  const loadTasks = () => loadExistingPlanningTasks(current.current.items, ids, current.current.isRemoteWork,
    async remote => (await getScheduleRepository().listByIds(remote)).map(row => workFromSchedule(row)))
  const generate = async (keep:PlannerEdit[] = []) => {
    if (generating.current) return
    generating.current=true
    setError('');setBusy(true)
    try {
      const prefs=current.current.settings
      const settings=schedulingSettings({...prefs.scheduling, dayStartTime:prefs.dayStartTime,dayEndTime:prefs.dayEndTime,defaultDurationMinutes:prefs.taskDefaultDuration})
      const existing=await loadBusy(settings.startDate,settings.endDate)
      const rows=await loadTasks()
      const remaining=ids.filter(id => !applied.current.some(edit => preview?.plan.result.blocks.find(b=>b.id===edit.id)?.sourceTaskId===id))
      if(!remaining.length) throw new Error('선택한 할 일이 모두 적용되었어요.')
      let plan=recommendExistingTasks(rows,remaining,existing,settings,dependencies)
      if(preview && keep.length) plan=preserveExistingChoices(plan,preview.plan,keep,existing)
      // Keep confirmed rows (including user-adjusted priorities and durations) as fixed choices.
      const edits=editsFromRecommendation(plan).map(edit => {
        const prior=keep.find(row=>row.id===edit.id)
        return prior ? prior.confirmed ? prior : {...edit,priority:prior.priority,included:prior.included} : edit
      })
      plan.approval={previewId:crypto.randomUUID(),token:'existing-local',expiresAt:new Date(Date.now()+3600000).toISOString()}
      setPreview({plan,existing,draft:{edits,saved:[]},key:plan.approval.previewId})
    } catch(e) {setError((e as Error).message)} finally {generating.current=false;setBusy(false)}
  }
  return <>
    <button data-theme-slot="button" type="button" disabled={busy} aria-busy={busy} aria-label={task.title+' 시간 추천'} className="shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs text-accent-text hover:bg-accent-light disabled:opacity-50" onClick={()=>{if(generating.current)return;applied.current=[];void generate()}}>{busy ? '추천 중…' : '시간 추천'}</button>
    {(preview || error) && createPortal(<div role="dialog" aria-modal="true" aria-label={task.title+' 시간 추천 확인'} className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-3 sm:p-6" onClick={event=>event.stopPropagation()}>
    <section className="mx-auto max-w-4xl rounded-xl border border-line bg-surface p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm">{task.title} · 시간 추천</p><button type="button" className="chip" disabled={applying || busy} onClick={()=>{setPreview(null);setError('')}}>닫기</button></div>
      {preview && <PlannerPreview key={preview.key} input="선택한 기존 할 일의 시간 배정" plan={preview.plan} existing={preview.existing} initialDraft={preview.draft} onCancel={()=>setPreview(null)} onRegenerate={async edits=>{await generate(edits)}} onApply={async edits=>{
        if(lock.current) throw new Error('적용 중이에요.')
        lock.current=true
        setApplying(true)
        try {
          const settings=preview.plan.result.settings
          const existing=await loadBusy(settings.startDate,settings.endDate)
          const rows=await loadTasks()
          const pending=edits.filter(edit=>!applied.current.some(row=>row.id===edit.id))
          const updates=pending.length?existingTaskUpdates(preview.plan,pending,rows,existing,new Date().toISOString(),applied.current):[]
          const done:{blockId:string;scheduleId:string}[]=applied.current.filter(row=>edits.some(edit=>edit.id===row.id)).map(row=>({blockId:row.id,scheduleId:preview.plan.result.blocks.find(block=>block.id===row.id)!.sourceTaskId}))
          for(const update of updates) {
            const saved=await current.current.commitWork(update.before,update.after,'manual')
            if(!saved) throw new Error('저장하지 못했어요.')
            applied.current.push(edits.find(edit=>edit.id===update.blockId)!)
            done.push({blockId:update.blockId,scheduleId:saved.id})
          }
          return {schedules:[],applied:done}
        } finally {lock.current=false;setApplying(false)}
      }}/>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section></div>, document.body)}
  </>
}
