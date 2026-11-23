import { ChevronLeft } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { ExistingTaskPlanner } from '../../../components/schedule/ExistingTaskPlanner.tsx'
import { PriorityBadge } from '../../../components/tasks/Priority.tsx'
import { TaskCheckbox } from '../../../components/tasks/TaskCheckbox.tsx'
import { useI18n } from '../../../i18n/useI18n.ts'
import { isRecurring } from '../../../features/schedule/seriesEdit.ts'
import type { WorkItem, WorkspaceCategory } from '../../../types/work.ts'
import { occursOn } from '../../../utils/calendarMonth.ts'
import { addDays, formatISODate, parseISODate, shiftISO } from '../../../utils/date.ts'
import { DateWheel } from './Wheel.tsx'
import { Sheet } from './Sheet.tsx'
import { durationLabel } from './format.ts'

type Tab = 'all' | 'undated' | 'untimed' | 'done'
const TABS: Tab[] = ['all', 'undated', 'untimed', 'done']
const GROUPS = ['late', 'today', 'tomorrow', 'week', 'later', 'undated'] as const
const RANK = { high: 0, medium: 1, low: 2 }
/** Width of the three actions a left swipe reveals. */
const ACTIONS = 216
const DURATIONS = [30, 60, 90, 120]

/** The day a task is next due on: its date, or for a series the next day it repeats (within two months). */
function dayOf(item: WorkItem, today: string): string | null {
  if (item.undated) return null
  if (!isRecurring(item)) return item.date
  for (let offset = 0; offset <= 60; offset++) {
    const day = shiftISO(today, offset)
    if (occursOn(item, day)) return day
  }
  return item.date > today ? item.date : null
}

const clock = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

/**
 * Every task in one list: tabs, priority filter and sort, grouped by when it is due.
 * Row buttons set a date or a time; a left swipe offers 오늘로 / 날짜 / AI recommendation.
 */
export function TasksPage({ items, categories, today, defaultDuration, onClose, onOpen, onToggle, onSave }: {
  items: WorkItem[]
  categories: WorkspaceCategory[]
  today: string
  defaultDuration: number
  onClose: () => void
  onOpen: (item: WorkItem) => void
  onToggle: (item: WorkItem) => void
  /** Saves a changed copy of a task. */
  onSave: (before: WorkItem, after: WorkItem, message: string) => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('all')
  const [priority, setPriority] = useState('all')
  const [category, setCategory] = useState('all')
  const [sorted, setSorted] = useState(false)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ item: WorkItem; mode: 'date' | 'time'; value: Date; duration: number } | null>(null)
  const swiped = useRef(false)
  const swipe = useRef<{ id: string; x: number; y: number; base: number; moved: boolean; element: HTMLElement } | null>(null)

  const areas = categories.filter((entry) => entry.parentId === null)
  const inArea = (item: WorkItem) => {
    if (category === 'all') return true
    const own = categories.find((entry) => entry.id === item.categoryId)
    return item.categoryId === category || own?.parentId === category
  }
  const list = items.filter((item) => item.kind === 'task'
    && (tab === 'done' ? item.status === 'done' : item.status !== 'done')
    && (tab !== 'undated' || item.undated)
    && (tab !== 'untimed' || !item.startTime)
    && (priority === 'all' || item.priority === priority)
    && inArea(item))
  const tomorrow = shiftISO(today, 1), weekEnd = shiftISO(today, 7)
  const groupOf = (day: string | null) => !day ? 5 : day < today ? 0 : day === today ? 1 : day === tomorrow ? 2 : day <= weekEnd ? 3 : 4
  const rows = list.map((item) => ({ item, day: dayOf(item, today) }))
  const label = (day: string) => { const date = parseISODate(day); return t('schedule.mobile.shortDate', { month: date.getMonth() + 1, day: date.getDate(), weekday: t(`schedule.mobile.dow.${date.getDay()}`) }) }

  const close = () => setOpenRow(null)
  const moveTo = (item: WorkItem, day: string | null) => {
    close()
    if (day === null) onSave(item, { ...item, undated: true, startTime: null, endTime: null, allDay: false }, t('schedule.mobile.movedUndated'))
    else onSave(item, { ...item, date: day, undated: false }, day === today ? t('schedule.mobile.movedToday', { title: item.title }) : t('schedule.mobile.dateSet', { date: label(day) }))
  }
  // A series' date is its anchor: changing it here would move every repeat, so those open the editor instead.
  const startPicker = (item: WorkItem, mode: 'date' | 'time') => {
    close()
    if (isRecurring(item)) { onOpen(item); return }
    const base = parseISODate(!item.undated && item.date ? item.date : today)
    if (mode === 'time') base.setHours(9, 0, 0, 0)
    setPicker({ item, mode, value: base, duration: item.duration ?? defaultDuration })
  }
  const applyPicker = () => {
    if (!picker) return
    const { item, mode, value, duration } = picker
    const day = formatISODate(value)
    if (mode === 'date') { moveTo(item, day); return }
    const start = clock(value), end = clock(new Date(value.getTime() + duration * 60_000))
    onSave(item, { ...item, date: day, undated: false, allDay: false, startTime: start, endTime: end < start ? '23:59' : end, duration },
      t('schedule.mobile.timeSet', { date: label(day), time: start }))
  }

  const onDown = (event: PointerEvent<HTMLDivElement>, id: string) => {
    // Any part of the row starts a swipe, title and buttons included; movement past the threshold decides.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (openRow && openRow !== id) setOpenRow(null)
    swipe.current = { id, x: event.clientX, y: event.clientY, base: openRow === id ? -ACTIONS : 0, moved: false, element: event.currentTarget }
  }
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = swipe.current
    if (!drag) return
    const dx = event.clientX - drag.x
    if (!drag.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(event.clientY - drag.y)) {
      drag.moved = true
      drag.element.setAttribute('data-dragging', '')
      drag.element.setPointerCapture?.(event.pointerId)
    }
    if (drag.moved) drag.element.style.transform = `translateX(${Math.max(-ACTIONS, Math.min(0, drag.base + dx))}px)`
  }
  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = swipe.current
    swipe.current = null
    if (!drag?.moved) return
    drag.element.removeAttribute('data-dragging')
    drag.element.style.transform = ''
    // The click that ends a swipe must not open the task or toggle its checkbox.
    swiped.current = true
    window.setTimeout(() => { swiped.current = false }, 400)
    setOpenRow(drag.base + event.clientX - drag.x < -60 ? drag.id : null)
  }

  return (
    <section className="mcal-page" aria-label={t('schedule.mobile.tasks')} data-mobile-tasks>
      <div className="mcal-page-head">
        <button type="button" className="mcal-ib" aria-label={t('schedule.mobile.back')} onClick={onClose}><ChevronLeft aria-hidden="true" className="size-5.5" /></button>
        <h2>{t('schedule.mobile.tasks')}</h2>
      </div>
      <div className="mcal-tk-bar">
        <div className="mcal-tk-tabs mcal-noscroll" role="group" aria-label={t('schedule.mobile.taskTabs')}>
          {TABS.map((value) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => { setTab(value); close() }}>{t(`schedule.mobile.tab.${value}`)}</button>)}
        </div>
        <div className="mcal-tk-tools">
          <select className="priority-filter-select" value={priority} aria-label={t('schedule.mobile.priorityFilter')} onChange={(event) => setPriority(event.target.value)}>
            <option value="all">{t('schedule.mobile.priorityAll')}</option>
            {(['high', 'medium', 'low'] as const).map((value) => <option key={value} value={value}>{t(`schedule.mobile.priority.${value}`)}</option>)}
          </select>
          {areas.length ? (
            <select value={category} aria-label={t('schedule.taskRange')} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">{t('schedule.mobile.categoryAll')}</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          ) : null}
          <button type="button" className="mcal-tk-sort" aria-pressed={sorted} onClick={() => setSorted(!sorted)}>{t('schedule.mobile.prioritySort')}</button>
          <span className="mcal-tk-tip" aria-hidden="true">{t('schedule.mobile.swipeTip')}</span>
        </div>
      </div>
      <div className="mcal-page-body mcal-noscroll" style={{ paddingBottom: 40 }}>
        {GROUPS.map((group, index) => {
          const members = rows.filter((row) => groupOf(row.day) === index)
            .sort((a, b) => (sorted ? RANK[a.item.priority] - RANK[b.item.priority] : 0) || (a.day ?? '').localeCompare(b.day ?? '') || (a.item.startTime ?? '').localeCompare(b.item.startTime ?? '') || a.item.title.localeCompare(b.item.title, 'ko'))
          if (!members.length) return null
          return (
            <section key={group} aria-label={t(`schedule.mobile.group.${tab === 'done' && group === 'late' ? 'earlier' : group}`)}>
              <h3 className="mcal-tk-group" data-late={group === 'late' && tab !== 'done' ? '' : undefined}>
                {t(`schedule.mobile.group.${tab === 'done' && group === 'late' ? 'earlier' : group}`)}<span>{members.length}</span>
              </h3>
              {members.map(({ item, day }) => {
                const done = item.status === 'done'
                const action = done ? null : !day ? 'date' : !item.startTime ? 'time' : null
                return (
                  <div key={item.id} className="mcal-tk-row" data-task-row={item.id}>
                    <div className="mcal-tk-acts" aria-hidden={openRow !== item.id} inert={openRow !== item.id}>
                      <button type="button" onClick={() => moveTo(item, today)}>{t('schedule.mobile.toToday')}</button>
                      <button type="button" onClick={() => startPicker(item, 'date')}>{t('schedule.mobile.date')}</button>
                      <span onClick={close}>{done ? null : <ExistingTaskPlanner task={item} />}</span>
                    </div>
                    <div className="mcal-tk-main" style={openRow === item.id ? { transform: `translateX(-${ACTIONS}px)` } : undefined}
                      onPointerDown={(event) => onDown(event, item.id)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                      onClickCapture={(event) => { if (swiped.current) { swiped.current = false; event.preventDefault(); event.stopPropagation() } }}>
                      <span className="mcal-check"><TaskCheckbox checked={done} label={t('schedule.mobile.completeItem', { title: item.title })} onChange={() => onToggle(item)} /></span>
                      <button type="button" className="mcal-tk-info" onClick={() => { if (openRow) close(); else onOpen(item) }}>
                        <b data-done={done || undefined}>{item.title}</b>
                        <small>
                          {day ? <span data-late={day < today && !done ? '' : undefined}>{label(day)}</span> : <span>{t('schedule.mobile.noDate')}</span>}
                          {item.startTime ? <span>{item.startTime}</span> : null}
                          <PriorityBadge value={item.priority} completed={done} />
                        </small>
                      </button>
                      {action ? <button type="button" className="mcal-tk-chip" onClick={() => startPicker(item, action)}>{t(action === 'date' ? 'schedule.mobile.setDate' : 'schedule.mobile.assignTime')}</button> : null}
                      <button type="button" className="sr-only" onClick={() => setOpenRow(openRow === item.id ? null : item.id)}>{t('schedule.mobile.moreActions', { title: item.title })}</button>
                    </div>
                  </div>
                )
              })}
            </section>
          )
        })}
        {!rows.length ? <p className="mcal-hint">{t('schedule.mobile.emptyTasks')}</p> : null}
      </div>
      {picker ? (
        <Sheet title={t(picker.mode === 'date' ? 'schedule.mobile.setDate' : 'schedule.mobile.assignTime')} onClose={() => setPicker(null)} onDone={applyPicker}>
          <div className="mcal-sub-wheel"><DateWheel value={picker.value} mode={picker.mode === 'date' ? 'date' : 'datetime'} onChange={(value) => setPicker({ ...picker, value })} /></div>
          {picker.mode === 'date' ? (
            <div className="mcal-quick">
              {[0, 1, 7].map((offset) => <button key={offset} type="button" onClick={() => setPicker({ ...picker, value: addDays(parseISODate(today), offset) })}>{t(`schedule.mobile.quickDay.${offset}`)}</button>)}
              <button type="button" onClick={() => { moveTo(picker.item, null); setPicker(null) }}>{t('schedule.mobile.noDate')}</button>
            </div>
          ) : (
            <div className="mcal-quick">
              <span>{t('schedule.mobile.duration')}</span>
              {DURATIONS.map((minutes) => <button key={minutes} type="button" aria-pressed={picker.duration === minutes} onClick={() => setPicker({ ...picker, duration: minutes })}>{durationLabel(t, minutes)}</button>)}
            </div>
          )}
        </Sheet>
      ) : null}
    </section>
  )
}

