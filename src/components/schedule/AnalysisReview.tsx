import { useRef, useState } from 'react'
import type { AnalysisItem, ScheduleAnalysis } from '@blanky/types'
import type { WorkInput, WorkItem, WorkspaceCategory } from '../../types/work.ts'
import { reviewedWorkInput } from '../../features/ai/review.ts'
import { RepeatPicker } from './RepeatPicker.tsx'

function ItemReview({ item, categories, onSave, preferredKind, weeklyRequested }: { item: AnalysisItem; categories: WorkspaceCategory[]; onSave: (input: WorkInput) => Promise<WorkItem | null>; preferredKind?: 'event' | 'task'; weeklyRequested: boolean }) {
  const [kind, setKind] = useState(preferredKind ?? item.type)
  const [draft, setDraft] = useState(item.draft)
  const [noTime, setNoTime] = useState(false)
  const [repeat, setRepeat] = useState<NonNullable<WorkInput['repeat']>>(weeklyRequested ? 'weekly' : 'none')
  const [repeatDays, setRepeatDays] = useState<number[]>([])
  const [timeConfirmed, setTimeConfirmed] = useState(false)
  const [status, setStatus] = useState<'ready' | 'saving' | 'saved'>('ready')
  const [error, setError] = useState('')
  const locked = useRef(false)
  const save = async () => {
    if (locked.current) return
    locked.current = true
    setError('')
    try {
      const input = reviewedWorkInput({ ...item, type: kind }, draft, noTime, categories.map(category => category.id), repeat, repeatDays, timeConfirmed)
      setStatus('saving')
      const saved = await onSave(input)
      if (!saved) throw new Error('저장하지 못했어요. 다시 시도해 주세요.')
      setStatus('saved')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장하지 못했어요.')
      setStatus('ready')
      locked.current = false
    }
  }
  return <fieldset disabled={status !== 'ready'} className="rounded-md border border-line p-3" data-analysis-item={item.id}>
    <legend className="px-1 text-xs">{kind === 'event' ? '일정' : '할 일'} · {Math.round(item.confidence * 100)}% {status === 'saved' ? '· 저장 완료' : ''}</legend>
    <label className="mb-2 block text-xs">유형<select className="field ml-2" value={kind} onChange={e => setKind(e.target.value as 'event' | 'task')}><option value="event">일정</option><option value="task">할 일</option></select></label>
    <label className="block text-xs">제목<input className="field mt-1 w-full" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <label className="text-xs">날짜<input className="field mt-1 w-full" type="date" value={draft.date ?? ''} onChange={e => setDraft({ ...draft, date: e.target.value || null })}/></label>
      <label className="text-xs">{kind === 'task' ? '마감일' : '종료 날짜'}<input className="field mt-1 w-full" type="date" value={(kind === 'task' ? draft.dueDate : draft.endDate) ?? ''} onChange={e => setDraft({ ...draft, [kind === 'task' ? 'dueDate' : 'endDate']: e.target.value || null })}/></label>
      <label className="text-xs">시작 시각<input className="field mt-1 w-full" type="time" value={draft.startTime ?? ''} onChange={e => setDraft({ ...draft, startTime: e.target.value || null })}/></label>
      <label className="text-xs">종료 시각<input className="field mt-1 w-full" type="time" value={draft.endTime ?? ''} onChange={e => setDraft({ ...draft, endTime: e.target.value || null })}/></label>
    </div>
    <label className="mt-3 block text-xs">카테고리<select className="field mt-1 w-full" value={draft.categoryId ?? ''} onChange={e => setDraft({ ...draft, categoryId: e.target.value || null })}><option value="">미분류</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    <div className="mt-3"><RepeatPicker repeat={repeat} days={repeatDays} date={draft.date ?? ''} onChange={(value, days) => { setRepeat(value); setRepeatDays(days) }}/></div>
    {item.uncertainties.some(entry => ['startTime','endTime'].includes(entry.field) && /추정/.test(entry.reason)) && <label className="mt-3 flex gap-2 text-xs text-blue-600"><input type="checkbox" checked={timeConfirmed} onChange={e => setTimeConfirmed(e.target.checked)}/>표시된 시작·종료 시각을 확인했어요.</label>}
    {draft.startTime && draft.endTime && draft.endTime > draft.startTime && <p className="mt-2 text-xs text-neutral-500">소요시간 {((Number(draft.endTime.slice(0,2))*60+Number(draft.endTime.slice(3)))-(Number(draft.startTime.slice(0,2))*60+Number(draft.startTime.slice(3))))}분</p>}
    {weeklyRequested && <p className="mt-2 text-xs text-blue-600">매주 반복 요청을 반영했어요. 첫 날짜와 반복 설정을 확인한 후 저장해 주세요.</p>}
    {item.categoryReason && <p className="mt-2 text-xs text-neutral-500">추천 이유: {item.categoryReason}</p>}
    {item.uncertainties.map((entry, index) => <p key={index} className="mt-1 text-xs text-amber-700">확인 필요: {entry.reason}</p>)}
    {kind === 'event' && !draft.startTime && <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={noTime} onChange={e => setNoTime(e.target.checked)}/>시간 없음으로 저장</label>}
    {!draft.endTime && draft.startTime && <p className="mt-2 text-xs text-neutral-500">종료 시각은 미정으로 유지합니다.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    <button type="button" data-theme-slot="button-primary" className="btn btn-primary mt-3" onClick={() => void save()}>{status === 'saved' ? '저장 완료' : status === 'saving' ? '저장 중…' : '확인 후 저장'}</button>
  </fieldset>
}

export function AnalysisReview({ analysis, categories, onSave, onClose, preferredKind, originalText = '' }: { analysis: ScheduleAnalysis; categories: WorkspaceCategory[]; onSave: (input: WorkInput) => Promise<WorkItem | null>; onClose: () => void; preferredKind?: 'event' | 'task'; originalText?: string }) {
  const title = (id: string) => analysis.items.find(item => item.id === id)?.draft.title ?? id
  return <section aria-label="분석 결과 확인" className="mt-4 space-y-3 rounded-md border border-line bg-surface p-3">
    <div className="flex items-center justify-between gap-2"><p className="min-w-0 text-sm">{analysis.items.length}개 항목 · 내용을 확인한 후 각각 저장해 주세요.</p><button type="button" className="btn btn-ghost shrink-0 whitespace-nowrap" onClick={onClose}>닫기</button></div>
    {analysis.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-700">{warning}</p>)}
    {analysis.relations.map((relation, index) => <p key={index} className="text-xs text-neutral-500">{title(relation.fromId)} {relation.type === 'before' ? '→' : '← 선행 작업:'} {title(relation.toId)} · {relation.reason}</p>)}
    {analysis.relations.length > 0 && <p className="text-xs text-neutral-500">순서와 관계는 참고 정보이며 자동 배치되지 않습니다.</p>}
    {analysis.items.map(item => <ItemReview key={item.id} item={item} categories={categories} onSave={onSave} preferredKind={preferredKind} weeklyRequested={item.source === 'rule' && /^weekly-\d+$/.test(item.id) && /매주|주마다|매\s*주/.test(originalText)}/>) }
  </section>
}
