import { ChevronLeft, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import './draftSheet.css'
import { DraftEditor } from '../../pages/Schedule/SchedulePage.tsx'
import type { ScheduleDraft } from '../../utils/scheduleDraft.ts'

/** The schedule add/edit form: a centered modal on wide screens, a full-screen page on phones. Both use DraftEditor's fields and validation. */
export function DraftSheet({ phone, draft, categories, busy, error, seriesHref, onChange, onSave, onDelete, onClose }: {
  phone: boolean
  draft: ScheduleDraft
  categories: { id: string; name: string; parentId: string | null; color?: string | null }[]
  busy: boolean
  error: string
  seriesHref?: string
  onChange: (update: (draft: ScheduleDraft) => ScheduleDraft) => void
  onSave: () => void
  onDelete?: () => void
  /** Close button, Escape and, on phones, the back button. */
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const formId = useId()
  const phoneAtOpen = useRef(phone)
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    dialog?.showModal()
    // Desktop starts typing in the title; phones open without raising the keyboard.
    if (phoneAtOpen.current) dialog?.focus()
    else dialog?.querySelector<HTMLInputElement>('form input:not([type])')?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  const title = `${draft.kind === 'task' ? '할 일' : '일정'} ${draft.id ? '수정' : '추가'}`
  return (
    <dialog data-theme-slot="modal" ref={ref} tabIndex={-1} aria-labelledby={titleId} data-schedule-draft={phone ? 'page' : 'modal'}
      className={phone ? 'schedule-draft-panel schedule-draft-page' : 'schedule-draft-panel schedule-draft-modal'}
      onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <header className="schedule-draft-head">
        {phone ? (
          <button data-theme-slot="button" type="button" className="icon-btn" aria-label="뒤로" disabled={busy} onClick={onClose}>
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-medium">{title}</h2>
        {phone ? (
          <button data-theme-slot="button-primary" type="submit" form={formId} className="btn btn-primary px-4" disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        ) : (
          <>
            <Link to={ROUTES.recurring} className="shrink-0 text-xs text-neutral-400 hover:text-accent-text">반복 일정</Link>
            <button data-theme-slot="button" type="button" className="icon-btn" aria-label="닫기" disabled={busy} onClick={onClose}>
              <X aria-hidden="true" className="size-4" />
            </button>
          </>
        )}
      </header>
      {error ? <p role="alert" className="schedule-draft-error text-sm text-red-600">{error}</p> : null}
      <div className="schedule-draft-body">
        <fieldset className="min-w-0" disabled={busy}>
          <DraftEditor bare={phone} formId={formId} draft={draft} categories={categories} onChange={onChange}
            seriesHref={seriesHref} onCancel={onClose} onDelete={onDelete} onSave={onSave} />
        </fieldset>
      </div>
    </dialog>
  )
}
