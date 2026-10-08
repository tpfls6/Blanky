import { useConfirm } from '../../state/useConfirm.ts'
import { useState } from 'react'
import { useLibrary } from '../../state/useLibrary.ts'
import type { WorkItem } from '../../types/work.ts'
import { placedTimes, categoryPath } from '../../utils/work.ts'
export function WorkCard({ snapshot, before, deleted = false }: { snapshot: WorkItem; before?: WorkItem | null; deleted?: boolean }) {
  const confirm = useConfirm()

  const library = useLibrary()
  const live = library.items.find(row => row.id === snapshot.id)
  const item = deleted ? snapshot : live ?? snapshot
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const act = async (next: WorkItem | null) => {
    if (!live || busy) return
    setBusy(true)
    try { await library.commitWork(live, next); setEditing(false); setError('') }
    catch { setError('저장하지 못했습니다. 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }
  const describe = (row: WorkItem) => [row.title, row.date, row.startTime ?? '시간 없음', row.endTime, row.dueDate && '마감 '+row.dueDate, row.status === 'done' ? '완료' : '진행 전'].filter(Boolean).join(' · ')
  return <article data-theme-slot="card" className="theme-card rounded-xl border border-line p-4 text-sm">
    <p className="text-xs text-neutral-400">{item.kind === 'task' ? '할 일' : '일정'}{deleted || !live ? ' · 삭제된 항목 / 당시 기록' : ''}</p>
    <p className="mt-1 font-medium">{item.title}</p><p className="mt-1 text-neutral-500">{describe(item)}</p>
    <p className="text-xs text-neutral-400">{categoryPath(item.categoryId, library.categories)}</p>
    {before && <div className="mt-3 border-t border-line pt-3"><p>변경 전: {describe(before)}</p><p>변경 후: {describe(snapshot)}</p></div>}
    {live && !deleted && <div className="mt-3 flex gap-2"><button data-theme-slot="button" className="chip" disabled={busy} onClick={() => setEditing(!editing)}>수정 / 상세</button>
      {live.kind === 'task' && <button data-theme-slot="button" className="chip" disabled={busy} onClick={() => void act({...live, status: live.status === 'done' ? 'todo' : 'done'})}>완료 / 취소</button>}
      <button data-theme-slot="button" className="chip" disabled={busy} onClick={async () => { if(await confirm(live.title+' 항목을 삭제할까요?')) void act(null) }}>삭제</button></div>}
    {editing && live && <form className="mt-3 space-y-2" onSubmit={e => { e.preventDefault(); const values=new FormData(e.currentTarget); const start=String(values.get('start')); void act({...live,title:String(values.get('title')).trim(),date:String(values.get('date')), ...(start ? placedTimes(live,start) : {startTime:null,endTime:null}),allDay:live.kind === 'event' && !start}) }}>
      <label className="block">제목 <input data-theme-slot="input" required name="title" defaultValue={live.title} className="border border-line p-1" /></label>
      <label className="block">날짜 <input data-theme-slot="input" required name="date" type="date" defaultValue={live.date} /></label>
      <label className="block">시간 <input data-theme-slot="input" name="start" type="time" defaultValue={live.startTime ?? ''} /></label>
      <p>{live.description || '설명 없음'}</p><button data-theme-slot="button" className="chip chip-on" disabled={busy}>저장</button></form>}
    {error && <p role="alert" className="mt-2 text-red-500">{error}</p>}
  </article>
}
