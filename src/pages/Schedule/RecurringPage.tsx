import { ArrowLeft, CalendarDays, ChevronRight, Repeat, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { isoWeekday, normalizeRepeatDays, repeatsOn } from '../../../packages/types/src/recurrence.ts'
import { CategoryPicker } from '../../components/schedule/CategoryPicker.tsx'
import { RepeatPicker } from '../../components/schedule/RepeatPicker.tsx'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { currentSegment, groupChanges, groupEnded, groupPeriod, groupUpcoming, listRecurring, repeatSummary, timeSummary, upcomingOccurrence, type SeriesFilter } from '../../features/schedule/recurringList.ts'
import { commitSeriesChange, groupMembers, groupSeries, isRecurring, occurrencesBetween, planGroupDelete, planGroupPatch, previewSeriesChange, segmentAt, type PreviewRow, type SeriesChange, type SeriesGroup, type SeriesScope } from '../../features/schedule/seriesEdit.ts'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import type { RepeatRule, WorkItem, WorkPatch, WorkspaceCategory } from '../../types/work.ts'
import { shiftISO, todayISO } from '../../utils/date.ts'
import { categoryPath } from '../../utils/work.ts'
import '../More/more.css'
import './recurring.css'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const FILTERS: { value: SeriesFilter; label: string }[] = [
  { value: 'active', label: '진행 중' },
  { value: 'ended', label: '종료' },
  { value: 'all', label: '전체' },
]
// Labels and hints live in i18n (recurring.scope.*, recurring.scopeHint.*).
const SCOPES: SeriesScope[] = ['this', 'future', 'all']
const PREVIEW_ROWS = 8

function shortDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))} (${WEEKDAYS[isoWeekday(date) - 1]})`
}

/** "11/30", or "2025/3/3" when the year differs from today's. */
function shortDate(date: string, today: string): string {
  const day = `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`
  return date.slice(0, 4) === today.slice(0, 4) ? day : `${date.slice(0, 4)}/${day}`
}

export function RecurringPage() {
  const library = useLibrary()
  const { t } = useI18n()
  const phone = useMediaQuery(PHONE_QUERY)
  const today = todayISO()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<SeriesFilter>('active')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [revision, setRevision] = useState(0)
  const series = useMemo(() => listRecurring(library.items, today, filter, query), [library.items, today, filter, query])
  // Each filter shows its count under the same search.
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(option => [option.value, listRecurring(library.items, today, option.value, query).length])) as Record<SeriesFilter, number>, [library.items, today, query])
  const selectedId = params.get('id')
  // `id` is a series key, or any row of the series (the daily board links a row).
  const selected = useMemo(() => selectedId ? groupSeries(library.items).find(group => group.key === selectedId || groupMembers(group).some(row => row.id === selectedId)) ?? null : null, [library.items, selectedId])
  const searchOpen = !phone || searching || Boolean(query)

  // Running series split into this week (through Sunday) and later; other filters stay one list.
  const weekEnd = shiftISO(today, 7 - isoWeekday(today))
  const sections: { key: string; label: string | null; rows: SeriesGroup[] }[] = filter === 'active'
    ? [
        { key: 'week', label: t('recurring.thisWeek'), rows: series.filter(group => (groupUpcoming(group, today) ?? '9999-12-31') <= weekEnd) },
        { key: 'later', label: t('recurring.later'), rows: series.filter(group => (groupUpcoming(group, today) ?? '9999-12-31') > weekEnd) },
      ].filter(section => section.rows.length)
    : [{ key: filter, label: null, rows: series }]

  const select = (id: string | null, date?: string | null) => {
    const next = new URLSearchParams()
    if (id) next.set('id', id)
    if (id && date) next.set('date', date)
    setParams(next, { replace: Boolean(selectedId && id) })
  }

  return (
    <div className={phone ? 'rec-page' : 'rec-page mx-auto w-full max-w-6xl px-4 py-6 md:px-10 md:py-8'}>
      {!phone && <>
        <div className="flex items-center gap-3">
          <Link to={ROUTES.schedule} className="btn btn-ghost rec-back shrink-0 px-2" aria-label="일정으로 돌아가기"><ArrowLeft size={16} strokeWidth={1.5} /></Link>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-medium tracking-tight">{t('nav.recurring')}</h1>
        </div>
        <p className="rec-intro mt-2 text-sm">반복 일정을 한곳에서 확인하고, 수정 범위를 골라 바꿀 수 있습니다.</p>
      </>}
      <div className={phone ? '' : 'mt-6 grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]'}>
        <section aria-label="반복 일정 목록" className={selected ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
          {phone && <header className="more-bar">
            <Link to={ROUTES.schedule} className="more-ib" aria-label="일정으로 돌아가기"><ArrowLeft className="size-5.5" strokeWidth={1.8} aria-hidden="true" /></Link>
            <h1>{t('nav.recurring')}</h1>
            <button type="button" className="more-ib" aria-expanded={searchOpen} aria-label={searchOpen ? t('recurring.searchClose') : t('recurring.search')}
              onClick={() => { if (searchOpen) setQuery(''); setSearching(!searchOpen) }}>
              {searchOpen ? <X className="size-5.5" strokeWidth={1.8} aria-hidden="true" /> : <Search className="size-5.5" strokeWidth={1.8} aria-hidden="true" />}
            </button>
          </header>}
          <div className="rec-body">
            <div className="rec-seg" role="group" aria-label="반복 일정 필터">
              {FILTERS.map(option => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}<em>{counts[option.value]}</em></button>)}
            </div>
            {searchOpen && <input data-theme-slot="input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="제목 검색" aria-label="반복 일정 검색" autoFocus={phone} className="field rec-search" />}
            {series.length === 0
              ? <EmptyState>{query ? '검색 결과가 없습니다.' : '반복 일정이 없습니다. 일정 화면에서 반복을 설정하면 여기에 모입니다.'}</EmptyState>
              : <>
                  {sections.map(section => <div key={section.key} className="rec-group">
                    {section.label && <h2 className="more-label">{section.label}<small>{section.rows.length}</small></h2>}
                    <ul className="more-card rec-list">
                      {section.rows.map(group => <SeriesRow key={group.key} group={group} today={today} categories={library.categories} active={group.key === selected?.key} onSelect={() => select(group.key)} />)}
                    </ul>
                  </div>)}
                  <p className="more-hint">{t('recurring.addHint')}</p>
                </>}
          </div>
        </section>
        <section aria-label="반복 일정 수정" className={selected ? 'min-w-0' : 'hidden min-w-0 lg:block'}>
          {selected
            ? <SeriesEditor key={`${selected.key}:${revision}`} group={selected} today={today} initialDate={params.get('date')} categories={library.categories} phone={phone}
                onBack={() => select(null)}
                onCommit={async changes => {
                  const result = await commitSeriesChange(changes, library.commitWork)
                  // The series keeps its key while any part of it is left.
                  const kept = [...result.updated, ...result.created].find(row => isRecurring(row))
                  setRevision(value => value + 1)
                  select(kept ? selected.key : null)
                }} />
            : <div className="rec-placeholder">목록에서 반복 일정을 선택하세요.</div>}
        </section>
      </div>
    </div>
  )
}

function SeriesRow({ group, today, categories, active, onSelect }: { group: SeriesGroup; today: string; categories: WorkspaceCategory[]; active: boolean; onSelect: () => void }) {
  const { t } = useI18n()
  const item = currentSegment(group, today)
  const color = categories.find(category => category.id === item.categoryId)?.color
  const path = categoryPath(item.categoryId, categories)
  const next = groupUpcoming(group, today)
  const period = groupPeriod(group)
  const changes = groupChanges(group)
  const meta = [repeatSummary(item), timeSummary(item), item.kind === 'task' ? '할 일' : '', path ?? '', period.end ? t('recurring.until', { date: shortDate(period.end, today) }) : ''].filter(Boolean).join(' · ')
  const day = !next ? null : next === today ? t('recurring.today') : next === shiftISO(today, 1) ? t('recurring.tomorrow') : `${Number(next.slice(5, 7))}/${Number(next.slice(8))}`
  return (
    <li>
      <button data-theme-slot="schedule-card" type="button" aria-current={active || undefined} data-ended={next ? undefined : ''} onClick={onSelect} className="more-row rec-row">
        <span aria-hidden="true" className="rec-cbar" style={{ background: color || 'var(--accent-color)' }} />
        <span className="more-rt">
          <span data-theme-slot="schedule-title" className="rec-title">{item.title}</span>
          <small data-theme-slot="schedule-time">{meta}{changes && <> · <span data-series-changes className="rec-changes">{changes}</span></>}</small>
        </span>
        <span className="rec-next">{next ? <><b>{day}</b>{WEEKDAYS[isoWeekday(next) - 1]}</> : <b>종료됨</b>}</span>
      </button>
    </li>
  )
}

/** The series over time: each rule period and each single-day change, in date order. */
function SeriesTimeline({ group, base, today, categories, onPick }: { group: SeriesGroup; base: WorkItem; today: string; categories: WorkspaceCategory[]; onPick: (row: WorkItem) => void }) {
  const { t } = useI18n()
  const rows = groupMembers(group).sort((a, b) => a.date.localeCompare(b.date))
  return (
    <section aria-label="반복 구간">
      <h3 className="more-label">{t('recurring.history')}</h3>
      <ol className="more-card rec-timeline">
        {rows.map(row => {
          const recurring = isRecurring(row)
          const current = row.id === base.id
          const ended = recurring && !upcomingOccurrence(row, today)
          const category = row.categoryId !== base.categoryId ? ` · ${categoryPath(row.categoryId, categories) ?? '미분류'}` : ''
          const label = recurring
            ? `${shortDay(row.date)} ~ ${row.repeatUntil ? shortDay(row.repeatUntil) : '계속'}`
            : shortDay(row.date)
          const detail = recurring ? `${repeatSummary(row)} · ${timeSummary(row)}` : `이 날만 · ${timeSummary(row)}${row.title !== base.title ? ` · ${row.title}` : ''}`
          return (
            <li key={row.id} data-segment={recurring ? 'rule' : 'single'}>
              <button type="button" disabled={!recurring} aria-current={current || undefined} data-ended={ended || undefined} onClick={() => onPick(row)}>
                <span aria-hidden="true" className={recurring ? 'rec-dot' : 'rec-dot rec-dot-single'} />
                <span className="whitespace-nowrap">{label}</span>
                <span className="min-w-0 truncate">{detail}{category}</span>
                <span className="rec-tl-state">{current ? '수정 중' : recurring ? (ended ? '지난 구간' : '') : '개별 변경'}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="more-hint">이 반복 일정은 수정 이력에 따라 나뉘어 있어요. 구간을 고르면 그 구간 기준으로 수정합니다.</p>
    </section>
  )
}

type Form = {
  title: string
  description: string
  categoryId: string | null
  allDay: boolean
  startTime: string
  endTime: string
  repeat: RepeatRule
  repeatDays: number[]
  repeatInterval: number
  date: string
  hasEnd: boolean
  repeatUntil: string
}

function formFrom(item: WorkItem, group?: SeriesGroup): Form {
  // Start and end describe the whole series; the rest describes the segment being edited.
  const start = group?.segments[0].date ?? item.date
  const end = group ? group.segments.at(-1)!.repeatUntil ?? null : item.repeatUntil ?? null
  return {
    title: item.title, description: item.description, categoryId: item.categoryId,
    allDay: item.kind === 'event' && !item.startTime, startTime: item.startTime ?? '', endTime: item.endTime ?? '',
    repeat: item.repeat, repeatDays: item.repeat === 'weekly' ? (item.repeatDays?.length ? normalizeRepeatDays(item.repeatDays) : [isoWeekday(item.date)]) : [],
    repeatInterval: item.repeatInterval ?? 1,
    date: start, hasEnd: Boolean(end), repeatUntil: end ?? '',
  }
}

function patchFrom(item: WorkItem, form: Form, scope: SeriesScope, group: SeriesGroup): WorkPatch {
  const patch: WorkPatch = {}
  const title = form.title.trim()
  if (title !== item.title) patch.title = title
  if (form.description.trim() !== item.description) patch.description = form.description.trim()
  if (form.categoryId !== item.categoryId) patch.categoryId = form.categoryId
  const startTime = form.allDay ? null : form.startTime || null
  const endTime = startTime ? form.endTime || null : null
  if (startTime !== item.startTime || endTime !== item.endTime) {
    Object.assign(patch, { startTime, endTime, allDay: item.kind === 'event' && !startTime, duration: startTime && endTime ? null : item.kind === 'task' ? item.duration : null })
  }
  if (scope === 'this') return patch
  const original = formFrom(item, group)
  if (form.repeat !== item.repeat || form.repeatDays.join() !== original.repeatDays.join()) Object.assign(patch, { repeat: form.repeat, repeatDays: form.repeatDays })
  if (form.repeatInterval !== original.repeatInterval) patch.repeatInterval = form.repeatInterval
  if (scope === 'all' && form.date !== original.date) patch.date = form.date
  const until = form.hasEnd ? form.repeatUntil || null : null
  if (until !== (original.hasEnd ? original.repeatUntil : null)) patch.repeatUntil = until
  return patch
}

/** One on/off row; the whole row is the 44px+ target. */
function SwitchRow({ checked, onChange, children, ...rest }: { checked: boolean; onChange: () => void; children: ReactNode; 'data-end-toggle'?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange} className="rec-frow rec-switch" {...rest}>
      {children}
      <span aria-hidden="true" className={checked ? 'switch switch-on' : 'switch'} />
    </button>
  )
}

function SeriesEditor({ group, today, initialDate, categories, phone, onBack, onCommit }: {
  group: SeriesGroup
  today: string
  initialDate: string | null
  categories: WorkspaceCategory[]
  phone: boolean
  onBack: () => void
  onCommit: (changes: SeriesChange[]) => Promise<void>
}) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const { addCategory } = useLibrary()
  const occurrences = useMemo(() => {
    const all = (from: string, to: string, limit: number) => [...new Set(group.segments.flatMap(row => occurrencesBetween(row, from, to, limit)))].sort()
    const around = all(shiftISO(today, -28), shiftISO(today, 365), 60).slice(0, 60)
    const list = around.length ? around : all(group.segments[0].date, today, 400).slice(-20)
    const own = initialDate && group.segments.some(row => repeatsOn(row, initialDate))
    return own && !list.includes(initialDate) ? [initialDate, ...list].sort() : list
  }, [group, today, initialDate])
  const [occurrence, setOccurrence] = useState(() => (initialDate && occurrences.includes(initialDate) ? initialDate : groupUpcoming(group, today) && occurrences.find(day => day >= today) || occurrences.at(-1) || group.segments[0].date))
  const item = segmentAt(group, occurrence)
  const [scope, setScope] = useState<SeriesScope>(initialDate ? 'this' : 'all')
  const [form, setForm] = useState(() => formFrom(item, group))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<Form>) => { setForm(current => ({ ...current, ...patch })); setError('') }
  // Moving to another rule period edits that period, so its values replace the form.
  const pickOccurrence = (day: string) => {
    if (segmentAt(group, day).id !== item.id) setForm(formFrom(segmentAt(group, day), group))
    setOccurrence(day)
    setError('')
  }
  const pickSegment = (row: WorkItem) => {
    const days = occurrencesBetween(row, row.date, row.repeatUntil ?? shiftISO(today, 365), 400)
    const day = days.find(value => value >= today) ?? days.at(-1)
    if (day) pickOccurrence(day)
  }

  const members = useMemo(() => groupMembers(group), [group])
  const patch = useMemo(() => patchFrom(item, form, scope, group), [item, form, scope, group])
  const dirty = Object.keys(patch).length > 0
  const change = useMemo(() => planGroupPatch(group, occurrence, scope, patch), [group, occurrence, scope, patch])
  const previewFrom = scope === 'all' && form.date < occurrence ? (form.date > today ? form.date : today < occurrence ? today : occurrence) : occurrence
  const preview = useMemo(() => dirty ? previewSeriesChange(members, change, previewFrom, PREVIEW_ROWS) : [], [dirty, members, change, previewFrom])
  const ruleLocked = scope === 'this'
  const seriesStart = scope === 'all' ? form.date : occurrence

  const validate = (): string => {
    if (!form.title.trim()) return '제목을 입력해 주세요.'
    // A task may have no time at all; an event needs a time or all-day.
    if (item.kind === 'event' && !form.allDay && !form.startTime) return '시작 시간을 입력하거나 종일로 바꿔 주세요.'
    if (form.startTime && form.endTime && form.endTime <= form.startTime && !form.allDay) return '종료 시간은 시작 시간보다 늦어야 합니다.'
    if (!ruleLocked && form.hasEnd && !form.repeatUntil) return '종료일을 입력하거나 종료일 없음을 선택해 주세요.'
    if (!ruleLocked && form.hasEnd && form.repeatUntil < seriesStart) return '종료일은 시작일보다 같거나 늦어야 합니다.'
    return ''
  }

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : '저장하지 못했습니다. 다시 시도해 주세요.') } finally { setBusy(false) }
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    const problem = validate()
    if (problem) return setError(problem)
    if (!dirty || busy) return
    void run(() => onCommit(change))
  }

  const remove = async () => {
    const parts = groupChanges(group)
    const message = scope === 'this' ? `${shortDay(occurrence)} 일정만 삭제할까요?`
      : scope === 'future' ? `${shortDay(occurrence)}부터 이후 반복을 모두 삭제할까요? 이전 일정은 남습니다.`
        : `'${item.title}' 반복 일정 전체를 삭제할까요?${parts ? ` (${parts} 포함)` : ''} 휴지통에서 복구할 수 있습니다.`
    if (busy || !await confirm(message, { title: '반복 일정 삭제', confirmLabel: '삭제' })) return
    void run(() => onCommit(planGroupDelete(group, occurrence, scope)))
  }

  // The save button names how many upcoming dates change; "or more" once every previewed date does.
  const changed = preview.filter(row => row.status !== 'same').length
  const saveLabel = busy ? t('recurring.saving')
    : dirty && changed ? t(changed === preview.length && preview.length >= PREVIEW_ROWS ? 'recurring.saveCountMore' : 'recurring.saveCount', { count: changed })
      : t('recurring.save')
  const path = categoryPath(item.categoryId, categories)
  const sub = [repeatSummary(item), t('recurring.since', { date: shortDate(group.segments[0].date, today) }), groupEnded(group, today) ? '종료됨' : ''].filter(Boolean).join(' · ')
  const actions = <>
    <button data-theme-slot="button" type="button" className="btn btn-line" disabled={busy || !dirty} onClick={() => { setForm(formFrom(item)); setError('') }}>{t('recurring.revert')}</button>
    <button data-theme-slot="button-primary" type="submit" className="btn btn-primary" disabled={busy || !dirty}>{saveLabel}</button>
  </>
  const errorText = error ? <p role="alert" className="rec-error">{error}</p> : null

  return (
    <form onSubmit={save} className="rec-editor">
      {phone
        ? <header className="more-bar rec-bar">
            <button type="button" className="more-ib" onClick={onBack} aria-label={t('recurring.back')}><ArrowLeft className="size-5.5" strokeWidth={1.8} aria-hidden="true" /></button>
            <h1>{item.title}<span className="rec-bar-sub">{sub}</span></h1>
            <button data-theme-slot="button" type="button" className="more-ib rec-danger" disabled={busy} onClick={() => void remove()} aria-label={t('recurring.delete')}><Trash2 className="size-5" strokeWidth={1.8} aria-hidden="true" /></button>
          </header>
        : <>
            <header className="rec-head">
              <span className="shrink-0 lg:hidden"><button type="button" className="btn btn-ghost px-2" onClick={onBack} aria-label={t('recurring.back')}><ArrowLeft size={16} strokeWidth={1.5} /></button></span>
              <Repeat size={16} strokeWidth={1.5} className="rec-head-icon hidden shrink-0 lg:block" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-medium">{item.title}</h2>
                <p className="rec-sub">{sub}{path ? ` · ${path}` : ''}</p>
              </div>
              <div className="rec-head-actions">
                <button data-theme-slot="button" type="button" className="btn btn-ghost rec-danger" disabled={busy} onClick={() => void remove()}>{t('recurring.delete')}</button>
                {actions}
              </div>
            </header>
            {errorText}
          </>}

      <div className="rec-form">
        <h3 className="more-label">기준 일정</h3>
        <div className="more-card">
          <label className="more-row rec-pick">
            <span className="more-ri rec-ri-accent"><CalendarDays className="size-4.5" strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="more-rt">{shortDay(occurrence)}<small>{occurrence === today ? t('recurring.today') : occurrence < today ? t('recurring.basePast') : t('recurring.baseUpcoming')}</small></span>
            <ChevronRight className="more-chev size-4.5" aria-hidden="true" />
            <select data-theme-slot="input" aria-label="기준 일정" value={occurrence} onChange={event => pickOccurrence(event.target.value)}>
              {occurrences.map(day => <option key={day} value={day}>{shortDay(day)}{day === today ? ' · 오늘' : day < today ? ' · 지남' : ''}</option>)}
            </select>
          </label>
        </div>

        <h3 className="more-label">{t('recurring.scopeTitle')}</h3>
        <div className="rec-scope" role="radiogroup" aria-label="수정 범위">
          {SCOPES.map(value => <button key={value} data-theme-slot="button" type="button" role="radio" aria-checked={scope === value} onClick={() => setScope(value)}>
            <span aria-hidden="true" className="rec-radio" />
            <span className="rec-scope-text"><b>{t(`recurring.scope.${value}`)}</b><small>{t(`recurring.scopeHint.${value}`, { date: shortDay(occurrence) })}</small></span>
          </button>)}
        </div>

        <div className="rec-cols">
          <div>
            <h3 className="more-label">{t('recurring.basics')}</h3>
            <div className="more-card rec-card">
              <label className="rec-frow">제목<input data-theme-slot="input" value={form.title} onChange={event => set({ title: event.target.value })} className="field" /></label>
              {item.kind === 'event' && <SwitchRow checked={form.allDay} onChange={() => form.allDay ? set({ allDay: false, startTime: form.startTime || '09:00', endTime: form.endTime || '10:00' }) : set({ allDay: true })}>
                <span>{t('recurring.allDay')}</span>
              </SwitchRow>}
              {!form.allDay && <>
                <label className="rec-frow">시작<input data-theme-slot="input" type="time" value={form.startTime} onChange={event => set({ startTime: event.target.value })} className="field" /></label>
                <label className="rec-frow">종료<input data-theme-slot="input" type="time" value={form.endTime} onChange={event => set({ endTime: event.target.value })} className="field" /></label>
              </>}
            </div>
          </div>
          <div>
            <h3 className="more-label">{t('recurring.rule')}</h3>
            <fieldset disabled={ruleLocked} data-locked={ruleLocked || undefined} className="more-card rec-card">
              <div className="rec-picker">
                <RepeatPicker repeat={form.repeat} days={form.repeatDays} date={seriesStart} allowNone={false} hint={null} interval={form.repeatInterval} onIntervalChange={repeatInterval => set({ repeatInterval })} onChange={(repeat, repeatDays) => set({ repeat, repeatDays })} />
              </div>
              <label className="rec-frow">
                시작일
                <input data-theme-slot="input" type="date" value={seriesStart} disabled={scope !== 'all'} onChange={event => event.target.value && set({ date: event.target.value })} className="field" />
              </label>
              <SwitchRow data-end-toggle checked={form.hasEnd} onChange={() => set({ hasEnd: !form.hasEnd, repeatUntil: form.repeatUntil || shiftISO(seriesStart, 90) })}>
                <span>{t('recurring.hasEnd')}</span>
                {!form.hasEnd && <span className="rec-val">{t('recurring.noEnd')}</span>}
              </SwitchRow>
              {form.hasEnd && <label className="rec-frow">
                종료일
                <input data-theme-slot="input" type="date" aria-label="종료일" value={form.repeatUntil} min={seriesStart} onChange={event => set({ repeatUntil: event.target.value })} className="field" />
              </label>}
            </fieldset>
            {ruleLocked && <p className="more-hint">이번 일정만 바꿀 때는 반복 규칙과 기간을 바꿀 수 없습니다.</p>}
          </div>
        </div>

        <h3 className="more-label">{t('recurring.extra')}</h3>
        <div className="more-card rec-card">
          <div className="rec-frow"><span>{t('recurring.category')}</span><div className="rec-grow"><CategoryPicker categories={categories} value={form.categoryId} onChange={categoryId => set({ categoryId })} onCreate={name => addCategory(name, null)} /></div></div>
          <label className="rec-frow rec-frow-top">
            {t('recurring.memo')}
            <textarea data-theme-slot="input" value={form.description} onChange={event => set({ description: event.target.value })} className="field min-h-16 resize-y" />
          </label>
        </div>

        <Preview rows={preview} dirty={dirty} scope={scope} />

        {members.length > 1 && <SeriesTimeline group={group} base={item} today={today} categories={categories} onPick={pickSegment} />}
      </div>

      {phone && <div className="rec-actionbar">
        {errorText}
        <div className="rec-actions">{actions}</div>
      </div>}
    </form>
  )
}

const STATUS_LABEL: Record<PreviewRow['status'], string> = { same: '', changed: '변경', added: '추가', removed: '제외' }

function occurrenceLabel(row: WorkItem | null): string {
  return row ? `${timeSummary(row)}${row.repeat === 'none' ? ' · 이번만' : ''}` : '—'
}

function Preview({ rows, dirty, scope }: { rows: PreviewRow[]; dirty: boolean; scope: SeriesScope }) {
  const { t } = useI18n()
  const changed = rows.filter(row => row.status !== 'same').length
  return (
    <section aria-label="적용 미리보기">
      <h3 className="more-label">{t('recurring.previewTitle')}{dirty && <small>다가오는 {rows.length}개 중 {changed}개 달라짐</small>}</h3>
      <div className="more-card">
        {!dirty
          ? <p className="rec-empty">내용을 바꾸면 적용 결과가 여기에 표시됩니다.</p>
          : rows.length === 0
            ? <p className="rec-empty">{scope === 'all' ? '남는 반복 일정이 없습니다.' : '이후 반복 일정이 없습니다.'}</p>
            : <ul className="rec-preview">
                {rows.map(row => <li key={row.date} data-status={row.status}>
                  <span>{shortDay(row.date)}</span>
                  <span className="min-w-0 truncate">
                    {row.status === 'same' ? occurrenceLabel(row.after)
                      : <><span className={row.status === 'added' ? '' : 'rec-before'}>{occurrenceLabel(row.before)}</span> → {row.status === 'removed' ? '없음' : <>{occurrenceLabel(row.after)}{row.after && row.before && row.after.title !== row.before.title ? ` · ${row.after.title}` : ''}</>}</>}
                  </span>
                  <span className="rec-status">{STATUS_LABEL[row.status]}</span>
                </li>)}
              </ul>}
      </div>
    </section>
  )
}
