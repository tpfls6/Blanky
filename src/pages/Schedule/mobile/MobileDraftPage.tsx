import { AlarmClock, Check, ChevronDown, ChevronRight, CircleCheck, Clock, Flag, NotebookText, Plus, Repeat, Search, Tag, Timer, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarInfo } from '../../../components/calendars/CalendarField.tsx'
import { isoWeekday } from '../../../../packages/types/src/recurrence.ts'
import { repeatSummary } from '../../../features/schedule/recurringList.ts'
import type { SeriesScope } from '../../../features/schedule/seriesEdit.ts'
import { useI18n } from '../../../i18n/useI18n.ts'
import { useCalendars } from '../../../state/useCalendars.ts'
import { useLibrary } from '../../../state/useLibrary.ts'
import type { Priority } from '@blanky/types'
import type { RepeatRule, WorkItem, WorkspaceCategory } from '../../../types/work.ts'
import { formatISODate, parseISODate, todayISO } from '../../../utils/date.ts'
import type { ScheduleDraft } from '../../../utils/scheduleDraft.ts'
import { durationLabel, meridiemTime } from './format.ts'
import { Sheet } from './Sheet.tsx'
import { DateWheel } from './Wheel.tsx'
import './mobileCalendar.css'
import './mobileDraft.css'

type Target = 'start' | 'end' | 'due'
type SubSheet = 'calendar' | 'category' | 'repeat' | 'duration'
const SCOPES: SeriesScope[] = ['this', 'future', 'all']
const PRIORITIES: Priority[] = ['high', 'medium', 'low']
const DURATIONS = [15, 30, 45, 60, 90, 120]
const WEEKDAYS = [1, 2, 3, 4, 5]

const clockOf = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
function at(iso: string, time: string): Date {
  const date = parseISODate(iso)
  const [hours, minutes] = (time || '09:00').split(':').map(Number)
  date.setHours(hours || 0, minutes || 0, 0, 0)
  return date
}

/**
 * The phone add/edit page (replaces the phone DraftEditor form): ✕ | 일정 / 할 일 | ✓, then compact rows
 * whose values open inline wheels or small sheets. It edits the same ScheduleDraft and saves through
 * the same onSave as the desktop form, so validation and series handling stay shared.
 */
export function MobileDraftPage({ draft, categories, busy, error, seriesHref, onChange, onSave, onDelete, onClose }: {
  draft: ScheduleDraft
  categories: WorkspaceCategory[]
  busy: boolean
  error: string
  seriesHref?: string
  onChange: (update: (draft: ScheduleDraft) => ScheduleDraft) => void
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const { addCategory, items } = useLibrary()
  const { canEdit, writable, entryOf } = useCalendars()
  const ref = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const memoRef = useRef<HTMLTextAreaElement>(null)
  const wheelRef = useRef<HTMLDivElement>(null)
  const formId = useId(), headingId = useId()
  const [target, setTarget] = useState<Target | null>(null)
  const [sub, setSub] = useState<SubSheet | null>(null)
  const [localError, setLocalError] = useState('')
  const saved = draft.id ? items.find((item) => item.id === draft.id) : undefined
  const locked = Boolean(saved && !canEdit(saved))
  const task = draft.kind === 'task'
  const today = todayISO()

  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    dialog?.showModal()
    // Opens without raising the keyboard; a new item starts on its title.
    dialog?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  // A text field taking focus closes the open wheel (onFocus below): the keyboard needs that room.
  useEffect(() => { if (target) wheelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [target])
  useEffect(() => {
    const memo = memoRef.current
    if (!memo) return
    memo.style.height = 'auto'
    memo.style.height = `${memo.scrollHeight}px`
  }, [draft.description])

  // Same rule as the desktop form: changing a time clears a typed duration.
  const set = (patch: Partial<ScheduleDraft>) => onChange((current) => ({ ...current, ...patch, ...('startTime' in patch || 'endTime' in patch ? { duration: '' } : {}) }))
  const toggleTarget = (next: Target) => setTarget((current) => (current === next ? null : next))

  const allDay = !draft.startTime
  const noDate = task && !draft.date
  const start = at(draft.date || today, draft.startTime)
  const end = task
    ? at(draft.date || today, draft.endTime || clockOf(new Date(start.getTime() + 3600_000)))
    : at(draft.endDate || draft.date || today, draft.endTime || draft.startTime || '10:00')
  const due = at(draft.dueDate || draft.date || today, draft.dueTime || '18:00')

  const moveStart = (next: Date) => {
    const shift = next.getTime() - start.getTime()
    if (task) {
      if (allDay) { set({ date: formatISODate(next) }); return }
      const moved = new Date(end.getTime() + shift)
      set({ date: formatISODate(next), startTime: clockOf(next), endTime: formatISODate(moved) === formatISODate(next) ? clockOf(moved) : '23:55' })
      return
    }
    const moved = new Date(end.getTime() + shift)
    const endDate = formatISODate(moved) > formatISODate(next) ? formatISODate(moved) : ''
    set(allDay ? { date: formatISODate(next), endDate } : { date: formatISODate(next), endDate, startTime: clockOf(next), endTime: clockOf(moved) })
  }
  const moveEnd = (next: Date) => {
    if (task) { set({ endTime: clockOf(next) > clockOf(start) ? clockOf(next) : clockOf(start) }); return }
    const value = next < start ? start : next
    const endDate = formatISODate(value) > formatISODate(start) ? formatISODate(value) : ''
    set(allDay ? { endDate } : { endDate, endTime: clockOf(value) })
  }
  const toggleAllDay = () => {
    if (allDay) set({ startTime: '09:00', endTime: '10:00', ...(task && !draft.date ? { date: today } : {}) })
    else set({ startTime: '', endTime: '' })
  }
  const openDue = () => {
    if (!draft.dueDate && target !== 'due') set({ dueDate: formatISODate(due) })
    toggleTarget('due')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim()) {
      setLocalError(t('schedule.mobile.titleRequired'))
      titleRef.current?.focus()
      return
    }
    if (locked) return
    setLocalError('')
    onSave()
  }

  const dayText = (date: Date) => t('schedule.mobile.dateShort', { month: date.getMonth() + 1, day: date.getDate(), weekday: t(`schedule.mobile.dow.${date.getDay()}`) })
  const yearDayText = (date: Date) => t('schedule.mobile.dateWithYear', { year: String(date.getFullYear()).slice(2), month: date.getMonth() + 1, day: date.getDate(), weekday: t(`schedule.mobile.dow.${date.getDay()}`) })
  const calendar = entryOf(draft.calendarId) ?? writable.find((entry) => entry.isDefaultPersonal) ?? writable[0]
  const showCalendar = writable.length >= 2 && Boolean(calendar) && (!saved || saved.calendarType !== 'external')
  const category = categories.find((entry) => entry.id === draft.categoryId)
  const parent = category?.parentId ? categories.find((entry) => entry.id === category.parentId) : undefined
  const tint = category?.color || parent?.color || calendar?.color || 'var(--accent-color)'
  const repeatLocked = draft.occurrence !== undefined && (draft.scope ?? 'this') === 'this'
  const repeatText = !draft.repeat || draft.repeat === 'none'
    ? t('schedule.mobile.repeatNone')
    : `${repeatSummary({ repeat: draft.repeat, repeatDays: draft.repeatDays, repeatInterval: draft.repeatInterval, date: draft.date || today } as WorkItem)}${draft.repeatUntil ? ` · ${t('schedule.mobile.repeatUntil', { date: dayText(parseISODate(draft.repeatUntil)) })}` : ''}`

  const wheel = (which: Target) => {
    const mode = which === 'due' ? (draft.dueTime ? 'datetime' : 'date') : allDay ? 'date' : 'datetime'
    const value = which === 'due' ? due : which === 'end' ? end : start
    return (
      <div ref={wheelRef} className="mdraft-wheel" data-draft-wheel={which}>
        <DateWheel value={value} mode={mode} onChange={which === 'start' ? moveStart : which === 'end' ? moveEnd : (next) => set({ dueDate: formatISODate(next), dueTime: draft.dueTime ? clockOf(next) : '' })} />
        <div className="mdraft-wfoot">
          {which === 'due' ? <>
            <label className="mdraft-wchk"><input type="checkbox" checked={Boolean(draft.dueTime)} onChange={(event) => set({ dueTime: event.target.checked ? '18:00' : '' })} />{t('schedule.mobile.dueTime')}</label>
            <button type="button" className="mdraft-wbtn" onClick={() => { set({ dueDate: '', dueTime: '' }); setTarget(null) }}>{t('schedule.mobile.clearDue')}</button>
          </> : null}
          {task && which === 'start' ? <button type="button" className="mdraft-wbtn" onClick={() => { set({ date: '', startTime: '', endTime: '' }); setTarget(null) }}>{t('schedule.mobile.noDate')}</button> : null}
          <button type="button" className="mdraft-wbtn" onClick={() => {
            if (which === 'due') set({ dueDate: today })
            else if (which === 'start') moveStart(at(today, draft.startTime || clockOf(start)))
            else moveEnd(at(today, draft.endTime || clockOf(end)))
          }}>{t('today')}</button>
        </div>
      </div>
    )
  }

  const pick = (label: string, which: Target, small: string, value: string) => (
    <button type="button" className="mdraft-se-btn" aria-expanded={target === which} data-active={target === which || undefined} aria-label={`${label} ${small} ${value}`} onClick={() => toggleTarget(which)}>
      <small>{small}</small><b>{value}</b>
    </button>
  )

  return (
    <dialog data-theme-slot="modal" ref={ref} tabIndex={-1} aria-labelledby={headingId} data-schedule-draft="page" data-mobile-draft className="schedule-draft-panel mdraft"
      onCancel={(event) => { event.preventDefault(); if (sub) return; if (!busy) onClose() }}>
      <header className="mdraft-head">
        <button data-theme-slot="button" type="button" className="mcal-ib" aria-label={t('close')} disabled={busy} onClick={onClose}><X aria-hidden="true" className="size-5.5" /></button>
        <h2 id={headingId} className="sr-only">{t(`schedule.mobile.${draft.id ? 'editTitle' : 'addTitle'}`, { kind: t(task ? 'schedule.kindTask' : 'schedule.kindEvent') })}</h2>
        <div className="mdraft-seg" role="group" aria-label={t('schedule.mobile.kind')}>
          {(['event', 'task'] as const).map((kind) => (
            <button key={kind} type="button" aria-pressed={draft.kind === kind} disabled={busy || locked} onClick={() => { set({ kind }); setTarget(null) }}>{t(kind === 'task' ? 'schedule.kindTask' : 'schedule.kindEvent')}</button>
          ))}
        </div>
        {locked ? <span className="w-11" /> : (
          <button data-theme-slot="button-primary" type="submit" form={formId} className="mcal-ib mdraft-save" aria-label={busy ? t('saving') : t('save')} disabled={busy}><Check aria-hidden="true" className="size-6.5" /></button>
        )}
      </header>
      {error || localError ? <p role="alert" className="mdraft-error">{localError || error}</p> : null}
      <form id={formId} onSubmit={submit} className="mdraft-body mcal-noscroll">
        {saved ? <div className="px-5"><CalendarInfo item={saved} /></div> : null}
        <fieldset disabled={locked || busy} className="min-w-0">
          {showCalendar && calendar ? (
            <button type="button" className="mdraft-cal" data-calendar-field onClick={() => setSub('calendar')} aria-label={`${t('schedule.mobile.calendar')}: ${calendar.name}`}>
              <i style={{ background: calendar.color }} aria-hidden="true" />{calendar.type === 'shared' ? t('schedule.mobile.sharedCalendar', { name: calendar.name }) : calendar.name}<ChevronDown aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <div className="mdraft-title">
            <button type="button" className="mdraft-dot" style={{ background: tint }} aria-label={t('schedule.mobile.category')} onClick={() => setSub('category')} />
            <input ref={titleRef} data-theme-slot="input" value={draft.title} aria-label={t('schedule.mobile.title')} enterKeyHint="done"
              placeholder={t(task ? 'schedule.mobile.titleTask' : 'schedule.mobile.titleEvent')} onFocus={() => setTarget(null)}
              onChange={(event) => { set({ title: event.target.value }); if (localError) setLocalError('') }} />
          </div>

          <div className="mdraft-grp">
            <div className="mdraft-row">
              <span className="mdraft-ic"><Clock aria-hidden="true" /></span>
              <span className="mdraft-lbl" id={`${formId}-allday`}>{t('schedule.mobile.allDay')}</span>
              <input type="checkbox" role="switch" className="mdraft-sw" aria-labelledby={`${formId}-allday`} checked={allDay} onChange={toggleAllDay} />
            </div>
            <div className="mdraft-se">
              {noDate ? pick(t('schedule.mobile.start'), 'start', t('schedule.mobile.dateLabel'), t('schedule.mobile.noDate'))
                : pick(t('schedule.mobile.start'), 'start', allDay ? String(start.getFullYear()) : yearDayText(start), allDay ? dayText(start) : meridiemTime(t, start))}
              {noDate || (task && allDay) ? null : <>
                <ChevronRight aria-hidden="true" className="mdraft-arr" />
                {pick(t('schedule.mobile.end'), 'end', task ? t('schedule.mobile.endTime') : allDay ? String(end.getFullYear()) : yearDayText(end), allDay ? dayText(end) : meridiemTime(t, end))}
              </>}
            </div>
            {target === 'start' || target === 'end' ? wheel(target) : null}
          </div>

          {task ? <>
            <div className="mdraft-grp">
              <button type="button" className="mdraft-row" data-active={target === 'due' || undefined} aria-expanded={target === 'due'} onClick={openDue}>
                <span className="mdraft-ic"><Flag aria-hidden="true" /></span>
                <span className="mdraft-lbl">{t('schedule.mobile.due')}</span>
                <span className="mdraft-val">{draft.dueDate ? `${yearDayText(due)}${draft.dueTime ? ` ${meridiemTime(t, due)}` : ''}` : t('schedule.mobile.none')}</span>
              </button>
              {target === 'due' ? wheel('due') : null}
            </div>
            <Row icon={<Timer aria-hidden="true" />} label={t('schedule.mobile.estimate')} value={Number(draft.duration) ? durationLabel(t, Number(draft.duration)) : t('schedule.mobile.none')} onClick={() => setSub('duration')} />
            <div className="mdraft-row">
              <span className="mdraft-ic"><AlarmClock aria-hidden="true" /></span>
              <span className="mdraft-lbl">{t('schedule.mobile.priorityLabel')}</span>
              <span className="mdraft-pri" role="radiogroup" aria-label={t('schedule.mobile.priorityLabel')}>
                {PRIORITIES.map((value) => <button key={value} type="button" role="radio" data-priority={value} aria-checked={(draft.priority ?? 'medium') === value} onClick={() => set({ priority: value })}>{t(`schedule.mobile.priority.${value}`)}</button>)}
              </span>
            </div>
            <div className="mdraft-row">
              <span className="mdraft-ic"><CircleCheck aria-hidden="true" /></span>
              <span className="mdraft-lbl" id={`${formId}-done`}>{t('schedule.mobile.completed')}</span>
              <input type="checkbox" role="switch" className="mdraft-sw" aria-labelledby={`${formId}-done`} checked={draft.status === 'done'} onChange={() => set({ status: draft.status === 'done' ? 'todo' : 'done' })} />
            </div>
          </> : null}

          <Row icon={<Repeat aria-hidden="true" />} label={t('schedule.mobile.repeat')} value={repeatText} disabled={repeatLocked} hint={repeatLocked ? t('schedule.mobile.repeatLocked') : undefined} onClick={() => setSub('repeat')} />
          <Row icon={<Tag aria-hidden="true" />} label={t('schedule.mobile.category')} value={category ? (parent ? `${parent.name} › ${category.name}` : category.name) : t('schedule.mobile.none')} onClick={() => setSub('category')} />
          <div className="mdraft-row mdraft-memo">
            <span className="mdraft-ic"><NotebookText aria-hidden="true" /></span>
            <textarea ref={memoRef} data-theme-slot="input" rows={1} value={draft.description} placeholder={t('schedule.mobile.memo')} aria-label={t('schedule.mobile.memo')} onFocus={() => setTarget(null)} onChange={(event) => set({ description: event.target.value })} />
          </div>

          {draft.occurrence ? (
            <div className="mdraft-scope" data-series-scope>
              <p>{t('schedule.mobile.scope', { date: draft.occurrence })}</p>
              <div className="mdraft-seg mdraft-seg-wide" role="radiogroup" aria-label={t('schedule.mobile.scopeLabel')}>
                {SCOPES.map((value) => <button key={value} type="button" role="radio" aria-checked={(draft.scope ?? 'this') === value} onClick={() => set({ scope: value })}>{t(`schedule.mobile.scopes.${value}`)}</button>)}
              </div>
              <p className="mdraft-note">{t(`schedule.mobile.scopeNote.${draft.scope ?? 'this'}`)}</p>
            </div>
          ) : null}
          {seriesHref ? <Link to={seriesHref} className="mdraft-link">{t('schedule.mobile.seriesLink')}</Link> : null}
        </fieldset>
        {onDelete && !locked ? <button data-theme-slot="button" type="button" className="mdraft-delete" disabled={busy} onClick={onDelete}>{t('delete')}</button> : null}
      </form>

      {sub === 'calendar' ? (
        <Sheet inline title={t('schedule.mobile.calendar')} onClose={() => setSub(null)}>
          <div className="mdraft-list">
            {writable.map((entry) => (
              <button key={entry.id} type="button" className="mdraft-opt" aria-pressed={calendar?.id === entry.id} onClick={() => { set({ calendarId: entry.id }); setSub(null) }}>
                <i className="mdraft-sq" style={{ background: entry.color }} aria-hidden="true" />{entry.type === 'shared' ? t('schedule.mobile.sharedCalendar', { name: entry.name }) : entry.name}
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
      {sub === 'category' ? (
        <CategorySheet categories={categories} value={draft.categoryId} onClose={() => setSub(null)}
          onPick={(categoryId) => { set({ categoryId }); setSub(null) }} onCreate={(name) => addCategory(name, null)} />
      ) : null}
      {sub === 'duration' ? <DurationSheet value={draft.duration} onClose={() => setSub(null)} onApply={(duration) => set({ duration })} /> : null}
      {sub === 'repeat' ? (
        <RepeatSheet date={draft.date || today} repeat={draft.repeat ?? 'none'} days={draft.repeatDays ?? []} interval={draft.repeatInterval ?? 1} until={draft.repeatUntil ?? ''}
          onClose={() => setSub(null)} onApply={(next) => set(next)} />
      ) : null}
    </dialog>
  )
}

function Row({ icon, label, value, onClick, disabled = false, hint }: { icon: ReactNode; label: string; value: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button type="button" className="mdraft-row" disabled={disabled} onClick={onClick}>
      <span className="mdraft-ic">{icon}</span>
      <span className="mdraft-lbl">{label}{hint ? <small className="mdraft-hint">{hint}</small> : null}</span>
      <span className="mdraft-val">{value}</span>
      <ChevronRight aria-hidden="true" className="mdraft-chev" />
    </button>
  )
}

function CategorySheet({ categories, value, onPick, onCreate, onClose }: {
  categories: WorkspaceCategory[]
  value: string | null
  onPick: (id: string | null) => void
  onCreate: (name: string) => string | undefined
  onClose: () => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const text = query.trim().toLocaleLowerCase('ko')
  const rows = categories.filter((entry) => entry.parentId === null).flatMap((parent) => [
    { entry: parent, parent: undefined as WorkspaceCategory | undefined },
    ...categories.filter((child) => child.parentId === parent.id).map((child) => ({ entry: child, parent })),
  ]).filter(({ entry, parent }) => !text || entry.name.toLocaleLowerCase('ko').includes(text) || Boolean(parent?.name.toLocaleLowerCase('ko').includes(text)))
  const exact = categories.some((entry) => entry.name.trim().toLocaleLowerCase('ko') === text)
  return (
    <Sheet inline title={t('schedule.mobile.category')} onClose={onClose}>
      <label className="mcal-sbox mdraft-search">
        <Search aria-hidden="true" className="size-4.5" />
        <input value={query} placeholder={t('schedule.mobile.categorySearch')} aria-label={t('schedule.mobile.categorySearch')} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="mdraft-list" role="listbox" aria-label={t('schedule.mobile.category')}>
        {!text ? <button type="button" role="option" className="mdraft-opt" aria-selected={value === null} onClick={() => onPick(null)}><i className="mdraft-cd" data-none aria-hidden="true" />{t('schedule.mobile.none')}</button> : null}
        {rows.map(({ entry, parent }) => (
          <button key={entry.id} type="button" role="option" className="mdraft-opt" data-child={parent ? '' : undefined} aria-selected={value === entry.id} onClick={() => onPick(entry.id)}>
            <i className="mdraft-cd" style={{ '--cal-color': entry.color || parent?.color || 'var(--muted)' } as CSSProperties} aria-hidden="true" />{entry.name}
          </button>
        ))}
        {text && !exact ? (
          <button type="button" className="mdraft-opt mdraft-new" data-category-create onClick={() => { const id = onCreate(query.trim()); if (id) onPick(id) }}>
            <Plus aria-hidden="true" className="size-4" />{t('schedule.mobile.newCategory', { name: query.trim() })}
          </button>
        ) : null}
      </div>
    </Sheet>
  )
}

function DurationSheet({ value, onApply, onClose }: { value: string; onApply: (value: string) => void; onClose: () => void }) {
  const { t } = useI18n()
  const [minutes, setMinutes] = useState(value)
  return (
    <Sheet inline title={t('schedule.mobile.estimate')} onClose={onClose} onDone={() => onApply(minutes)}>
      <div className="mdraft-durs">
        {DURATIONS.map((option) => <button key={option} type="button" aria-pressed={Number(minutes) === option} onClick={() => setMinutes(String(option))}>{durationLabel(t, option)}</button>)}
      </div>
      <label className="mdraft-row">
        <span className="mdraft-lbl">{t('schedule.mobile.customMinutes')}</span>
        <span className="mdraft-val"><input className="mdraft-mini" inputMode="numeric" value={minutes} placeholder="0" onChange={(event) => setMinutes(event.target.value.replace(/\D/g, ''))} />{t('schedule.mobile.minuteUnit')}</span>
      </label>
      {minutes ? <button type="button" className="mdraft-clear" onClick={() => setMinutes('')}>{t('schedule.mobile.clearDuration')}</button> : null}
    </Sheet>
  )
}

/** Same rules as RepeatPicker: "사용자 지정" is the rule with an interval above 1; '' until repeats forever. */
function RepeatSheet({ date, repeat, days, interval, until, onApply, onClose }: {
  date: string
  repeat: RepeatRule
  days: number[]
  interval: number
  until: string
  onApply: (next: Pick<ScheduleDraft, 'repeat' | 'repeatDays' | 'repeatInterval' | 'repeatUntil'>) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const fallback = days.length ? days : [isoWeekday(date)]
  const [rule, setRule] = useState<RepeatRule>(repeat)
  const [every, setEvery] = useState(interval)
  const [weekdays, setWeekdays] = useState(fallback)
  const [end, setEnd] = useState(until)
  const custom = rule !== 'none' && every > 1
  const choose = (value: RepeatRule | 'custom') => {
    if (value === 'custom') { setRule(rule === 'none' ? 'daily' : rule); setEvery(Math.max(2, every)); return }
    setRule(value)
    setEvery(1)
    if (value === 'none') setEnd('')
  }
  const toggleDay = (day: number) => {
    const next = weekdays.includes(day) ? weekdays.filter((value) => value !== day) : [...weekdays, day].sort((a, b) => a - b)
    if (next.length) setWeekdays(next)
  }
  const nextMonth = () => { const value = parseISODate(date); value.setMonth(value.getMonth() + 1); return formatISODate(value) }
  return (
    <Sheet inline title={t('schedule.mobile.repeat')} onClose={onClose}
      onDone={() => onApply({ repeat: rule, repeatDays: rule === 'weekly' ? weekdays : [], repeatInterval: rule === 'none' ? 1 : every, repeatUntil: rule === 'none' ? '' : end })}>
      <div className="mdraft-list" role="radiogroup" aria-label={t('schedule.mobile.repeat')}>
        {(['none', 'daily', 'weekly', 'monthly', 'custom'] as const).map((value) => {
          const active = value === 'custom' ? custom : !custom && rule === value
          return <button key={value} type="button" role="radio" className="mdraft-opt" aria-checked={active} onClick={() => choose(value)}>
            {value === 'monthly' ? t('schedule.mobile.repeatMonthly', { day: Number(date.slice(8)) }) : t(`schedule.mobile.repeatRule.${value}`)}
          </button>
        })}
      </div>
      {custom ? (
        <div className="mdraft-int" role="group" aria-label={t('schedule.mobile.repeatInterval')}>
          <button type="button" className="mdraft-stp" aria-label={t('schedule.mobile.decrease')} onClick={() => setEvery(Math.max(2, every - 1))}>−</button>
          <b aria-live="polite">{every}</b>
          <button type="button" className="mdraft-stp" aria-label={t('schedule.mobile.increase')} onClick={() => setEvery(Math.min(99, every + 1))}>+</button>
          <span className="mdraft-seg" role="group" aria-label={t('schedule.mobile.repeatUnit')}>
            {(['daily', 'weekly', 'monthly'] as const).map((unit) => <button key={unit} type="button" aria-pressed={rule === unit} onClick={() => setRule(unit)}>{t(`schedule.mobile.unit.${unit}`)}</button>)}
          </span>
          <span>{t('schedule.mobile.every')}</span>
        </div>
      ) : null}
      {rule === 'weekly' ? (
        <div className="mdraft-days" role="group" aria-label={t('schedule.mobile.repeatDays')}>
          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
            <button key={day} type="button" aria-pressed={weekdays.includes(day)} data-dow={day} aria-label={t('schedule.mobile.repeatOn', { weekday: t(`schedule.mobile.dowLong.${day % 7}`) })} onClick={() => toggleDay(day)}>{t(`schedule.mobile.dow.${day % 7}`)}</button>
          ))}
          <button type="button" className="mdraft-weekdays" aria-pressed={weekdays.join() === WEEKDAYS.join()} onClick={() => setWeekdays(WEEKDAYS)}>{t('schedule.mobile.weekdays')}</button>
        </div>
      ) : null}
      {rule !== 'none' ? <>
        <div className="mdraft-row mdraft-end">
          <span className="mdraft-lbl" id="mdraft-noend">{t('schedule.mobile.noEnd')}</span>
          <input type="checkbox" role="switch" className="mdraft-sw" aria-labelledby="mdraft-noend" checked={!end} onChange={(event) => setEnd(event.target.checked ? '' : nextMonth())} />
        </div>
        {end ? <div className="mcal-sub-wheel"><DateWheel value={parseISODate(end)} mode="date" onChange={(next) => setEnd(formatISODate(next) < date ? date : formatISODate(next))} /></div> : null}
      </> : null}
    </Sheet>
  )
}
