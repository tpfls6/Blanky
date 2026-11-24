import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { useI18n } from '../../i18n/useI18n.ts'
import '../../components/common/addFab.css'
import './customization.css'

export function CustomizationAdd({ label, onClick, tour }: { label: string; onClick: () => void; tour?: string }) {
  return <button type="button" className="add-fab" data-theme-slot="button-primary" data-tour={tour} aria-label={label} aria-haspopup="dialog" onClick={onClick}>
    <Plus aria-hidden="true" className="size-6.5" strokeWidth={2.4} />
  </button>
}

// `media` and `subtitle` let a sheet name the item it acts on (e.g. a theme's thumbnail and creator).
export function CustomizationSheet({ title, subtitle, media, children, onClose }: { title: string; subtitle?: string; media?: ReactNode; children: ReactNode; onClose: () => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close() }
  }, [])

  return <dialog
    className="customization-sheet"
    data-theme-slot="modal"
    ref={ref}
    aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const { top, bottom, left, right } = event.currentTarget.getBoundingClientRect()
      if (event.clientY < top || event.clientY > bottom || event.clientX < left || event.clientX > right) onClose()
    }}
  >
    <header className="customization-sheet-header">
      {media}
      {subtitle ? <div className="min-w-0 flex-1">
        <h2 id={titleId} className="break-words font-semibold">{title}</h2>
        <p className="customization-sheet-sub">{subtitle}</p>
      </div> : <h2 id={titleId} className="min-w-0 font-semibold">{title}</h2>}
      <button type="button" className="icon-btn size-11 shrink-0" aria-label={t('close')} onClick={onClose}>
        <X aria-hidden="true" className="size-5" strokeWidth={1.7} />
      </button>
    </header>
    {children}
  </dialog>
}
