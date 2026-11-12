import { X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { useI18n } from '../../i18n/useI18n.ts'

type Phase = 'hidden' | 'enter' | 'open' | 'closing'
/** Only this wide does the composer keep its full width beside the panel; narrower screens get a drawer. */
const PUSH_QUERY = '(min-width: 1280px)'
/** History entry pushed while the phone sheet is open, so Back closes the sheet instead of leaving home. */
const SHEET_ENTRY = 'blankyChatSheet'
// Sheet drag: past 120px or a quick flick closes; a shorter pull snaps between the 60dvh and 92dvh heights.
const CLOSE_DRAG = 120, SNAP_DRAG = 48, FLICK = 0.5
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const sheetEntry = () => Boolean((history.state as Record<string, unknown> | null)?.[SHEET_ENTRY])

/**
 * Phones: a modal bottom sheet (focus trap, inert background, drag/scrim/X/ESC/Back close it).
 * 768–1279px: a non-modal drawer over the page. 1280px and up: a column that pushes the page.
 * The panel stays mounted while it animates out; ESC yields to any other open modal first.
 */
export function ChatPanel({ open, focusOnOpen, busy, onClose, children }: { open: boolean; focusOnOpen: boolean; busy: boolean; onClose: (restoreFocus: boolean) => void; children: ReactNode }) {
  const { t } = useI18n()
  const phone = useMediaQuery(PHONE_QUERY), wide = useMediaQuery(PUSH_QUERY)
  const mode = phone ? 'sheet' : wide ? 'push' : 'overlay'
  const sheet = mode === 'sheet', sheetOpen = sheet && open
  const panel = useRef<HTMLElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const list = useRef<HTMLDivElement>(null)
  // enter → open plays the opening transition; closing keeps the panel visible until it has slid out.
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'hidden')
  if (open && phase === 'hidden') setPhase('enter')
  else if (open && phase === 'closing') setPhase('open')
  else if (!open && (phase === 'open' || phase === 'enter')) setPhase('closing')
  const [expanded, setExpanded] = useState(false)
  if (phase === 'hidden' && expanded) setExpanded(false)
  // The modal sheet always hands focus back; the side panel only when focus was inside it (or lost).
  const close = (restore?: boolean) => onClose(restore ?? (sheet || Boolean(panel.current?.contains(document.activeElement)) || document.activeElement === document.body))
  const closeRef = useRef(close)
  const sheetOpenRef = useRef(sheetOpen)
  useEffect(() => { closeRef.current = close; sheetOpenRef.current = sheetOpen })
  useEffect(() => {
    if (phase === 'enter') {
      const frame = requestAnimationFrame(() => {
        panel.current?.style.removeProperty('--sheet-drag')
        void panel.current?.offsetHeight
        setPhase(current => current === 'enter' ? 'open' : current)
      })
      return () => cancelAnimationFrame(frame)
    }
    if (phase === 'closing') {
      // transitionend normally ends this; the timer covers reduced motion and interrupted transitions.
      const timer = setTimeout(() => setPhase(current => current === 'closing' ? 'hidden' : current), 320)
      return () => clearTimeout(timer)
    }
  }, [phase])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      if (document.querySelector('dialog[open], [aria-modal="true"]:not(#home-chat-panel)')) return
      closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => { if (open && (focusOnOpen || sheet)) heading.current?.focus({ preventScroll: true }) }, [open, focusOnOpen, sheet])
  useEffect(() => { if (open && list.current) list.current.scrollTop = list.current.scrollHeight }, [open, children])
  // Phone sheet is modal: everything outside it (tab bar included) is inert and Tab cycles inside it.
  useEffect(() => {
    const own = panel.current
    if (!sheetOpen || !own) return
    const changed: HTMLElement[] = []
    // Stops below <body> so portals such as the onboarding tour keep working.
    for (let node: HTMLElement = own; node.parentElement && node.parentElement !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node || sibling === scrim.current || !(sibling instanceof HTMLElement) || sibling.inert) continue
        sibling.toggleAttribute('inert', true)
        changed.push(sibling)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || document.querySelector('dialog[open], [data-page-tour]')) return
      const items = [...own.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => item.getClientRects().length)
      const first = items[0] ?? heading.current, last = items.at(-1) ?? heading.current
      const active = document.activeElement
      if (!first || !last) return
      if (!own.contains(active)) { event.preventDefault(); first.focus() }
      else if (event.shiftKey && (active === first || active === heading.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      changed.forEach(item => item.toggleAttribute('inert', false))
    }
  }, [sheetOpen])
  // Back closes the sheet. Closing it any other way drops the pushed entry so history does not pile up.
  useEffect(() => {
    if (!sheetOpen) return
    // Chrome skips entries pushed without a user gesture when going back, which would leave home entirely;
    // a sheet opened by script (the onboarding tour) therefore gets no entry and Back keeps its usual meaning.
    const gesture = navigator.userActivation?.isActive ?? true
    if (gesture && !sheetEntry()) history.pushState({ ...(history.state as object | null), [SHEET_ENTRY]: true }, '')
    const onPop = () => { if (!sheetEntry()) closeRef.current(true) }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Deferred so StrictMode's immediate re-run keeps the entry it would otherwise pop.
      setTimeout(() => { if (!sheetOpenRef.current && sheetEntry()) history.back() }, 0)
    }
  }, [sheetOpen])

  const drag = useRef<{ start: number; y: number; at: number; velocity: number } | null>(null)
  const dragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sheet || !open || event.button > 0 || (event.target as Element).closest('button')) return
    drag.current = { start: event.clientY, y: event.clientY, at: event.timeStamp, velocity: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
    panel.current?.setAttribute('data-dragging', 'true')
  }
  const dragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) return
    const elapsed = event.timeStamp - state.at
    if (elapsed > 0) state.velocity = (event.clientY - state.y) / elapsed
    state.y = event.clientY; state.at = event.timeStamp
    panel.current?.style.setProperty('--sheet-drag', `${Math.max(0, event.clientY - state.start)}px`)
  }
  const dragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) return
    drag.current = null
    panel.current?.removeAttribute('data-dragging')
    const distance = event.type === 'pointercancel' ? 0 : event.clientY - state.start
    // Closing keeps the dragged offset so the sheet slides out from where the finger let go.
    if (distance > CLOSE_DRAG || (state.velocity > FLICK && distance > 16)) { close(true); return }
    panel.current?.style.removeProperty('--sheet-drag')
    if (distance < -SNAP_DRAG || state.velocity < -FLICK) setExpanded(true)
    else if (distance > SNAP_DRAG) setExpanded(false)
  }
  const state = phase === 'open' ? 'open' : 'closed'
  return <>
    {mode !== 'push' && phase !== 'hidden' && <div ref={scrim} className="home-chat-scrim" data-state={state} aria-hidden="true" onClick={() => close(true)} />}
    <aside ref={panel} id="home-chat-panel" aria-labelledby="home-chat-title" role={sheet ? 'dialog' : undefined} aria-modal={sheetOpen || undefined}
      className="home-chat-panel" data-mode={mode} data-state={state} data-expanded={sheet && expanded ? 'true' : undefined}
      hidden={phase === 'hidden'} inert={!open}
      onTransitionEnd={event => { if (event.target === event.currentTarget && !open) setPhase(current => current === 'closing' ? 'hidden' : current) }}>
      <div className="home-chat-inner">
        <div className="home-chat-header" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
          {sheet && <span className="home-chat-handle" aria-hidden="true" />}
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <h2 ref={heading} id="home-chat-title" tabIndex={-1} className="text-sm font-medium outline-none">{t('home.historyTitle')}</h2>
            <button data-theme-slot="button" type="button" className="icon-btn" aria-label={t('home.closeHistory')} onClick={() => close()}><X aria-hidden="true" className="size-4" /></button>
          </div>
        </div>
        <div ref={list} className="home-chat-list min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={busy}>{children}</div>
      </div>
    </aside>
  </>
}
