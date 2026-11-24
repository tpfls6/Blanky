import { useEffect, useId, useRef } from 'react'
import { PenLine, Trash2, X } from 'lucide-react'
import { useI18n } from '../../i18n/useI18n.ts'
import type { ConfirmTone } from '../../state/useConfirm.ts'
import './confirmDialog.css'

export function ConfirmDialog({ title, body, confirmLabel, cancelLabel, tone = 'danger', onCancel, onConfirm }: {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  tone?: ConfirmTone
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const bodyId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  const Icon = tone === 'neutral' ? PenLine : Trash2
  return <dialog data-theme-slot="modal" data-tone={tone} ref={ref} className="app-confirm-dialog" aria-labelledby={titleId} aria-describedby={bodyId} onCancel={event => { event.preventDefault(); onCancel() }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onCancel() } }}>
    <div className="app-confirm-head flex items-start justify-between gap-4">
      <span className={`app-confirm-icon flex size-10 items-center justify-center rounded-xl ${tone === 'neutral' ? 'bg-[var(--hover)] text-[var(--fg)]' : 'bg-red-500/10 text-red-500'}`}><Icon aria-hidden="true" className="size-5" strokeWidth={1.75} /></span>
      <button data-theme-slot="button" type="button" className="icon-btn app-confirm-close" aria-label={t('close')} onClick={onCancel}><X aria-hidden="true" className="size-4" /></button>
    </div>
    <h2 id={titleId} className="app-confirm-title mt-4 text-base font-medium">{title}</h2>
    <p id={bodyId} className="app-confirm-body mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-500">{body}</p>
    <div className="app-confirm-actions mt-6 flex justify-end gap-2">
      <button data-theme-slot="button" type="button" autoFocus className="btn btn-ghost app-confirm-cancel" onClick={onCancel}>{cancelLabel ?? t('cancel')}</button>
      <button data-theme-slot="button" type="button" className="btn app-confirm-action" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>
}
