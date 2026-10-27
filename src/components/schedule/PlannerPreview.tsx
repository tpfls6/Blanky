import { useEffect, useRef, useState } from 'react'
import type { PlannerEdit, PlanningRecommendation, Schedule } from '@blanky/types'
import type { BusySchedule } from '../../../packages/scheduling/src/engine.ts'
import { editsFromRecommendation, validatePlannerEdits } from '../../../packages/scheduling/src/approval.ts'
import { patchPlannerEdit } from '../../features/ai/plannerEdits.ts'
import { validateDraftEdits } from '../../../packages/types/src/plannerDraft.ts'
import type { PlannerDraft } from '@blanky/types'

const reason:Record<string,string>={INSUFFICIENT_CAPACITY:'빈 시간 또는 작업 한도가 부족해요.',DEADLINE_PASSED:'마감일이 지났어요.',DEPENDENCY_UNSCHEDULED:'선행 작업을 배치하지 못했어요.',DEPENDENCY_CYCLE:'작업 순서가 서로 순환해요.',BELOW_MIN_BLOCK:'최소 작업 단위보다 짧아요.',RECOMMENDATION_LIMIT:'추천 항목 한도에 도달했어요.'}
export function PlannerPreview({input,plan,existing,onApply,onRegenerate,onRemaining,onCancel,initialDraft,onDraftChange}:{input:string;plan:PlanningRecommendation;existing:BusySchedule[];onApply:(blocks:PlannerEdit[])=>Promise<{schedules:Schedule[];applied:{blockId:string;scheduleId:string}[]}>;onRegenerate:()=>Promise<void>;onRemaining?:(edits:PlannerEdit[])=>Promise<void>;onCancel:()=>void;initialDraft?:Pick<PlannerDraft,'edits'|'saved'>;onDraftChange?:(draft:PlannerDraft)=>void}) {
 const storageKey='blanky.planner.edits.'+(plan.approval?.previewId??'preview')+'.'+(plan.approval?.token.slice(-16)??'local')
 const restore=()=>{try{const value=initialDraft??JSON.parse(sessionStorage.getItem(storageKey)??'null');if(value){validateDraftEdits(value.edits,plan);if(!Array.isArray(value.saved)||value.saved.some((id:unknown)=>typeof id!=='string'||!plan.result.blocks.some(block=>block.id===id)))return null;return value}}catch{/* ignore invalid local draft */}return null}
 const [edits,setEdits]=useState<PlannerEdit[]>(()=>restore()?.edits??editsFromRecommendation(plan)),[saved,setSaved]=useState<string[]>(()=>restore()?.saved?.filter((id:unknown)=>typeof id==='string')??[]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 useEffect(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify({edits,saved}))}catch{/* visible draft remains usable */}},[storageKey,edits,saved])
 useEffect(()=>{onDraftChange?.({input,plan,edits,saved})},[input,plan,edits,saved,onDraftChange])
 const locked=useRef(false)
 const pending=edits.filter(edit=>edit.included&&!saved.includes(edit.id))
 const check=(rows:PlannerEdit[])=>{try{validatePlannerEdits(plan,rows,existing.filter(item=>!plan.changes?.some(change=>change.scheduleId===item.id&&rows.some(row=>row.included&&row.id===change.blockId))),new Date().toISOString(),edits.filter(edit=>saved.includes(edit.id)));return ''}catch(error){return error instanceof Error?error.message:'수정 내용을 확인해 주세요.'}}
 const validation=pending.length?(check(pending.map(edit=>({...edit,confirmed:true})))||check(pending)):''
 const apply=async(rows:PlannerEdit[])=>{
  if(locked.current)return
  const problem=check(rows);if(problem){setError(problem);return}
  locked.current=true;setBusy(true);setError('');setNotice('')
  try {
   const response=await onApply(rows)
   setSaved(current=>[...new Set([...current,...response.applied.map(row=>row.blockId)])])
   setNotice(`${response.applied.length}개 일정을 적용했어요. Calendar와 Today에서 확인할 수 있어요.`)
  } catch(error){setError(error instanceof Error?error.message:'저장하지 못했어요. 추천과 수정 내용은 유지됩니다.')}
  finally{locked.current=false;setBusy(false)}
 }
 const regenerate=async()=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await onRegenerate()}catch(error){setError(error instanceof Error?error.message:'다시 생성하지 못했어요. 기존 추천은 유지됩니다.')}finally{locked.current=false;setBusy(false)}}
 const remaining=async()=>{if(locked.current||!onRemaining)return;locked.current=true;setBusy(true);setError('');try{await onRemaining(edits)}catch(error){setError(error instanceof Error?error.message:'남은 작업을 다시 계획하지 못했어요. 기존 초안은 유지됩니다.')}finally{locked.current=false;setBusy(false)}}
 const [page,setPage]=useState(0)
 const pageCount=Math.max(1,Math.ceil(edits.length/20)),pageRows=[...edits].sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.id.localeCompare(b.id)).slice(page*20,(page+1)*20)
 const days=[...new Set(pageRows.map(edit=>edit.date))].sort()
 return <section aria-label="AI Planner 미리보기" className="mt-6 space-y-5 rounded-xl border border-line bg-surface p-4 sm:p-5">
  <div><p className="text-xs font-medium text-blue-600">AI PLANNER · {saved.length?`${saved.length}개 승인 저장됨`:'승인 전 미저장'}</p><h2 className="mt-1 text-lg font-medium">이번 계획을 확인해 주세요</h2><p className="mt-3 whitespace-pre-wrap text-sm text-neutral-500">{input}</p><p className="mt-2 text-xs text-neutral-400">{plan.result.settings.timezone} · 하루 최대 {plan.result.settings.maxDailyMinutes}분 · 휴식 {plan.result.settings.breakMinutes}분</p></div>
  {plan.progress&&<div className="rounded-md bg-green-50 p-3 text-xs text-green-700"><p>이전 승인 {plan.progress.approved.length}개 · 남은 작업 {plan.progress.remainingCount}개</p>{plan.progress.approved.map(task=><p key={task.id}>승인 완료 · {task.title}</p>)}</div>}
  <div className="space-y-2"><h3 className="text-sm font-medium">분석한 작업</h3>{plan.result.tasks.map(outcome=><div key={outcome.task.id} className="rounded-md bg-panel px-3 py-2 text-sm">
   <span>{outcome.task.title}</span><span className="ml-2 text-xs text-neutral-500">{outcome.requestedMinutes}분 · {outcome.task.occurrences}회 · {outcome.task.deadline??'마감 미정'} · 우선순위 {{high:'높음',medium:'보통',low:'낮음'}[outcome.task.priority]}</span>
   {outcome.status!=='scheduled'&&<><p className="mt-1 text-xs text-blue-600">미배치 {outcome.remainingMinutes}분 · {reason[outcome.reason??'']??'모든 작업을 배치하지 못했어요.'}</p>{outcome.confirmationNeeded.map((message,index)=><p key={index} className="mt-1 text-xs text-blue-600">확인 필요: {message}</p>)}</>}
  </div>)}</div>
  {plan.changes&&<div className="space-y-2 rounded-md bg-blue-50 p-3"><h3 className="text-sm text-blue-700">재배치 전후 비교 · 승인한 AI 일정만 이동</h3>{plan.changes.map(change=>{const edit=edits.find(edit=>edit.id===change.blockId);return <div key={change.scheduleId} className="text-xs"><p>{change.title} · {change.reason}</p><p className="text-neutral-500">기존 {change.beforeStart.slice(0,16).replace('T',' ')} – {change.beforeEnd.slice(11,16)}</p><p className="text-blue-600">추천 {edit?edit.date+' '+edit.startTime+' – '+edit.endTime:'미배치 — 기존 일정 유지'}</p></div>})}</div>}
  {plan.result.warnings.map((warning,index)=><p key={index} className="text-xs text-blue-600">{warning}</p>)}
  {pageCount>1&&<nav aria-label="추천 일정 페이지" className="flex flex-wrap items-center gap-3 text-sm"><button type="button" className="btn btn-ghost" disabled={page===0} onClick={()=>setPage(page-1)}>이전</button><span>{page+1} / {pageCount} · 총 {edits.length}개</span><button type="button" className="btn btn-ghost" disabled={page+1>=pageCount} onClick={()=>setPage(page+1)}>다음</button><p className="w-full text-xs text-neutral-500">전체 적용은 모든 페이지에서 선택한 일정을 저장합니다.</p></nav>}
  {days.map(day=><div key={day} className="space-y-3"><h3 className="text-sm font-medium">{day}</h3>{pageRows.filter(edit=>edit.date===day).sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.id.localeCompare(b.id)).map(edit=>{
   const block=plan.result.blocks.find(block=>block.id===edit.id)!,applied=saved.includes(edit.id)
   const patch=(value:Partial<PlannerEdit>)=>setEdits(current=>current.map(row=>row.id===edit.id?patchPlannerEdit(row,value):row))
   return <fieldset key={edit.id} disabled={busy||applied} data-planner-block={edit.id} className={`rounded-lg border border-line p-3 ${!edit.included?'opacity-50':''}`}>
    <div className="mb-3 flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.included} onChange={event=>patch({included:event.target.checked})}/>{applied?<span className="text-green-600">적용 완료</span>:'이 일정 적용'}</label><span className="text-xs text-neutral-400">{block.occurrence}회차 · {block.part}번째</span></div>
    <label className="block text-xs">작업 제목<input data-theme-slot="input" className="field mt-1 w-full" value={edit.title} onChange={event=>patch({title:event.target.value})}/></label>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><label className="min-w-0 text-xs">시작 날짜<input className="field mt-1 w-full min-w-0" type="date" value={edit.date} onChange={event=>patch({date:event.target.value})}/></label><label className="text-xs">시작 시간<input className="field mt-1 w-full" type="time" value={edit.startTime} onChange={event=>patch({startTime:event.target.value})}/></label><label className="text-xs">종료 시간<input className="field mt-1 w-full" type="time" value={edit.endTime} onChange={event=>patch({endTime:event.target.value})}/></label><label className="text-xs">소요시간(분)<input className="field mt-1 w-full" type="number" min="1" value={edit.durationMinutes} onChange={event=>patch({durationMinutes:Number(event.target.value)})}/></label><label className="text-xs">우선순위<select className="field mt-1 w-full" value={edit.priority} onChange={event=>patch({priority:event.target.value as PlannerEdit['priority']})}><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option></select></label></div>
    <p className="mt-2 text-xs text-neutral-400">{block.reason}</p>
    {block.confirmationNeeded.length>0&&<div className="mt-3 rounded-md bg-blue-50 p-2 text-xs text-blue-700">{block.confirmationNeeded.map((text,index)=><p key={index}>{text}</p>)}<label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={edit.confirmed} onChange={event=>patch({confirmed:event.target.checked})}/>추정 정보와 확인 사항을 확인했어요</label></div>}
    <button type="button" className="btn btn-ghost mt-3 text-blue-600" disabled={!edit.included} onClick={()=>void apply([edit])}>개별 적용</button>
   </fieldset>
  })}</div>)}
  {!edits.length&&<p role="status" className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">추천 가능한 시간이 부족해요. 작업 가능 범위나 하루 한도를 조정해 다시 요청해 주세요.</p>}
  {validation&&<p role="status" className="text-sm text-blue-600">{validation}</p>}{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{notice&&<p role="status" className="text-sm text-green-600">{notice}</p>}
  <div className="flex flex-wrap gap-2">{onRemaining&&plan.mode!=='reschedule'&&<button type="button" className="btn btn-ghost text-blue-600" disabled={busy} onClick={()=>void remaining()}>남은 작업 다시 계획하기</button>}<button type="button" data-theme-slot="button-primary" className="btn btn-primary" disabled={busy||!pending.length||!!validation} onClick={()=>void apply(pending)}>{busy?'처리 중…':`선택한 ${pending.length}개 전체 적용`}</button><button type="button" className="btn btn-ghost" disabled={busy||saved.length>0} onClick={()=>void regenerate()}>추천 다시 생성</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>{saved.length?'닫기':'취소'}</button></div>
 </section>
}
