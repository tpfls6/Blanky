import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { ROUTES } from '../../constants/routes.ts'
import { DraftEditor } from '../../pages/Schedule/SchedulePage.tsx'
import { draftFromItem, saveDraft } from '../../utils/scheduleEdit.ts'
import { useSaveAndClose } from '../../hooks/useSaveAndClose.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import type { WorkItem } from '../../types/work.ts'

/** The schedule page editor in a modal; saves and deletes go through commitWork like every other edit. */
export function WorkEditDialog({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const library = useLibrary()
  const confirm = useConfirm()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [draft, setDraft] = useState(() => draftFromItem(item))
  const { busy, error, setError, run: guard } = useSaveAndClose()
  const live = library.items.find(row => row.id === item.id)
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
    void guard(async () => { await library.commitWork(live, next); return true }, onClose)
  }
  const save = () => {
    const next = saveDraft(draft)
    if (!next || !live) return setError('제목과 날짜를 확인해 주세요.')
    run({ ...live, ...next })
  }
  const remove = async () => {
    if (!live || busy) return
    if (await confirm(`${live.title} 항목을 삭제할까요? 휴지통에서 복구할 수 있습니다.`)) run(null)
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
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  </dialog>
}
