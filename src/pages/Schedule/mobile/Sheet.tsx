import { Check } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../../i18n/useI18n.ts'
import { useBackLayer, useToastLift } from './layers.ts'

/**
 * Small modal bottom sheet over the phone calendar (date / time pickers, repeat, category).
 * The ✓ button (when `onDone` is set) and the scrim both apply; Escape closes without applying.
 */
export function Sheet({ title, onClose, onDone, children, label, inline = false }: {
  title: string
  onClose: () => void
  /** Applies the sheet's choice; without it the sheet closes on scrim tap only (choices apply on tap). */
  onDone?: () => void
  children: ReactNode
  label?: string
  /** Renders in place instead of on <body>: needed inside a modal <dialog>, which sits in the top layer. */
  inline?: boolean
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const titleId = useId()
  const latest = useRef(onClose)
  useEffect(() => { latest.current = onClose })
  useEffect(() => {
    const previous = document.activeElement
    ref.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      latest.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  useBackLayer(true, onClose)
  useToastLift(ref, true)
  const apply = () => { onDone?.(); onClose() }
  const sheet = (
    <>
      <div className="mcal-sub-dim" aria-hidden="true" onClick={onDone ? apply : onClose} />
      <section ref={ref} className="mcal-sub" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-label={label} tabIndex={-1} data-mobile-sheet>
        <div className="mcal-handle" aria-hidden="true" />
        <div className="mcal-sub-head">
          <h3 id={titleId}>{title}</h3>
          {onDone ? <button type="button" className="mcal-ib mcal-sub-ok" aria-label={t('schedule.mobile.done')} onClick={apply}><Check aria-hidden="true" className="size-6" /></button> : null}
        </div>
        <div className="mcal-sub-body mcal-noscroll">{children}</div>
      </section>
    </>
  )
  return inline ? sheet : createPortal(sheet, document.body)
}
