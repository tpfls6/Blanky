import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n.ts'
import { QuickAdd } from '../Home/HomePage.tsx'
import { QUICK_ADD_PARAM, useOpenQuickAdd, type QuickAddState } from './quickAdd.ts'
import { clearStaleLayer, useBackLayer, useToastLift } from './mobile/layers.ts'
import './mobile/mobileCalendar.css'

/**
 * The former home composer as a bottom sheet over the schedule screen. It stays mounted while
 * hidden (inert), so an analysis in progress, its toast and the conversation keep going after closing.
 */
export function QuickAddSheet() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const openSheet = useOpenQuickAdd()
  const titleId = useId()
  const sheet = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [seed, setSeed] = useState<{ key: string; text: string } | undefined>(undefined)
  // `?add=quick` only opens the sheet; the param is then removed (below), so Back from a page opened
  // inside the sheet (보기 → 메모) returns to the schedule without opening it again.
  const requested = params.get(QUICK_ADD_PARAM) === 'quick'
  if (requested && !open) {
    const text = (location.state as QuickAddState)?.quickAddText
    setOpen(true)
    setSeed(text ? { key: location.key, text } : undefined)
  }
  useEffect(() => {
    if (!requested) return
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.delete(QUICK_ADD_PARAM)
      return next
    }, { replace: true, state: null })
  }, [requested, setParams])
  useEffect(clearStaleLayer, [])
  const close = () => setOpen(false)
  // Declared after the param cleanup: the URL is cleaned before this layer pushes its Back entry.
  useBackLayer(open, close)
  useToastLift(sheet, open)
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    // After the slide-in, so the phone keyboard does not push the sheet mid-animation.
    // A running guide, or the history sheet opened from a toast, keeps the focus.
    const timer = window.setTimeout(() => { if (!document.querySelector('[data-page-tour], .home-chat-panel[data-state="open"]')) document.getElementById('home-entry')?.focus({ preventScroll: true }) }, 320)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      // The history panel, review dialogs and confirms inside the sheet close first.
      if (document.querySelector('dialog[open], [aria-modal="true"], .home-chat-panel[data-state="open"], [data-status-toast]')) return
      closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <>
      <div className="quick-add-dim" data-open={open || undefined} aria-hidden="true" onClick={close} />
      <section ref={sheet} className="quick-add-sheet" data-open={open || undefined} role="dialog" aria-labelledby={titleId} inert={!open} data-quick-add>
        <div className="mcal-handle" aria-hidden="true" />
        <div className="quick-add-head">
          <h2 id={titleId}>{t('schedule.mobile.quickAdd')}</h2>
          <button type="button" className="mcal-ib" aria-label={t('close')} onClick={close}><X aria-hidden="true" className="size-5" /></button>
        </div>
        <div className="quick-add-body">
          <QuickAdd layout="sheet" active={open} seed={seed} onReveal={() => { if (!open) openSheet() }} />
        </div>
      </section>
    </>
  )
}
