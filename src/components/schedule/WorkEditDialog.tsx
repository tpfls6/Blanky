import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { ROUTES } from '../../constants/routes.ts'
import { DraftEditor } from '../../pages/Schedule/SchedulePage.tsx'
import { draftFromItem, saveDraft } from '../../utils/scheduleEdit.ts'
import { commitDraft, occurrenceDraft } from '../../features/schedule/occurrence.ts'
import { useSaveAndClose } from '../../hooks/useSaveAndClose.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useCalendars } from '../../state/useCalendars.ts'
import type { WorkItem } from '../../types/work.ts'

/** The schedule page editor in a modal; saves and deletes go through commitWork like every other edit. */
/** `occurrence`: the day a recurring item was opened on; the editor then asks how far an edit reaches. */
export function WorkEditDialog({ item, occurrence, onClose }: { item: WorkItem; occurrence?: string; onClose: () => void }) {
  const library = useLibrary()
  const confirm = useConfirm()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [draft, setDraft] = useState(() => occurrence ? occurrenceDraft(draftFromItem(item), item, occurrence) : draftFromItem(item))
  const { busy, error, setError, run: guard } = useSaveAndClose()
  const live = library.items.find(row => row.id === item.id)
  const calendars = useCalendars()
  const [copyTo, setCopyTo] = useState('')
  const copyTargets = calendars.writable.filter(entry => entry.id !== (live?.calendarId ?? '') && !(live?.calendarId?.startsWith('local-personal:') && entry.isDefaultPersonal))
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  // commitWork throws on failure; a delete resolves to null, so success is reported once it settles.
  const run = (next: WorkItem | null) => {
    if (!live) return
    void guard(() => commitDraft(library.items, library.commitWork, live, next, draft), onClose)
  }
  const save = () => {
    const next = saveDraft(draft)
    if (!next || !live) return setError('제목과 날짜를 확인해 주세요.')
    run({ ...live, ...next })
  }
  // A copy is a new, independent row: no series link, authored by whoever copies it.
  const copy = () => {
    const target = calendars.entryOf(copyTo)
    if (!live || !target) return
    const next: WorkItem = { ...live, id: crypto.randomUUID(), calendarId: target.id, calendarType: target.type }
    delete next.seriesId
    delete next.createdByUserId
    delete next.updatedByUserId
    delete next.calendarColor
    delete next.changeSource
    void guard(async () => { await library.commitWork(null, next); return true }, onClose)
  }
  const remove = async () => {
    if (!live || busy) return
    const scope = draft.occurrence ? draft.scope ?? 'this' : null
    const message = scope === 'this' ? `${live.title}의 ${draft.occurrence} 하루만 삭제할까요?` : scope === 'future' ? `${live.title}의 ${draft.occurrence}부터 이후 반복을 삭제할까요?` : `${live.title} 항목을 삭제할까요? 휴지통에서 복구할 수 있습니다.`
    if (await confirm(message)) run(null)
  }
  return <dialog data-theme-slot="modal" ref={ref} aria-labelledby={titleId} data-work-edit={item.id}
    className="m-auto max-h-[90dvh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-surface p-4 text-neutral-900 backdrop:bg-black/40"
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="flex items-center justify-between gap-2">
      <h2 id={titleId} className="text-base font-medium">{item.kind === 'task' ? '할 일 수정' : '일정 수정'}</h2>
      <button data-theme-slot="button" type="button" className="icon-btn" aria-label="닫기" disabled={busy} onClick={onClose}><X aria-hidden="true" className="size-4" /></button>
    </div>
    {live ? <fieldset disabled={busy}>
      <DraftEditor draft={draft} categories={library.categories} onChange={setDraft} onCancel={() => { if (!busy) onClose() }} onSave={save} onDelete={() => void remove()}
        seriesHref={live.repeat && live.repeat !== 'none' ? `${ROUTES.recurring}?id=${encodeURIComponent(live.id)}&date=${live.date}` : undefined} />
    </fieldset> : <p className="mt-3 text-sm text-neutral-500">삭제된 항목이에요.</p>}
    {live && copyTargets.length ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500" data-copy-calendar>
      <span>다른 캘린더에 복사</span>
      <select className="field min-w-0 flex-1 py-1" value={copyTo} onChange={event => setCopyTo(event.target.value)} aria-label="복사할 캘린더" disabled={busy}>
        <option value="">캘린더 선택</option>
        {copyTargets.map(entry => <option key={entry.id} value={entry.id}>{entry.type === 'shared' ? `${entry.name} (공유)` : entry.name}</option>)}
      </select>
      <button type="button" className="btn btn-ghost px-2 py-1" disabled={busy || !copyTo} onClick={copy}>복사</button>
    </div> : null}
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  </dialog>
}
