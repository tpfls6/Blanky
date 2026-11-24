import { ChevronDown, PenLine, Plus, Search, Sparkles, SquareCheckBig, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { MobileCalendarBar } from '../../../components/calendars/MobileCalendarBar.tsx'
import { NotificationBell } from '../../../components/calendars/NotificationBell.tsx'
import { showStatusToast } from '../../../components/layout/statusToast.ts'
import { MobileMoreLink } from '../../../components/layout/MobileTopBar.tsx'
import { isRecurring } from '../../../features/schedule/seriesEdit.ts'
import { useI18n } from '../../../i18n/useI18n.ts'
import { useHolidays } from '../../../services/holidays/index.ts'
import { isSupabaseConfigured } from '../../../services/supabase/client.ts'
import { useLibrary } from '../../../state/useLibrary.ts'
import type { WorkItem, WorkspaceCategory } from '../../../types/work.ts'
import { occursOn } from '../../../utils/calendarMonth.ts'
import { addDays, formatISODate, parseISODate } from '../../../utils/date.ts'
import { useOpenQuickAdd } from '../quickAdd.ts'
import { DaySheetBody, type DayView } from './DaySheet.tsx'
import { MonthGrid } from './MonthGrid.tsx'
import { SearchPage } from './SearchPage.tsx'
import { TasksPage } from './TasksPage.tsx'
import { DateWheel } from './Wheel.tsx'
import { clearStaleLayer, useBackLayer, useToastLift } from './layers.ts'
import '../../../components/common/addFab.css'
import './mobileCalendar.css'

type Snap = 'closed' | 'half' | 'full'
const ORDER: Snap[] = ['closed', 'half', 'full']
const HEAD = 56
const WEEK = 28
/** Movement before a press on the sheet becomes a drag (or is left to scrolling / horizontal gestures). */
const DRAG_LOCK = 8
/** A flick faster than this (px/ms) moves one snap regardless of where the drag ends. */
const FLICK = 0.45
const SWIPE = 50

/**
 * Phone schedule home, laid out like a calendar app: one-line header, a month grid filling the screen,
 * a day sheet with two snaps (half / full) and an add button with quick add and manual add.
 */
export function MobileCalendarHome({ items, categories, selected, today, weekStartsOn, extra, onSelect, onOpen, onNew }: {
  items: WorkItem[]
  categories: WorkspaceCategory[]
  selected: string
  today: string
  weekStartsOn: 0 | 1
  /** Page blocks shown under the day list (headings, notes, category summary, first-run examples). */
  extra?: ReactNode
  onSelect: (iso: string) => void
  onOpen: (item: WorkItem) => void
  /** Starts a new draft on the selected day; `hour` presets a timed event. */
  onNew: (hour?: number) => void
}) {
  const { t } = useI18n()
  const library = useLibrary()
  const openQuickAdd = useOpenQuickAdd()
  const root = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [month, setMonth] = useState(() => selected.slice(0, 7))
  const [snap, setSnapState] = useState<Snap>('closed')
  const [view, setView] = useState<DayView>('list')
  const [slide, setSlide] = useState<{ dir: 'left' | 'right'; key: number } | null>(null)
  const [picker, setPicker] = useState<Date | null>(null)
  const [dial, setDial] = useState(false)
  const [page, setPage] = useState<'search' | 'tasks' | null>(null)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => setHeight(element.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const avail = Math.max(0, height - HEAD - WEEK)
  // Full covers the weekday row and grid, up to just below the header.
  const sizes: Record<Snap, number> = { closed: 0, half: Math.round(avail * 0.5), full: Math.max(0, height - HEAD) }

  const cells = useMemo(() => {
    const [year, monthIndex] = month.split('-').map(Number)
    const first = new Date(year, monthIndex - 1, 1)
    const lead = (first.getDay() - weekStartsOn + 7) % 7
    const start = addDays(first, -lead)
    // Only the weeks the month touches (4–6): no extra trailing week of the next month.
    const days = new Date(year, monthIndex, 0).getDate()
    return Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, index) => {
      const date = addDays(start, index)
      return { iso: formatISODate(date), inMonth: date.getMonth() === monthIndex - 1, day: date.getDate() }
    })
  }, [month, weekStartsOn])
  // A December/January grid spans two years.
  const holidays = useHolidays([Number(cells[0].iso.slice(0, 4)), Number(cells[cells.length - 1].iso.slice(0, 4))])
  const labels = Array.from({ length: 7 }, (_, index) => (index + weekStartsOn) % 7)

  const onDay = useMemo(() => items.filter((item) => occursOn(item, selected)), [items, selected])
  const undated = useMemo(() => items.filter((item) => item.kind === 'task' && item.undated && item.status !== 'done'), [items])
  // Overdue and due-today open tasks; a series' date is only its anchor, so series are left out.
  const due = items.filter((item) => item.kind === 'task' && item.status !== 'done' && !item.undated && !isRecurring(item) && item.date <= today).length

  const animate = (dir: 'left' | 'right') => setSlide({ dir, key: Date.now() })
  const setSnap = (next: Snap) => {
    setSnapState(next)
    // A drag wrote these directly; put them back in step with the snap React renders.
    root.current?.style.setProperty('--mcal-sheet', `${sizes[next]}px`)
    if (root.current) root.current.dataset.snap = next
  }
  const jump = (iso: string, open: boolean) => {
    const target = iso.slice(0, 7)
    if (target !== month) { animate(target > month ? 'left' : 'right'); setMonth(target) }
    onSelect(iso)
    if (open && snap === 'closed') setSnap('half')
  }
  const go = (delta: number) => {
    const [year, monthIndex] = month.split('-').map(Number)
    const next = new Date(year, monthIndex - 1 + delta, 1)
    animate(delta > 0 ? 'left' : 'right')
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }
  const pick = (iso: string) => {
    if (iso === selected && snap !== 'closed') { setSnap('closed'); return }
    jump(iso, true)
  }

  // Month swipe on the grid; the click a swipe ends with is ignored.
  const press = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const onGridDown = (event: ReactPointerEvent) => { press.current = { x: event.clientX, y: event.clientY }; swiped.current = false }
  const onGridUp = (event: ReactPointerEvent) => {
    const start = press.current
    press.current = null
    if (!start) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true
      // A touch swipe often ends without a click; never let the flag eat a later tap.
      window.setTimeout(() => { swiped.current = false }, 400)
      go(dx < 0 ? 1 : -1)
    }
  }

  // Sheet drag from anywhere on it: follows the finger, then settles on the nearest snap (a flick moves one).
  // On the body, a vertical drag moves the sheet only down from the top of its scroll, or up from the half
  // snap; otherwise the body scrolls. Nothing moves before DRAG_LOCK px, so taps and sideways gestures work.
  const drag = useRef<{ x: number; y: number; h: number; from: Snap; lastY: number; lastT: number; v: number; body: HTMLElement | null; active: boolean } | null>(null)
  const dragged = useRef(false)
  /** Whether a vertical move by `dy` on the press in `drag` takes the sheet rather than scrolling the body. */
  const takesSheet = (dy: number) => {
    const state = drag.current
    if (!state) return false
    if (!state.body) return true
    return dy > 0 ? state.body.scrollTop <= 0 : state.from === 'half'
  }
  const onSheetDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (snap === 'closed' || (event.pointerType === 'mouse' && event.button !== 0)) return
    const body = (event.target as HTMLElement).closest<HTMLElement>('.mcal-sheet-body')
    drag.current = { x: event.clientX, y: event.clientY, h: sizes[snap], from: snap, lastY: event.clientY, lastT: performance.now(), v: 0, body, active: false }
  }
  const onSheetMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || !root.current) return
    if (!state.active) {
      const dx = event.clientX - state.x, dy = event.clientY - state.y
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_LOCK) return
      if (Math.abs(dx) > Math.abs(dy) || !takesSheet(dy)) { drag.current = null; return }
      state.active = true
      state.y = event.clientY
      dragged.current = true
      root.current.setAttribute('data-dragging', '')
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    const now = performance.now()
    state.v = (event.clientY - state.lastY) / Math.max(1, now - state.lastT)
    state.lastY = event.clientY
    state.lastT = now
    const next = Math.max(0, Math.min(sizes.full, state.h - (event.clientY - state.y)))
    root.current.style.setProperty('--mcal-sheet', `${next}px`)
    root.current.dataset.snap = next > sizes.half + (sizes.full - sizes.half) * 0.6 ? 'full' : next > 0 ? 'half' : 'closed'
  }
  const onSheetUp = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    drag.current = null
    if (!state?.active) return
    root.current?.removeAttribute('data-dragging')
    // The click a drag ends with is dropped (onClickCapture below); a touch drag may end without one.
    window.setTimeout(() => { dragged.current = false }, 400)
    const index = ORDER.indexOf(state.from)
    const current = Math.max(0, Math.min(sizes.full, state.h - (event.clientY - state.y)))
    const next = state.v < -FLICK ? ORDER[Math.min(2, index + 1)]
      : state.v > FLICK ? ORDER[Math.max(0, index - 1)]
        : ORDER.reduce((best, entry) => Math.abs(sizes[entry] - current) < Math.abs(sizes[best] - current) ? entry : best, 'closed' as Snap)
    setSnap(next)
  }

  // Each open layer owns a history entry, so the phone's Back closes the top one only.
  useEffect(clearStaleLayer, [])
  useBackLayer(snap !== 'closed', () => setSnap('closed'))
  useBackLayer(picker !== null, () => setPicker(null))
  useBackLayer(dial, () => setDial(false))
  useBackLayer(page !== null, () => setPage(null))
  const sheetRef = useRef<HTMLElement>(null)
  useToastLift(sheetRef, snap !== 'closed' && page === null)
  // Touch scrolling starts natively, which would cancel the pointer: block it while the press drags (or is
  // about to drag) the sheet. Needs a non-passive listener, so not a React prop.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    let startY = 0
    const onStart = (event: TouchEvent) => { startY = event.touches[0]?.clientY ?? 0 }
    const onMove = (event: TouchEvent) => {
      const state = drag.current
      if (!state || !event.cancelable) return
      if (state.active || takesSheet((event.touches[0]?.clientY ?? startY) - startY)) event.preventDefault()
    }
    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
    }
  })

  const escape = useRef(() => {})
  useEffect(() => {
    escape.current = () => {
      if (page) setPage(null)
      else if (picker) setPicker(null)
      else if (dial) setDial(false)
      else if (snap !== 'closed') setSnap('closed')
    }
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      if (document.querySelector('dialog[open], [aria-modal="true"], .quick-add-sheet[data-open], [data-status-toast]')) return
      escape.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const saveTask = (before: WorkItem, after: WorkItem, message: string) => {
    void library.commitWork(before, after)
      .then((saved) => showStatusToast(saved ? { text: message, tone: 'saved' } : { text: t('home.toastFailed'), tone: 'failed', sticky: true }))
      .catch(() => showStatusToast({ text: t('home.toastFailed'), tone: 'failed', sticky: true }))
  }
  const date = parseISODate(selected)
  const [year, monthNumber] = month.split('-')
  const sheetTitle = t('schedule.mobile.sheetTitle', { month: date.getMonth() + 1, day: date.getDate(), weekday: t(`schedule.mobile.dowLong.${date.getDay()}`) })

  return (
    <div ref={root} className="mcal" data-schedule-mobile data-snap={snap} style={{ '--mcal-sheet': `${sizes[snap]}px` } as CSSProperties}>
      <header className="mcal-head mobile-tab-header" data-theme-slot="page-header">
        <MobileMoreLink />
        <button type="button" className="mcal-ym mobile-tab-title" aria-expanded={picker !== null} aria-haspopup="dialog" aria-label={t('schedule.mobile.monthPicker', { year, month: Number(monthNumber) })}
          onClick={() => setPicker(picker ? null : selected.slice(0, 7) === month ? parseISODate(selected) : parseISODate(`${month}-01`))}>
          <span aria-hidden="true">{year}.{monthNumber}</span><ChevronDown aria-hidden="true" className="size-4.5" strokeWidth={2.4} />
        </button>
        <button type="button" className="mcal-ib" data-open-tasks aria-label={due ? t('schedule.mobile.tasksBadge', { count: due }) : t('schedule.mobile.tasks')} onClick={() => setPage('tasks')}>
          <SquareCheckBig aria-hidden="true" className="size-5.5" strokeWidth={1.8} />
          {due ? <span className="mcal-badge" aria-hidden="true">{due > 99 ? '99+' : due}</span> : null}
        </button>
        {isSupabaseConfigured ? <MobileCalendarBar /> : null}
        <button type="button" className="mcal-ib" data-open-search aria-label={t('schedule.mobile.search')} onClick={() => setPage('search')}><Search aria-hidden="true" className="size-5.5" strokeWidth={1.8} /></button>
        {isSupabaseConfigured ? <NotificationBell align="right" /> : null}
      </header>
      <div className="mcal-week" aria-hidden="true">
        {labels.map((dow) => <span key={dow} className={dow === 0 ? 'cal-holiday' : dow === 6 ? 'mcal-sat' : ''}>{t(`schedule.mobile.dow.${dow}`)}</span>)}
      </div>
      <div className="contents" onPointerDown={onGridDown} onPointerUp={onGridUp} onPointerCancel={() => { press.current = null }}
        onClickCapture={(event) => { if (swiped.current) { swiped.current = false; event.stopPropagation() } }}>
        <MonthGrid key={slide?.key ?? 0} cells={cells} items={items} categories={categories} holidays={holidays} selected={selected} today={today} slide={slide?.dir ?? null} rowHeight={avail / (cells.length / 7)} onPick={pick} />
      </div>

      <section ref={sheetRef} className="mcal-sheet" data-theme-slot={snap === 'closed' ? undefined : 'modal'} aria-label={sheetTitle} inert={snap === 'closed'} data-day-sheet
        onPointerDown={onSheetDown} onPointerMove={onSheetMove} onPointerUp={onSheetUp} onPointerCancel={onSheetUp}
        onClickCapture={(event) => { if (dragged.current) { dragged.current = false; event.preventDefault(); event.stopPropagation() } }}>
        <div className="mcal-handle" aria-hidden="true" />
        <div className="mcal-sheet-head">
          <h2>{sheetTitle}{selected === today ? <span className="mcal-tag">{t('today')}</span> : null}</h2>
          <div className="mcal-seg" role="group" aria-label={t('schedule.mobile.viewMode')}>
            {(['list', 'timeline'] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}>{t(`schedule.mobile.${mode}`)}</button>)}
          </div>
          <button type="button" className="mcal-ib" aria-label={t('close')} onClick={() => setSnap('closed')}><X aria-hidden="true" className="size-5" /></button>
        </div>
        <div ref={body} className="mcal-sheet-body mcal-noscroll">
          <DaySheetBody key={`${view}-${selected}`} day={selected} items={onDay} undated={undated} categories={categories} view={view} bodyRef={body} extra={extra}
            onOpen={onOpen} onToggle={(id) => library.toggleItem(id, selected)} onNewAt={(hour) => onNew(hour)}
            onDoOnDay={(item) => saveTask(item, { ...item, date: selected, undated: false }, t('schedule.mobile.doneOnDay', { title: item.title, date: sheetTitle }))} />
        </div>
      </section>

      <div className="mcal-dim mcal-pick-dim" data-open={picker ? '' : undefined} aria-hidden="true" onClick={() => setPicker(null)} />
      <section className="mcal-picker" data-theme-slot="modal" data-open={picker ? '' : undefined} role="dialog" aria-label={t('schedule.mobile.datePicker')} inert={!picker}>
        {picker ? <DateWheel value={picker} mode="date" yearUnit onChange={setPicker} /> : null}
        <div className="mcal-pick-act">
          <button type="button" className="mcal-ghost" onClick={() => { setPicker(null); jump(today, snap !== 'closed') }}>{t('today')}</button>
          <button type="button" className="mcal-primary" onClick={() => { if (picker) jump(formatISODate(picker), snap !== 'closed'); setPicker(null) }}>{t('schedule.mobile.go')}</button>
        </div>
      </section>

      <div className="mcal-dim mcal-dial-dim" data-open={dial ? '' : undefined} aria-hidden="true" onClick={() => setDial(false)} />
      <div className="mcal-dial add-dial" data-open={dial ? '' : undefined} inert={!dial} id="mcal-dial">
        <button type="button" data-add="quick" onClick={() => { setDial(false); openQuickAdd() }}><span>{t('schedule.mobile.quickAdd')}</span><i className="ai-add-icon"><Sparkles aria-hidden="true" className="size-5.5" strokeWidth={1.8} /></i></button>
        <button type="button" data-add="manual" onClick={() => { setDial(false); onNew() }}><span>{t('schedule.mobile.manualAdd')}</span><i><PenLine aria-hidden="true" className="size-5.5" strokeWidth={1.8} /></i></button>
      </div>
      <button type="button" className="mcal-fab" data-theme-slot="button-primary" aria-expanded={dial} aria-controls="mcal-dial" aria-label={t(dial ? 'schedule.mobile.closeAdd' : 'schedule.mobile.add')} onClick={() => setDial(!dial)}>
        <Plus aria-hidden="true" className="size-6.5" strokeWidth={2.4} />
      </button>

      {page === 'search' ? (
        <SearchPage items={items} categories={categories} onClose={() => setPage(null)}
          onPick={(item) => { setPage(null); if (item.undated) onOpen(item); else jump(item.date, true) }} />
      ) : null}
      {page === 'tasks' ? (
        <TasksPage items={items} categories={categories} today={today} defaultDuration={library.settings.taskDefaultDuration}
          onClose={() => setPage(null)} onOpen={onOpen} onSave={saveTask}
          onToggle={(item) => library.toggleItem(item.id, isRecurring(item) ? today : undefined)} />
      ) : null}
    </div>
  )
}
