import { useEffect, useId, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }: {
  title: string
  body: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
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
  return <dialog data-theme-slot="modal" ref={ref} className="app-confirm-dialog" aria-labelledby={titleId} aria-describedby={bodyId} onCancel={event => { event.preventDefault(); onCancel() }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onCancel() } }}>
    <div className="flex items-start justify-between gap-4">
      <span className="flex size-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><AlertTriangle aria-hidden="true" className="size-5" strokeWidth={1.75} /></span>
      <button data-theme-slot="button" type="button" className="icon-btn" aria-label="닫기" onClick={onCancel}><X aria-hidden="true" className="size-4" /></button>
    </div>
    <h2 id={titleId} className="mt-4 text-base font-medium">{title}</h2>
    <p id={bodyId} className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-500">{body}</p>
    <div className="mt-6 flex justify-end gap-2">
      <button data-theme-slot="button" type="button" autoFocus className="btn btn-ghost" onClick={onCancel}>취소</button>
      <button data-theme-slot="button" type="button" className="btn app-confirm-action" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>
}
