import { ChevronDown, Inbox } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { colorOf } from '../../../components/schedule/calendarRows.ts'
import { TaskCheckbox } from '../../../components/tasks/TaskCheckbox.tsx'
import { useI18n } from '../../../i18n/useI18n.ts'
import type { WorkItem, WorkspaceCategory } from '../../../types/work.ts'
import { parseISODate } from '../../../utils/date.ts'
import { dayAgenda, layoutTimeline, timelineCurrentTime, timelineRange } from '../../../utils/scheduleTimeline.ts'

export type DayView = 'list' | 'timeline'

/** One hour of the sheet's timeline. */
const HOUR = 48
/** The timeline's first column holds the hour labels. */
const GUTTER = 52

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** The selected day as a list (events, then tasks, then undated tasks) or as a 24-hour timeline. */
export function DaySheetBody({ day, items, undated, categories, view, bodyRef, extra, onOpen, onToggle, onNewAt, onDoOnDay }: {
  day: string
  /** Items occurring on `day`. */
  items: WorkItem[]
  /** Open tasks without a date, offered for this day. */
  undated: WorkItem[]
  categories: WorkspaceCategory[]
  view: DayView
  bodyRef: RefObject<HTMLDivElement | null>
  /** Page blocks the schedule layout adds below the list (headings, notes, category summary). */
  extra?: ReactNode
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
  onNewAt: (hour: number) => void
  onDoOnDay: (item: WorkItem) => void
}) {
  return view === 'timeline'
    ? <DayTimeline day={day} items={items} categories={categories} bodyRef={bodyRef} onOpen={onOpen} onToggle={onToggle} onNewAt={onNewAt} />
    : <DayList day={day} items={items} undated={undated} categories={categories} extra={extra} onOpen={onOpen} onToggle={onToggle} onDoOnDay={onDoOnDay} />
}

function DayList({ day, items, undated, categories, extra, onOpen, onToggle, onDoOnDay }: {
  day: string
  items: WorkItem[]
  undated: WorkItem[]
  categories: WorkspaceCategory[]
  extra?: ReactNode
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
  onDoOnDay: (item: WorkItem) => void
}) {
  const { t } = useI18n()
  const [undatedOpen, setUndatedOpen] = useState(false)
  const agenda = dayAgenda(items, day)
  const events = [...agenda.allDay, ...agenda.timed.filter((item) => item.kind === 'event')]
  const tasks = [...agenda.dateOnly, ...agenda.timed.filter((item) => item.kind === 'task')]
  const shortDate = (iso: string) => { const date = parseISODate(iso); return `${date.getMonth() + 1}.${date.getDate()}` }
  return (
    <>
      {!events.length && !tasks.length ? <p className="mcal-empty">{t('schedule.mobile.emptyDay')}</p> : <>
        <p className="mcal-sec">{t('schedule.mobile.eventsCount', { count: events.length })}</p>
        {events.length ? events.map((item) => {
          const multi = Boolean(item.endDate && item.endDate > item.date)
          return (
            <button key={item.id} type="button" className="mcal-erow" data-day-event={item.id} onClick={() => onOpen(item)}>
              <span className="mcal-etime">
                {multi ? t('schedule.mobile.period') : item.startTime ?? t('schedule.mobile.allDay')}
                <small>{multi ? t('schedule.mobile.until', { date: shortDate(item.endDate!) }) : item.endTime ?? ''}</small>
              </span>
              <span className="mcal-ebar" style={{ '--cal-color': colorOf(item, categories) } as CSSProperties} aria-hidden="true" />
              <span className="mcal-etitle">{item.title}</span>
            </button>
          )
        }) : <p className="mcal-empty-sm">{t('schedule.mobile.noEvents')}</p>}
        <p className="mcal-sec">{t('schedule.mobile.tasksCount', { count: tasks.length })}</p>
        {tasks.length ? tasks.map((item) => (
          <div key={item.id} className="mcal-trow" data-day-task={item.id}>
            <span className="mcal-check"><TaskCheckbox checked={item.status === 'done'} label={t('schedule.mobile.completeItem', { title: item.title })} onChange={() => onToggle(item.id)} /></span>
            <button type="button" className="mcal-trow-title" data-done={item.status === 'done' || undefined} onClick={() => onOpen(item)}>{item.title}</button>
            {item.startTime || item.dueTime ? <small>{item.startTime ?? item.dueTime}</small> : null}
          </div>
        )) : <p className="mcal-empty-sm">{t('schedule.mobile.noTasks')}</p>}
      </>}
      {undated.length ? (
        <div className="mcal-ud" data-undated-tasks>
          <button type="button" className="mcal-ud-head" aria-expanded={undatedOpen} onClick={() => setUndatedOpen(!undatedOpen)}>
            <Inbox aria-hidden="true" className="size-4.5" strokeWidth={1.8} />
            <span>{t('schedule.mobile.undatedTitle')} <b>{t('schedule.mobile.undatedCount', { count: undated.length })}</b></span>
            <ChevronDown aria-hidden="true" className="size-4.5" />
          </button>
          {undatedOpen ? (
            <div className="mcal-ud-list">
              {undated.map((item) => (
                <div key={item.id} className="mcal-ud-row">
                  <span>{item.title}</span>
                  <button type="button" className="mcal-pill" aria-label={t('schedule.mobile.doOnDayItem', { title: item.title })} onClick={() => onDoOnDay(item)}>{t('schedule.mobile.doOnDay')}</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {extra ? <div className="mcal-extra">{extra}</div> : null}
    </>
  )
}

function DayTimeline({ day, items, categories, bodyRef, onOpen, onToggle, onNewAt }: {
  day: string
  items: WorkItem[]
  categories: WorkspaceCategory[]
  bodyRef: RefObject<HTMLDivElement | null>
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
  onNewAt: (hour: number) => void
}) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const agenda = dayAgenda(items, day)
  const placements = layoutTimeline(agenda.timed.flatMap((item) => {
    const range = timelineRange(item, day)
    return range ? [{ ...range, id: item.id, kind: item.kind, item }] : []
  }))
  const current = timelineCurrentTime(day, 0, 1440, now)
  const top = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const first = placements.length ? Math.min(...placements.map((entry) => entry.start)) : null
  // Opens near the day's first entry (or 8 o'clock), just below the pinned chip rows.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body || !grid.current) return
    const gridTop = grid.current.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop
    const target = first === null ? 8 * HOUR : first / 60 * HOUR - HOUR / 2
    body.scrollTop = Math.max(0, gridTop + target - (top.current?.offsetHeight ?? 0) - 12)
    // Only when the day changes; later edits keep the reader's scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, bodyRef])
  const untimedDone = agenda.dateOnly.filter((item) => item.status === 'done').length
  const hourLabel = (hour: number) => t('schedule.mobile.hourLabel', { meridiem: t(hour < 12 ? 'schedule.mobile.am' : 'schedule.mobile.pm'), hour: hour % 12 || 12 })
  return (
    <>
      {agenda.allDay.length || agenda.dateOnly.length ? (
        <div ref={top} className="mcal-tl-top">
          {agenda.allDay.length ? (
            <div className="mcal-tl-line">
              <span className="mcal-tl-k">{t('schedule.mobile.allDay')}</span>
              <div className="mcal-tl-chips mcal-noscroll">
                {agenda.allDay.map((item) => (
                  <button key={item.id} type="button" className="mcal-tl-all" style={{ '--cal-color': colorOf(item, categories) } as CSSProperties} onClick={() => onOpen(item)}>{item.title}</button>
                ))}
              </div>
            </div>
          ) : null}
          {agenda.dateOnly.length ? (
            <div className="mcal-tl-line" data-day-tasks={day}>
              <span className="mcal-tl-k">{t('schedule.mobile.untimed')}<em>{untimedDone}/{agenda.dateOnly.length}</em></span>
              <div className="mcal-tl-chips mcal-noscroll">
                {agenda.dateOnly.map((item) => (
                  <span key={item.id} className="mcal-tl-chip" data-done={item.status === 'done' || undefined}>
                    <span className="mcal-check"><TaskCheckbox checked={item.status === 'done'} label={t('schedule.mobile.completeItem', { title: item.title })} onChange={() => onToggle(item.id)} /></span>
                    <button type="button" onClick={() => onOpen(item)}>{item.title}</button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div ref={grid} className="mcal-tl-grid" style={{ height: 24 * HOUR }} aria-label={t('schedule.mobile.timeline')}>
        {Array.from({ length: 24 }, (_, hour) => (
          <button key={hour} type="button" className="mcal-tl-h" style={{ top: hour * HOUR }} aria-label={t('schedule.mobile.addAt', { time: hourLabel(hour) })} onClick={() => onNewAt(hour)}>
            {hour ? <span aria-hidden="true">{hourLabel(hour)}</span> : null}
          </button>
        ))}
        {placements.map(({ item, start, end, column, columns, span }) => {
          const done = item.status === 'done'
          const height = Math.max(26, (end - start) / 60 * HOUR - 2)
          const style = {
            top: start / 60 * HOUR, height,
            left: `calc(${GUTTER}px + (100% - ${GUTTER + 4}px) * ${column / columns})`,
            width: `calc((100% - ${GUTTER + 4}px) * ${span / columns} - 2px)`,
            '--cal-color': item.kind === 'task' ? 'var(--faint)' : colorOf(item, categories),
          } as CSSProperties
          return (
            <div key={item.id} className="mcal-tl-ev" data-timeline-id={item.id} data-kind={item.kind} data-done={done || undefined} style={style}>
              {item.kind === 'task' ? <span className="mcal-check"><TaskCheckbox checked={done} label={t('schedule.mobile.completeItem', { title: item.title })} onChange={() => onToggle(item.id)} /></span> : null}
              <button type="button" className="mcal-tl-open" aria-label={`${item.title} · ${clock(start)}–${clock(end)}`} onClick={() => onOpen(item)}>
                <b>{item.title}</b><small>{clock(start)}</small>
              </button>
            </div>
          )
        })}
        {current ? <div className="mcal-tl-now" style={{ top: current.minutes / 60 * HOUR }} aria-label={t('schedule.mobile.now', { time: current.label })} role="img" /> : null}
      </div>
    </>
  )
}

