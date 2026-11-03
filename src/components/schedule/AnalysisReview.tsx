import { ArrowLeft, ArrowRight } from 'lucide-react'
import { DeadlineFields } from '../tasks/DeadlineFields.tsx'
import { PriorityField } from '../tasks/Priority.tsx'
import { recommendPriority } from '../../../packages/parse/src/priority.ts'
import { useEffect, useRef, useState } from 'react'
import type { AnalysisItem, ScheduleAnalysis } from '@blanky/types'
import type { WorkInput, WorkItem, WorkspaceCategory } from '../../types/work.ts'
import { reviewedWorkInput, weeklyRequested } from '../../features/ai/review.ts'
import { RepeatPicker } from './RepeatPicker.tsx'

function ItemReview({ item, categories, onSave, preferredKind, weeklyRequested, register, hideSave, priorityText = '' }: { item: AnalysisItem; categories: WorkspaceCategory[]; onSave: (input: WorkInput) => Promise<WorkItem | null>; preferredKind?: 'event' | 'task'; weeklyRequested: boolean; register?: (read: () => WorkInput) => void; hideSave?: boolean; priorityText?: string }) {
  const suggestion = item.priorityRecommendation ?? recommendPriority(priorityText || item.draft.title + ' ' + (item.draft.description ?? ''))
  const [priority, setPriority] = useState(suggestion.priority)
  const [priorityEdited, setPriorityEdited] = useState(false)
  const [kind, setKind] = useState(preferredKind ?? item.type)
  const [draft, setDraft] = useState(item.draft)
  const [noTime, setNoTime] = useState(false)
  const [repeat, setRepeat] = useState<NonNullable<WorkInput['repeat']>>(weeklyRequested ? 'weekly' : 'none')
  const [repeatDays, setRepeatDays] = useState<number[]>([])
  const [timeConfirmed, setTimeConfirmed] = useState(false)
  const [deadlineConfirmed, setDeadlineConfirmed] = useState(false)
  const [status, setStatus] = useState<'ready' | 'saving' | 'saved'>('ready')
  const [error, setError] = useState('')
  const locked = useRef(false)
  const save = async () => {
    if (locked.current) return
    locked.current = true
    setError('')
    try {
      const input = reviewedWorkInput({ ...item, type: kind }, draft, noTime, categories.map(category => category.id), repeat, repeatDays, timeConfirmed, deadlineConfirmed)
      setStatus('saving')
      const saved = await onSave({...input, priority})
      if (!saved) throw new Error('저장하지 못했어요. 다시 시도해 주세요.')
      setStatus('saved')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장하지 못했어요.')
      setStatus('ready')
      locked.current = false
    }
  }
  register?.(() => ({...reviewedWorkInput({ ...item, type: kind }, draft, noTime, categories.map(category => category.id), repeat, repeatDays, timeConfirmed, deadlineConfirmed), priority}))
  return <fieldset disabled={status !== 'ready'} className="rounded-md border border-line p-3" data-analysis-item={item.id}>
    <legend className="px-1 text-xs">{kind === 'event' ? '일정' : '할 일'} · {Math.round(item.confidence * 100)}% {status === 'saved' ? '· 저장 완료' : ''}</legend>
    <label className="mb-2 block text-xs">유형<select className="field ml-2" value={kind} onChange={e => setKind(e.target.value as 'event' | 'task')}><option value="event">일정</option><option value="task">할 일</option></select></label>
    <label className="block text-xs">제목<input className="field mt-1 w-full" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <label className="text-xs">날짜<input className="field mt-1 w-full" type="date" value={draft.date ?? ''} onChange={e => setDraft({ ...draft, date: e.target.value || null })}/></label>
      {kind === 'task' ? <div className="col-span-2"><DeadlineFields date={draft.dueDate ?? ''} time={draft.dueTime ?? ''} onChange={(date, time) => setDraft({ ...draft, dueDate: date || null, dueTime: time || null })}/></div> : <label className="text-xs">종료 날짜<input className="field mt-1 w-full" type="date" value={draft.endDate ?? ''} onChange={e => setDraft({ ...draft, endDate: e.target.value || null })}/></label>}
      {kind === 'event' ? <div className="col-span-2 text-xs">시간<div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="시간"><button type="button" role="radio" className={draft.startTime ? 'field choice-on text-center' : 'field text-center text-neutral-400'} aria-checked={Boolean(draft.startTime)} onClick={() => { if (!draft.startTime) { setDraft({ ...draft, startTime: '09:00', endTime: '10:00' }); setNoTime(false) } }}>시각</button><button type="button" role="radio" className={!draft.startTime ? 'field choice-on text-center' : 'field text-center text-neutral-400'} aria-checked={!draft.startTime} onClick={() => { setDraft({ ...draft, startTime: null, endTime: null }); setNoTime(true) }}>종일</button></div></div> : null}
      {kind === 'task' || draft.startTime ? <><label className="text-xs">{kind === 'task' ? '시작 시각' : '시작'}<input className="field mt-1 w-full" type="time" value={draft.startTime ?? ''} onChange={e => { setDraft({ ...draft, startTime: e.target.value || null }); setNoTime(false) }}/></label>
      <label className="text-xs">{kind === 'task' ? '종료 시각' : '종료'}<input className="field mt-1 w-full" type="time" value={draft.endTime ?? ''} onChange={e => setDraft({ ...draft, endTime: e.target.value || null })}/></label></> : null}
    </div>
    {kind === 'task' && <div className="mt-3"><PriorityField value={priority} onChange={value => {setPriority(value); setPriorityEdited(true)}}/><p className="mt-1 text-xs text-neutral-500">{priorityEdited ? '사용자 지정' : 'AI 추천'} · {suggestion.reason}</p></div>}
    <label className="mt-3 block text-xs">카테고리<select className="field mt-1 w-full" value={draft.categoryId ?? ''} onChange={e => setDraft({ ...draft, categoryId: e.target.value || null })}><option value="">미분류</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    <div className="mt-3"><RepeatPicker repeat={repeat} days={repeatDays} date={draft.date ?? ''} onChange={(value, days) => { setRepeat(value); setRepeatDays(days) }}/></div>
    {item.uncertainties.some(entry => ['startTime','endTime'].includes(entry.field) && /추정/.test(entry.reason)) && <label className="mt-3 flex gap-2 text-xs text-blue-600"><input type="checkbox" checked={timeConfirmed} onChange={e => setTimeConfirmed(e.target.checked)}/>표시된 시작·종료 시각을 확인했어요.</label>}
    {draft.startTime && draft.endTime && draft.endTime > draft.startTime && <p className="mt-2 text-xs text-neutral-500">소요시간 {((Number(draft.endTime.slice(0,2))*60+Number(draft.endTime.slice(3)))-(Number(draft.startTime.slice(0,2))*60+Number(draft.startTime.slice(3))))}분</p>}
    {weeklyRequested && <p className="mt-2 text-xs text-blue-600">매주 반복 요청을 반영했어요. 첫 날짜와 반복 설정을 확인한 후 저장해 주세요.</p>}
    {item.categoryReason && <p className="mt-2 text-xs text-neutral-500">추천 이유: {item.categoryReason}</p>}
    {item.uncertainties.map((entry, index) => <p key={index} className="mt-1 text-xs text-amber-700">확인 필요: {entry.reason}</p>)}
    {kind === 'task' && item.uncertainties.some(entry => entry.field === 'dueDate' || entry.field === 'dueTime') && <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={deadlineConfirmed} onChange={e => setDeadlineConfirmed(e.target.checked)}/>마감일·시각을 수정하거나 해제한 내용을 확인했어요.</label>}
    {kind === 'event' && !draft.startTime && <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={noTime} onChange={e => setNoTime(e.target.checked)}/>시간 없음으로 저장</label>}
    {!draft.endTime && draft.startTime && <p className="mt-2 text-xs text-neutral-500">종료 시각은 미정으로 유지합니다.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    <label className="mt-3 block text-xs">설명 · 세부 작업<textarea className="field mt-1 w-full" value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label>
    {!hideSave && <button type="button" data-theme-slot="button-primary" className="btn btn-primary mt-3" onClick={() => void save()}>{status === 'saved' ? '저장 완료' : status === 'saving' ? '저장 중…' : '확인 후 저장'}</button>}
  </fieldset>
}

export function AnalysisReview({ analysis, categories, onSave, onSaveAll, onClose, preferredKind, originalText = '' }: { analysis: ScheduleAnalysis; categories: WorkspaceCategory[]; onSave: (input: WorkInput) => Promise<WorkItem | null>; onSaveAll: (inputs: WorkInput[]) => Promise<unknown>; onClose: () => void; preferredKind?: 'event' | 'task'; originalText?: string }) {
  const [page, setPage] = useState(0)
  const [combined, setCombined] = useState<AnalysisItem | null>(null)
  const [merged, setMerged] = useState(false)
  const [excluded, setExcluded] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [savedIds, setSavedIds] = useState<string[]>([])
  const readers = useRef(new Map<string, () => WorkInput>())
  const lock = useRef(false)
  const multi = analysis.items.length > 1
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!multi) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [multi])
  const rows = merged && combined ? [combined] : analysis.items
  const close = () => { if (!busy && (done || window.confirm('저장하지 않은 변경 사항을 닫을까요?'))) onClose() }
  const merge = () => {
    try {
      if (!combined) {
        const inputs = analysis.items.filter(item => !excluded.includes(item.id)).map(item => readers.current.get(item.id)!())
        if (!inputs.length) throw new Error('저장할 항목을 선택해 주세요.')
        setCombined({ ...analysis.items[0], id: 'combined', type: 'task', uncertainties: [], draft: { ...analysis.items[0].draft, title: inputs.map(row => row.title).join(' 및 '), description: inputs.map(row => `${row.description || row.title} (${row.date}${row.startTime ? ' ' + row.startTime : ''}${row.endTime ? '–' + row.endTime : ''}${row.dueDate ? '; 마감 ' + row.dueDate + ' ' + (row.dueTime ?? '') : ''})`).join(' → '), date: inputs[0].date, startTime: null, endTime: null, endDate: null, dueDate: inputs.map(row => row.dueDate).filter((day): day is string => !!day).sort().at(-1) ?? null, dueTime: null } })
      }
      setMerged(true); setPage(0); setError('')
    } catch (error) { setError((error as Error).message) }
  }
  const apply = async () => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const inputs = rows.filter(row => !excluded.includes(row.id) && !savedIds.includes(row.id)).map(row => {
        try { return readers.current.get(row.id)!() } catch (error) { setPage(rows.indexOf(row)); throw error }
      })
      if (!inputs.length) throw new Error('저장할 항목을 선택해 주세요.')
      const identities = inputs.map(input => JSON.stringify([input.kind, input.title.replace(/\s/g, '').toLowerCase(), input.date, input.dueDate, input.dueTime, input.startTime, input.endTime]))
      if (new Set(identities).size !== inputs.length) throw new Error('같은 내용과 날짜의 항목이 중복되어 있어요. 중복 항목을 제외해 주세요.')
      await onSaveAll(inputs); setDone(true)
    } catch (error) { setError((error as Error).message) }
    finally { lock.current = false; setBusy(false) }
  }
  const saveOne = async (id: string, input: WorkInput) => {
    if (lock.current) return null
    lock.current = true; setBusy(true)
    try {
      const saved = await onSave(input)
      if (saved) {
        setSavedIds(current => [...current, id])
        if (!multi || savedIds.length + 1 === rows.length) setDone(true)
      }
      return saved
    } finally { lock.current = false; setBusy(false) }
  }
  const title = (id: string) => analysis.items.find(item => item.id === id)?.draft.title ?? id
  return <div className={multi ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4' : 'mt-4'} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
    if (multi && e.key === 'Tab') {
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])].filter(node => node.getClientRects().length && !node.closest('fieldset:disabled'))
      const next = e.shiftKey ? nodes.at(-1) : nodes[0]
      if (document.activeElement === panel.current || document.activeElement === (e.shiftKey ? nodes[0] : nodes.at(-1))) { e.preventDefault(); next?.focus() }
    }
  }}><section ref={panel} tabIndex={-1} role={multi ? 'dialog' : undefined} aria-modal={multi || undefined} aria-label="AI 분석 결과" className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-md border border-line bg-surface p-4">
    <div className="flex items-center justify-between gap-2"><h2>AI 분석 결과</h2><button type="button" disabled={busy} className="btn btn-ghost" onClick={close}>닫기</button></div>
    {multi && <><p>{page + 1} / {rows.length} · 총 {analysis.items.length}개</p><div className="flex gap-2"><button className={merged ? 'btn btn-primary' : 'btn btn-ghost'} disabled={busy || done || savedIds.length > 0} onClick={merge}>하나로 합치기</button><button className={!merged ? 'btn btn-primary' : 'btn btn-ghost'} disabled={busy || done || savedIds.length > 0} onClick={() => { setMerged(false); setPage(0) }}>각각 저장하기</button></div></>}
    {analysis.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-700">{warning}</p>)}
    {analysis.relations.map((relation, index) => <p key={index} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-neutral-500"><span className="min-w-0 break-words">{title(relation.fromId)}</span>{relation.type === 'before' ? <ArrowRight size={14} strokeWidth={1.5} className="block shrink-0" role="img" aria-label="다음 작업" /> : <span className="inline-flex shrink-0 items-center gap-1.5"><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" />선행 작업:</span>}<span className="min-w-0 break-words">{title(relation.toId)} · {relation.reason}</span></p>)}
    {analysis.relations.length > 0 && <p className="text-xs text-neutral-500">순서와 관계는 참고 정보이며 자동 배치되지 않습니다.</p>}
    <fieldset disabled={busy || done}>{[...analysis.items, ...(combined ? [combined] : [])].map(item => <div key={item.id} hidden={rows[page]?.id !== item.id}><ItemReview priorityText={analysis.items.length === 1 ? originalText : ''} item={item} categories={categories} onSave={input => saveOne(item.id, input)} preferredKind={multi ? undefined : preferredKind} weeklyRequested={weeklyRequested(originalText, item)} hideSave={excluded.includes(item.id)} register={read => { readers.current.set(item.id, read) }}/>{multi && <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" disabled={savedIds.includes(item.id)} checked={!excluded.includes(item.id)} onChange={e => setExcluded(current => e.target.checked ? current.filter(id => id !== item.id) : [...current, item.id])}/>이 항목 저장</label>}</div>)}</fieldset>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {done && <p role="status">전체 저장 완료</p>}
    {multi && <nav aria-label="분석 항목 이동" className="flex items-center justify-between"><button className="btn btn-ghost" disabled={busy || page === 0} onClick={() => setPage(page - 1)}><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> 이전</button>{page === rows.length - 1 ? <button data-theme-slot="button-primary" className="btn btn-primary" disabled={busy || done} onClick={() => void apply()}>{busy ? '저장 중…' : '전체 저장'}</button> : <button className="btn btn-ghost" disabled={busy} onClick={() => setPage(page + 1)}>다음 <ArrowRight size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /></button>}</nav>}
  </section></div>
}
