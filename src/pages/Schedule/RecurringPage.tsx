import { ArrowLeft, Repeat } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { isoWeekday, normalizeRepeatDays, repeatsOn } from '../../../packages/types/src/recurrence.ts'
import { CategoryPicker } from '../../components/schedule/CategoryPicker.tsx'
import { RepeatPicker } from '../../components/schedule/RepeatPicker.tsx'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { currentSegment, groupChanges, ruleChanges, groupEnded, groupPeriod, groupUpcoming, listRecurring, repeatSummary, timeSummary, upcomingOccurrence, type SeriesFilter } from '../../features/schedule/recurringList.ts'
import { commitSeriesChange, groupMembers, groupSeries, isRecurring, occurrencesBetween, planGroupDelete, planGroupPatch, previewSeriesChange, segmentAt, type PreviewRow, type SeriesChange, type SeriesGroup, type SeriesScope } from '../../features/schedule/seriesEdit.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import type { RepeatRule, WorkItem, WorkPatch, WorkspaceCategory } from '../../types/work.ts'
import { shiftISO, todayISO } from '../../utils/date.ts'
import { categoryPath } from '../../utils/work.ts'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const FILTERS: { value: SeriesFilter; label: string }[] = [
  { value: 'active', label: '진행 중' },
  { value: 'ended', label: '종료' },
  { value: 'all', label: '전체' },
]
const SCOPES: { value: SeriesScope; label: string; hint: string }[] = [
  { value: 'this', label: '이번 일정만', hint: '선택한 날짜 하나만 바꾸고 나머지 반복은 그대로 둡니다.' },
  { value: 'future', label: '이번 일정부터 이후', hint: '선택한 날짜부터 새 규칙으로 바꾸고 이전 일정은 그대로 둡니다.' },
  { value: 'all', label: '전체 반복 일정', hint: '지난 일정을 포함한 반복 일정 전체를 바꿉니다.' },
]

function shortDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))} (${WEEKDAYS[isoWeekday(date) - 1]})`
}

export function RecurringPage() {
  const library = useLibrary()
  const today = todayISO()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<SeriesFilter>('active')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const series = useMemo(() => listRecurring(library.items, today, filter, query), [library.items, today, filter, query])
  const selectedId = params.get('id')
  // `id` is a series key, or any row of the series (the daily board links a row).
  const selected = useMemo(() => selectedId ? groupSeries(library.items).find(group => group.key === selectedId || groupMembers(group).some(row => row.id === selectedId)) ?? null : null, [library.items, selectedId])

  const select = (id: string | null, date?: string | null) => {
    const next = new URLSearchParams()
    if (id) next.set('id', id)
    if (id && date) next.set('date', date)
    setParams(next, { replace: Boolean(selectedId && id) })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <div className="flex items-center gap-3">
        <Link to={ROUTES.schedule} className="btn btn-ghost shrink-0 px-2" aria-label="일정으로 돌아가기"><ArrowLeft size={16} strokeWidth={1.5} /></Link>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-medium tracking-tight">반복 일정</h1>
      </div>
      <p className="mt-2 text-sm text-neutral-400">반복 일정을 한곳에서 확인하고, 수정 범위를 골라 바꿀 수 있습니다.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section aria-label="반복 일정 목록" className={selected ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="group" aria-label="반복 일정 필터">
              {FILTERS.map(option => <button key={option.value} type="button" aria-pressed={filter === option.value} className={filter === option.value ? 'chip chip-on' : 'chip'} onClick={() => setFilter(option.value)}>{option.label}</button>)}
            </div>
            <input data-theme-slot="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="제목 검색" aria-label="반복 일정 검색" className="field min-w-0 flex-1" />
          </div>
          <p className="mt-3 text-xs text-neutral-400">{series.length}개</p>
          {series.length === 0
            ? <EmptyState>{query ? '검색 결과가 없습니다.' : '반복 일정이 없습니다. 일정 화면에서 반복을 설정하면 여기에 모입니다.'}</EmptyState>
            : <ul className="mt-2 overflow-hidden rounded-md border border-line bg-surface">
                {series.map(group => <SeriesRow key={group.key} group={group} today={today} categories={library.categories} active={group.key === selected?.key} onSelect={() => select(group.key)} />)}
              </ul>}
        </section>
        <section aria-label="반복 일정 수정" className={selected ? 'min-w-0' : 'hidden min-w-0 lg:block'}>
          {selected
            ? <SeriesEditor key={`${selected.key}:${revision}`} group={selected} today={today} initialDate={params.get('date')} categories={library.categories}
                onBack={() => select(null)}
                onCommit={async changes => {
                  const result = await commitSeriesChange(changes, library.commitWork)
                  // The series keeps its key while any part of it is left.
                  const kept = [...result.updated, ...result.created].find(row => isRecurring(row))
                  setRevision(value => value + 1)
                  select(kept ? selected.key : null)
                }} />
            : <div className="rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-neutral-400">목록에서 반복 일정을 선택하세요.</div>}
        </section>
      </div>
    </div>
  )
}

function SeriesRow({ group, today, categories, active, onSelect }: { group: SeriesGroup; today: string; categories: WorkspaceCategory[]; active: boolean; onSelect: () => void }) {
  const item = currentSegment(group, today)
  const color = categories.find(category => category.id === item.categoryId)?.color
  const path = categoryPath(item.categoryId, categories)
  const next = groupUpcoming(group, today)
  const period = groupPeriod(group)
  const changes = groupChanges(group)
  return (
    <li className="border-t border-line first:border-t-0">
      <button data-theme-slot="schedule-card" type="button" aria-current={active || undefined} onClick={onSelect}
        className={`flex w-full items-start gap-3 px-3 py-3 text-left ${active ? 'bg-accent-light' : ''}`}>
        <span aria-hidden="true" className="mt-1 h-9 w-[3px] shrink-0 rounded-full" style={{ background: color || 'var(--accent-color)' }} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span data-theme-slot="schedule-title" className="truncate text-sm text-neutral-900">{item.title}</span>
            <span className="shrink-0 text-xs text-neutral-400">{next ? `다음 ${shortDay(next)}` : '종료됨'}</span>
          </span>
          <span data-theme-slot="schedule-time" className="mt-1 block text-xs text-neutral-500">{repeatSummary(item)} · {timeSummary(item)}{ruleChanges(group) ? ' · 지금 규칙' : ''}</span>
          <span className="mt-0.5 block truncate text-xs text-neutral-400">{period.start} ~ {period.end ?? '종료일 없음'}{item.kind === 'task' ? ' · 할 일' : ''} · {path ?? '미분류'}</span>
          {changes && <span data-series-changes className="mt-1 inline-block rounded-full border border-line px-2 py-0.5 text-[11px] text-neutral-500">{changes}</span>}
        </span>
      </button>
    </li>
  )
}

/** The series over time: each rule period and each single-day change, in date order. */
function SeriesTimeline({ group, base, today, categories, onPick }: { group: SeriesGroup; base: WorkItem; today: string; categories: WorkspaceCategory[]; onPick: (row: WorkItem) => void }) {
  const rows = groupMembers(group).sort((a, b) => a.date.localeCompare(b.date))
  return (
    <section aria-label="반복 구간" className="mt-4 rounded-md border border-line px-3 py-2">
      <p className="text-xs text-neutral-500">이 반복 일정은 수정 이력에 따라 나뉘어 있어요. 구간을 고르면 그 구간 기준으로 수정합니다.</p>
      <ol className="mt-2 space-y-1">
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
              <button type="button" disabled={!recurring} aria-current={current || undefined} onClick={() => onPick(row)}
                className={`grid w-full grid-cols-[0.75rem_minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-1 text-left text-xs ${current ? 'bg-accent-light text-neutral-900' : 'text-neutral-600'} ${ended ? 'opacity-60' : ''}`}>
                <span aria-hidden="true" className={recurring ? 'size-2 rounded-full bg-accent' : 'size-2 rotate-45 border border-accent'} />
                <span className="whitespace-nowrap">{label}</span>
                <span className="min-w-0 truncate">{detail}{category}</span>
                <span className="text-neutral-400">{current ? '수정 중' : recurring ? (ended ? '지난 구간' : '') : '개별 변경'}</span>
              </button>
            </li>
          )
        })}
      </ol>
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

function SeriesEditor({ group, today, initialDate, categories, onBack, onCommit }: {
  group: SeriesGroup
  today: string
  initialDate: string | null
  categories: WorkspaceCategory[]
  onBack: () => void
  onCommit: (changes: SeriesChange[]) => Promise<void>
}) {
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
  const preview = useMemo(() => dirty ? previewSeriesChange(members, change, previewFrom, 8) : [], [dirty, members, change, previewFrom])
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

  return (
    <form onSubmit={save} className="rounded-md border border-line bg-surface px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="shrink-0 lg:hidden"><button type="button" className="btn btn-ghost px-2" onClick={onBack} aria-label="목록으로"><ArrowLeft size={16} strokeWidth={1.5} /></button></span>
        <Repeat size={16} strokeWidth={1.5} className="hidden shrink-0 text-neutral-400 lg:block" aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-base font-medium">{item.title}</h2>
        <span className="shrink-0 text-xs text-neutral-400">{repeatSummary(item)}{groupEnded(group, today) ? ' · 종료됨' : ''}</span>
      </div>
      {members.length > 1 && <SeriesTimeline group={group} base={item} today={today} categories={categories} onPick={pickSegment} />}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-neutral-500">
          기준 일정
          <select data-theme-slot="input" aria-label="기준 일정" className="field mt-1 w-full" value={occurrence} onChange={event => pickOccurrence(event.target.value)}>
            {occurrences.map(day => <option key={day} value={day}>{shortDay(day)}{day === today ? ' · 오늘' : day < today ? ' · 지남' : ''}</option>)}
          </select>
        </label>
        <div className="text-xs text-neutral-500 sm:col-span-2">
          수정 범위
          <div className="mt-1 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="수정 범위">
            {SCOPES.map(option => <button key={option.value} data-theme-slot="button" type="button" role="radio" aria-checked={scope === option.value}
              className={scope === option.value ? 'field choice-on text-center' : 'field text-center text-neutral-400'} onClick={() => setScope(option.value)}>{option.label}</button>)}
          </div>
          <p className="mt-1">{SCOPES.find(option => option.value === scope)?.hint}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <label className="text-xs text-neutral-500 sm:col-span-2">
          제목
          <input data-theme-slot="input" value={form.title} onChange={event => set({ title: event.target.value })} className="field mt-1 w-full" />
        </label>
        {item.kind === 'event' && <div className="text-xs text-neutral-500 sm:col-span-2">
          시간
          <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="시간">
            <button data-theme-slot="button" type="button" role="radio" aria-checked={!form.allDay} className={!form.allDay ? 'field choice-on text-center' : 'field text-center text-neutral-400'} onClick={() => set({ allDay: false, startTime: form.startTime || '09:00', endTime: form.endTime || '10:00' })}>시각</button>
            <button data-theme-slot="button" type="button" role="radio" aria-checked={form.allDay} className={form.allDay ? 'field choice-on text-center' : 'field text-center text-neutral-400'} onClick={() => set({ allDay: true })}>종일</button>
          </div>
        </div>}
        {!form.allDay && <>
          <label className="text-xs text-neutral-500">시작<input data-theme-slot="input" type="time" value={form.startTime} onChange={event => set({ startTime: event.target.value })} className="field mt-1 w-full" /></label>
          <label className="text-xs text-neutral-500">종료<input data-theme-slot="input" type="time" value={form.endTime} onChange={event => set({ endTime: event.target.value })} className="field mt-1 w-full" /></label>
        </>}
        <fieldset disabled={ruleLocked} className={`grid gap-3 sm:col-span-2 sm:grid-cols-2 ${ruleLocked ? 'opacity-50' : ''}`}>
          <div className="sm:col-span-2">
            <RepeatPicker repeat={form.repeat} days={form.repeatDays} date={seriesStart} allowNone={false} hint={null} interval={form.repeatInterval} onIntervalChange={repeatInterval => set({ repeatInterval })} onChange={(repeat, repeatDays) => set({ repeat, repeatDays })} />
          </div>
          <label className="text-xs text-neutral-500">
            시작일
            <input data-theme-slot="input" type="date" value={seriesStart} disabled={scope !== 'all'} onChange={event => event.target.value && set({ date: event.target.value })} className="field mt-1 w-full" />
          </label>
          <div className="text-xs text-neutral-500">
            종료일
            <input data-theme-slot="input" type="date" aria-label="종료일" value={form.hasEnd ? form.repeatUntil : ''} min={seriesStart} disabled={!form.hasEnd} onChange={event => set({ repeatUntil: event.target.value })} className="field mt-1 w-full" />
            <label className="mt-1 flex items-center gap-1"><input type="checkbox" checked={!form.hasEnd} onChange={event => set({ hasEnd: !event.target.checked, repeatUntil: form.repeatUntil || shiftISO(seriesStart, 90) })} />종료일 없음</label>
          </div>
          {ruleLocked && <p className="text-xs text-neutral-400 sm:col-span-2">이번 일정만 바꿀 때는 반복 규칙과 기간을 바꿀 수 없습니다.</p>}
        </fieldset>
        <div className="text-xs text-neutral-500 sm:col-span-2">
          카테고리
          <div className="mt-2"><CategoryPicker categories={categories} value={form.categoryId} onChange={categoryId => set({ categoryId })} onCreate={name => addCategory(name, null)} /></div>
        </div>
        <label className="text-xs text-neutral-500 sm:col-span-2">
          설명
          <textarea data-theme-slot="input" value={form.description} onChange={event => set({ description: event.target.value })} className="field mt-1 min-h-16 w-full resize-y" />
        </label>
      </div>

      <Preview rows={preview} dirty={dirty} scope={scope} />

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button data-theme-slot="button" type="button" className="btn btn-ghost" disabled={busy} onClick={() => void remove()}>삭제</button>
        <div className="flex gap-2">
          <button data-theme-slot="button" type="button" className="btn btn-ghost" disabled={busy || !dirty} onClick={() => { setForm(formFrom(item)); setError('') }}>되돌리기</button>
          <button data-theme-slot="button-primary" type="submit" className="btn btn-primary" disabled={busy || !dirty}>{busy ? '저장 중' : '저장'}</button>
        </div>
      </div>
    </form>
  )
}

const STATUS_LABEL: Record<PreviewRow['status'], string> = { same: '', changed: '변경', added: '추가', removed: '제외' }

function occurrenceLabel(row: WorkItem | null): string {
  return row ? `${timeSummary(row)}${row.repeat === 'none' ? ' · 이번만' : ''}` : '—'
}

function Preview({ rows, dirty, scope }: { rows: PreviewRow[]; dirty: boolean; scope: SeriesScope }) {
  const changed = rows.filter(row => row.status !== 'same').length
  return (
    <section aria-label="적용 미리보기" className="mt-4 border-t border-line pt-4">
      <p className="text-xs text-neutral-500">적용 미리보기 {dirty && <span className="text-neutral-400">· 다가오는 {rows.length}개 중 {changed}개 달라짐</span>}</p>
      {!dirty
        ? <p className="mt-2 text-xs text-neutral-400">내용을 바꾸면 적용 결과가 여기에 표시됩니다.</p>
        : rows.length === 0
          ? <p className="mt-2 text-xs text-neutral-400">{scope === 'all' ? '남는 반복 일정이 없습니다.' : '이후 반복 일정이 없습니다.'}</p>
          : <ul className="mt-2 divide-y divide-line rounded-md border border-line text-xs">
              {rows.map(row => <li key={row.date} data-status={row.status} className={`grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 ${row.status === 'same' ? 'text-neutral-400' : 'text-neutral-700'}`}>
                <span>{shortDay(row.date)}</span>
                <span className="min-w-0 truncate">
                  {row.status === 'same' ? occurrenceLabel(row.after)
                    : <><span className={row.status === 'added' ? '' : 'line-through text-neutral-400'}>{occurrenceLabel(row.before)}</span> → {row.status === 'removed' ? '없음' : <>{occurrenceLabel(row.after)}{row.after && row.before && row.after.title !== row.before.title ? ` · ${row.after.title}` : ''}</>}</>}
                </span>
                <span className={row.status === 'removed' ? 'text-red-600' : row.status === 'same' ? '' : 'text-accent-text'}>{STATUS_LABEL[row.status]}</span>
              </li>)}
            </ul>}
    </section>
  )
}
