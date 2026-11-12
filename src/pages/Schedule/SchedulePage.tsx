import { ArrowUp, ChevronRight, Plus } from 'lucide-react'
import { DeadlineBadge } from '../../components/tasks/DeadlineBadge.tsx'
import { PriorityBadge, PriorityField } from '../../components/tasks/Priority.tsx'
import { ExistingTaskPlanner } from '../../components/schedule/ExistingTaskPlanner.tsx'
import { DeadlineFields } from '../../components/tasks/DeadlineFields.tsx'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePlannerConflicts } from '../../features/ai/usePlannerConflicts.ts'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react'
import { GoogleOriginBadge } from '../../components/schedule/GoogleOriginBadge.tsx'
import { ScheduleTimeline } from '../../components/schedule/ScheduleTimeline.tsx'
import { CategoryPicker } from '../../components/schedule/CategoryPicker.tsx'
import { MiniCalendar } from '../../components/schedule/MiniCalendar.tsx'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { ExampleCard } from '../../features/onboarding/Example.tsx'
import { TaskCheckbox } from '../../components/tasks/TaskCheckbox.tsx'
import { IconView } from '../../constants/icons.ts'
import { ROUTES } from '../../constants/routes.ts'
import { LayoutBlock, PageCanvas } from '../../features/pages/PageCanvas.tsx'
import { resolveLayout, type PageBlock } from '../../features/pages/layout.ts'
import { analyzeSchedules, draftFromParsed, recordScheduleFeedback } from '../../services/schedule/index.ts'
import { requestedRule, reviewedWorkInput } from '../../features/ai/review.ts'
import { AnalysisReview } from '../../components/schedule/AnalysisReview.tsx'
import { RepeatPicker } from '../../components/schedule/RepeatPicker.tsx'
import { DraftSheet } from '../../components/schedule/DraftSheet.tsx'
import type { ScheduleAnalysis } from '@blanky/types'
import { taskNavKey } from '../../state/storage.ts'
import { useSaveAndClose } from '../../hooks/useSaveAndClose.ts'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { MobileSchedulePager } from './MobileSchedulePager.tsx'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { useCalendars } from '../../state/useCalendars.ts'
import { CalendarField, CalendarInfo } from '../../components/calendars/CalendarField.tsx'
import { MobileCalendarBar } from '../../components/calendars/MobileCalendarBar.tsx'
import { useSession } from '../../state/useSession.ts'
import type { TimelineDensity } from '../../types/records.ts'
import type { WorkItem, WorkspaceCategory } from '../../types/work.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { aiErrorText } from '../../features/ai/aiError.ts'
import { formatDisplayDate } from '../../i18n/format.ts'
import { shiftISO, todayISO } from '../../utils/date.ts'
import { selfCheckScheduleDraft, type ScheduleDraft } from '../../utils/scheduleDraft.ts'
import { categoryPath, createWorkItem, hourOf, occursOn, placedTimes } from '../../utils/work.ts'
import { dayAgenda, timelineRange } from '../../utils/scheduleTimeline.ts'
import { draftFromItem, eventDates, saveDraft, taskDates } from '../../utils/scheduleEdit.ts'
import { commitDraft, occurrenceDraft } from '../../features/schedule/occurrence.ts'
import { isRecurring, type SeriesScope } from '../../features/schedule/seriesEdit.ts'
import { repeatSummary } from '../../features/schedule/recurringList.ts'

selfCheckScheduleDraft()

/** Shown only while the account has no schedules yet; pressing one fills the input instead of saving it. */
const SCHEDULE_EXAMPLES = [
  { title: '팀 회의', meta: '일정 · 내일 15:00–16:00', input: '내일 오후 3시부터 4시까지 팀 회의' },
  { title: '과제 제출', meta: '할 일 · 금요일까지', input: '금요일까지 과제 제출하기' },
]

const SLOT: Record<TimelineDensity, number> = {
  compact: 32,
  default: 44,
  comfortable: 60,
}

function hourRange(start: string, end: string): string[] {
  let from = Number(start.slice(0, 2))
  let to = Number(end.slice(0, 2))
  if (!Number.isFinite(from)) from = 7
  if (!Number.isFinite(to)) to = 23
  if (to < from) [from, to] = [to, from]
  const hours: string[] = []
  for (let hour = from; hour <= to; hour += 1) hours.push(`${String(hour).padStart(2, '0')}:00`)
  return hours
}

export function DailyBoard({ editing = false }: { editing?: boolean }) {
  const { t, locale } = useI18n()
  const confirm = useConfirm()
  const library = useLibrary()
  const calendars = useCalendars()
  const items = useMemo(() => calendars.visible(library.items), [calendars, library.items])
  const { user } = useSession()
  const userId = user?.id ?? 'guest'
  const today = todayISO()
  const [selected, setSelected] = useState(today)
  const [navFor, setNavFor] = useState(userId)
  const [nav, setNav] = useState(() => readTaskNav(userId, library.settings.taskView === 'all'))
  if (userId !== navFor) {
    setNavFor(userId)
    setNav(readTaskNav(userId, library.settings.taskView === 'all'))
  } else if (nav.filter !== 'all' && !library.categories.some((category) => category.id === nav.filter && category.parentId === null)) {
    setNav((current) => (current.filter === 'all' ? current : { ...current, filter: 'all' }))
  }
  const { filter, showDone, open: openMap } = nav
  const [text, setText] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [prioritySort, setPrioritySort] = useState(false)
  const [draft, setDraft] = useState<ScheduleDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [analysis, setAnalysis] = useState<{ id: string; result: ScheduleAnalysis; input: string } | null>(null)
  const [analysisError, setAnalysisError] = useState('')
  const review = useSaveAndClose()
  const phone = useMediaQuery(PHONE_QUERY)
  const navigate = useNavigate()
  const location = useLocation()
  // On phones the editor is its own page with a history entry, so the system back gesture leaves it like any page.
  const here = `${location.pathname}${location.search}${location.hash}`
  const onDraftPage = (location.state as { scheduleDraft?: boolean } | null)?.scheduleDraft === true
  const draftPage = useRef<'pushing' | 'open' | null>(null)
  const draftStart = useRef('')
  const asking = useRef(false)

  const startDraft = (next: ScheduleDraft) => {
    review.setError('')
    draftStart.current = JSON.stringify(next)
    setDraft(next)
    if (phone && !draftPage.current) {
      draftPage.current = 'pushing'
      navigate(here, { state: { scheduleDraft: true } })
    }
  }
  const finishDraft = () => {
    setDraft(null)
    review.setError('')
    if (draftPage.current) {
      draftPage.current = null
      navigate(-1)
    }
  }
  const closeDraft = () => { if (!review.locked.current) finishDraft() }
  /** Phone back: asks before throwing away edits. */
  const leaveDraft = async () => {
    if (review.locked.current || asking.current || !draft) return
    if (JSON.stringify(draft) !== draftStart.current) {
      asking.current = true
      const discard = await confirm('입력 중인 내용을 삭제하고 나갈까요?', { title: '작성 취소', confirmLabel: '삭제' })
      asking.current = false
      if (!discard) return
    }
    finishDraft()
  }
  const leaveDraftRef = useRef(leaveDraft)
  useEffect(() => { leaveDraftRef.current = leaveDraft })

  useEffect(() => {
    if (onDraftPage) {
      if (draftPage.current === 'pushing') draftPage.current = 'open'
      // A leftover entry (reload, or back from a page opened inside the editor) carries no draft.
      else if (!draftPage.current && !draft) navigate(here, { replace: true, state: null })
      return
    }
    if (draftPage.current !== 'open') return
    // The browser left the editor page: stay on it while saving or until discarding edits is confirmed.
    draftPage.current = null
    if (!draft) return
    if (review.locked.current || JSON.stringify(draft) !== draftStart.current) {
      draftPage.current = 'pushing'
      navigate(here, { state: { scheduleDraft: true } })
      void leaveDraftRef.current()
    } else {
      setDraft(null)
    }
  }, [onDraftPage, draft, here, navigate, review.locked])

  const events = useMemo(() => eventDates(items), [items])
  const taskMarks = useMemo(() => taskDates(items), [items])

  const onDay = items.filter((item) => occursOn(item, selected))
  const agenda = dayAgenda(onDay, selected)
  const timed = agenda.timed
  const timeLines = timed.flatMap(item => {
    const range = timelineRange(item, selected)
    return range ? [{ item, ...range }] : []
  })
  const allTasks = items.filter((item) => item.kind === 'task' && (showDone || item.status !== 'done') && (priorityFilter === 'all' || item.priority === priorityFilter))
    .sort((a,b) => prioritySort ? ({high:0,medium:1,low:2}[a.priority] - {high:0,medium:1,low:2}[b.priority]) : 0)
  const hours = (() => {
    const ranged = hourRange(library.settings.dayStartTime, library.settings.dayEndTime)
    const extra = [
      ...timeLines.flatMap(({ start, end }) => Array.from({ length: Math.ceil(end / 60) - Math.floor(start / 60) }, (_, index) => `${String(Math.floor(start / 60) + index).padStart(2, '0')}:00`)),
      ...timed.flatMap(item => {
        const hour = item.startTime ? hourOf(item.startTime) : null
        return hour ? [hour] : []
      }),
    ]
    const sorted = [...new Set([...ranged, ...extra])].sort()
    return hourRange(sorted[0], sorted[sorted.length - 1])
  })()
  const slotHeight = SLOT[library.settings.timelineDensity]

  useEffect(() => {
    localStorage.setItem(taskNavKey(userId), JSON.stringify(nav))
  }, [userId, nav])

  const pickFilter = (id: string) => {
    const category = library.categories.find((item) => item.id === id)
    const parentId = category?.parentId ?? category?.id ?? null
    setNav((current) => ({
      ...current,
      filter: id,
      open: parentId ? { ...current.open, [parentId]: true } : current.open,
    }))
  }
  const toggleOpen = (id: string, next: boolean) => {
    setNav((current) => ({ ...current, open: { ...current.open, [id]: next } }))
  }
  const toggleDone = () => setNav((current) => ({ ...current, showDone: !current.showDone }))

  const open = (item: WorkItem) => startDraft(occurrenceDraft(draftFromItem(item), item, selected))

  // The editor closes only after the server confirms the save; a failure keeps the draft open.
  const saveReview = () => {
    if (!draft) return
    const saved = saveDraft(draft)
    if (!saved) return review.setError('제목과 날짜를 확인해 주세요.')
    const before = draft.id ? library.items.find(item => item.id === draft.id) ?? null : null
    if (draft.id && !before) return review.setError('삭제된 항목이에요.')
    void review.run((): Promise<unknown> | null => {
      if (before) return commitDraft(library.items, library.commitWork, before, { ...before, ...saved }, draft)
      const next = createWorkItem(saved)
      return next ? library.commitWork(null, next) : null
    }, () => {
      void recordScheduleFeedback(draft)
      finishDraft()
    })
  }
  const deleteDraft = draft?.id
    ? async () => {
        const before = library.items.find(item => item.id === draft.id)
        if (!before || !await confirm(deleteMessage(draft))) return
        void review.run(() => commitDraft(library.items, library.commitWork, before, null, draft), finishDraft)
      }
    : undefined
  const sheet = draft ? (
    <DraftSheet phone={phone} draft={draft} categories={library.categories} busy={review.busy} error={review.error}
      seriesHref={draft.id && draft.repeat && draft.repeat !== 'none' ? `${ROUTES.recurring}?id=${encodeURIComponent(draft.id)}&date=${draft.occurrence ?? selected}` : undefined}
      onChange={update => setDraft(current => current && update(current))} onSave={saveReview} onDelete={deleteDraft} onClose={phone ? () => void leaveDraft() : closeDraft} />
  ) : null

  const analyze = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setAnalysisError('')
    void analyzeSchedules(trimmed, library.categories, new Date())
      .then(async (result) => {
        if (library.settings.autoSaveAfterClassify && result.route === 'parser' && result.items.length === 1 && result.items[0].type !== 'task' && result.items[0].uncertainties.length === 0 && !result.items[0].id.startsWith('weekly-') && requestedRule(trimmed, result.items[0], true).repeat === 'none') {
          const entry = result.items[0]
          const input = reviewedWorkInput(entry, entry.draft, false, library.categories.map(category => category.id))
          const item = createWorkItem(input, { inferEndTime: false })
          if (!item || !await library.commitWork(null, item, 'ai_chat')) throw new Error('저장하지 못했어요. 다시 시도해 주세요.')
          void recordScheduleFeedback(draftFromParsed(entry, trimmed, selected, library.categories))
          setText('')
          finishDraft()
          setAnalysis(null)
          return
        }
        setText('')
        finishDraft()
        setAnalysis({ id: crypto.randomUUID(), result, input: trimmed })
      })
      .catch(error => setAnalysisError(aiErrorText(t, error, '분석하지 못했어요. 저장하지 않았으니 다시 시도해 주세요.')))
      .finally(() => setBusy(false))
  }

  const toggle = (id: string) => library.toggleItem(id, selected)

  const assignAt = (id: string, hour: string) => {
    const item = library.items.find((entry) => entry.id === id)
    if (!item) return
    const placed = placedTimes(
      { ...item, duration: item.duration ?? (item.kind === 'task' ? library.settings.taskDefaultDuration : library.settings.defaultEventMinutes) },
      hour,
    )
    library.updateItem(id, {
      date: selected,
      allDay: false,
      startTime: placed.startTime,
      endTime: placed.endTime,
      duration: placed.duration,
    })
  }

  const takeDrop = (event: DragEvent, hour: string) => {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain')
    if (id) assignAt(id, hour)
  }

  const blocks = resolveLayout('schedule', library.pageLayouts.schedule)
  const counts = new Map<string, number>()
  for (const item of onDay) {
    const id = item.categoryId ?? 'none'
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const renderBlock = (block: PageBlock) => {
    if (block.type === 'date-header') {
      return (
        <div data-theme-slot="page-header" className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-base font-medium tracking-tight">{formatDisplayDate(locale, selected)}</h1>
          {selected !== today ? (
            <button data-theme-slot="button" type="button" onClick={() => setSelected(today)} className="shrink-0 text-sm text-accent-text">
              {t('today')}
            </button>
          ) : null}
        </div>
      )
    }
    if (block.type === 'quick-input') {
      return (
        <div className="relative z-20">
          <form onSubmit={analyze} className="composer-line flex w-full items-center gap-2">
            <input data-theme-slot="input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              id="schedule-entry"
              placeholder="일정이나 할 일을 입력하세요"
              aria-label="일정 또는 할 일"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-300"
            />
            <span className="hidden shrink-0 text-xs text-neutral-400 md:inline">자동 분류</span>
            <button type="button" className="btn btn-ghost shrink-0" disabled={review.busy} onClick={() => { setAnalysis(null); startDraft(draftFromParsed({type:'event',source:'rule',confidence:1,draft:{title:'',date:selected,startTime:null,endTime:null,dueDate:null,endDate:null,categoryId:null}},'',selected,library.categories)) }}><Plus className="size-5 md:hidden" aria-hidden="true" /><span className="sr-only md:not-sr-only">직접 추가</span></button>
            <button data-theme-slot="button-primary" type="submit" className="btn btn-primary shrink-0 px-3" disabled={busy || !text.trim()}>
              <ArrowUp className="size-5 md:hidden" aria-hidden="true" /><span className="sr-only md:not-sr-only">{busy ? '분류' : '전송'}</span>
            </button>
          </form>
          {analysisError && <p role="alert" className="mt-2 text-sm text-red-600">{analysisError}</p>}
          {!library.items.length && !text && !draft && !analysis ? (
            <div className="example-list mt-3 sm:grid-cols-2">
              {SCHEDULE_EXAMPLES.map((example) => (
                <ExampleCard key={example.input} title={example.title} meta={example.meta} body={`“${example.input}”`} action="이렇게 입력해 보기"
                  onStart={() => { setText(example.input); document.getElementById('schedule-entry')?.focus() }} />
              ))}
            </div>
          ) : null}
          {analysis && <AnalysisReview onSaveAll={library.createWorkBatch} key={analysis.id} analysis={analysis.result} originalText={analysis.input} categories={library.categories} onClose={() => setAnalysis(null)} onSave={async input => {
            const item = createWorkItem(input, { inferEndTime: false })
            return item ? library.commitWork(null, item, 'ai_chat') : null
          }}/>}
        </div>
      )
    }
    if (block.type === 'timeline') {
      return (
        <div className="column-scroll">
          <p className="text-xs text-neutral-400">일정</p>
          {agenda.dateOnly.length > 0 ? (
            <section data-day-tasks={selected} aria-label="시간 미지정 할 일" className="mt-2">
              <p className="flex items-center justify-between text-xs text-neutral-500">
                <span>시간 미지정 할 일</span>
                <span className="tabular-nums text-neutral-400">{agenda.dateOnly.filter((item) => item.status === 'done').length}/{agenda.dateOnly.length} 완료</span>
              </p>
              <ul className="day-task-list mt-1.5">
                {agenda.dateOnly.map((item) => (
                  <DayTaskCard key={item.id} item={item} categories={library.categories} draggable={!editing} onOpen={open} onToggle={toggle} />
                ))}
              </ul>
            </section>
          ) : null}
          <ul className="mt-2">
            {agenda.allDay
              .map((item) => (
                <li key={item.id} className="border-t border-line py-2">
                  <PlanRow item={item} categories={library.categories} draggable={!editing} onOpen={open} onToggle={toggle} />
                </li>
              ))}
          </ul>
          <ScheduleTimeline items={timed} categories={library.categories} day={selected} hours={hours} hourHeight={slotHeight} editing={editing}
            onOpen={open} onToggle={toggle} onDropHour={takeDrop}
            onResize={(item, end) => {
              const start = Number(item.startTime!.slice(0, 2)) * 60 + Number(item.startTime!.slice(3, 5))
              library.updateItem(item.id, { endTime: end === 1440 ? '00:00' : `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`, duration: end - start, endDate: end === 1440 ? shiftISO(selected, 1) : item.endDate })
            }} />
        </div>
      )
    }
    if (block.type === 'task-list' || block.type === 'unscheduled' || block.type === 'completed') {
      const tasks =
        block.type === 'completed'
          ? items.filter((item) => item.kind === 'task' && item.status === 'done' && (priorityFilter === 'all' || item.priority === priorityFilter))
          : block.type === 'unscheduled'
            ? allTasks.filter((item) => !item.startTime)
            : allTasks
      return (
        <div className="column-scroll">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1 text-xs">우선순위 필터<select className="field priority-filter-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}><option value="all">전체</option><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option></select></label>
            <button type="button" className={prioritySort ? 'chip chip-on' : 'chip'} aria-pressed={prioritySort} onClick={() => setPrioritySort(!prioritySort)}>우선순위 정렬</button>
          </div>
          <TaskFolders
            prioritySort={prioritySort}
            tasks={tasks}
            categories={library.categories}
            selected={selected}
            filter={filter}
            openMap={openMap}
            showDone={block.type === 'completed' ? true : showDone}
            assignable={!editing && block.type !== 'completed'}
            heading={block.type === 'completed' ? '완료' : block.type === 'unscheduled' ? '시간 미배정' : '할 일'}
            onFilter={pickFilter}
            onToggleOpen={toggleOpen}
            onToggleDone={toggleDone}
            onOpen={open}
            onToggle={toggle}
            onAssign={(item) => {
              const next = draftFromItem(item)
              // A recurring task's date is its series anchor; don't move the whole series here.
              if (phone && (!item.repeat || item.repeat === 'none')) next.date = selected
              startDraft(next)
            }}
          />
        </div>
      )
    }
    if (block.type === 'calendar') {
      return (
        <MiniCalendar
          items={items}
          selected={selected}
          weekStartsOn={library.settings.weekStartsOn}
          events={events}
          tasks={taskMarks}
          view={library.settings.calendarView}
          categories={library.categories}
          onSelect={setSelected}
          onOpen={editing ? undefined : open}
        />
      )
    }
    if (block.type === 'category-summary') {
      return (
        <div>
          <p className="text-xs text-neutral-400">카테고리</p>
          <ul className="mt-2 space-y-1">
            {[...counts.entries()].map(([id, count]) => (
              <li key={id} className="flex justify-between text-sm">
                <span>{id === 'none' ? '미분류' : library.categories.find((category) => category.id === id)?.name ?? id}</span>
                <span className="text-neutral-400">{count}</span>
              </li>
            ))}
            {counts.size === 0 ? <li className="text-sm text-neutral-400">이 날의 항목이 없습니다.</li> : null}
          </ul>
        </div>
      )
    }
    return null
  }

  // The calendar stays visible on phones while the panes underneath swipe.
  if (phone && !editing) {
    const shown = blocks.filter((block) => !block.hidden)
    const of = (types: PageBlock['type'][]) => shown.filter((block) => types.includes(block.type))
    const pane = (list: PageBlock[]) => list.map((block) => isLayoutBlock(block.type)
      ? <div key={block.id} className="min-w-0"><LayoutBlock block={block} /></div>
      : <div key={block.id} className="panel min-w-0">{renderBlock(block)}</div>)
    const header = of(['date-header', 'quick-input'])
    const openTasks = items.filter((item) => item.kind === 'task' && item.status !== 'done').length
    return (
      <div className="schedule-mobile" data-schedule-mobile>
        <div className="schedule-mobile-head">
          {isSupabaseConfigured ? <MobileCalendarBar /> : null}
          {header.map((block) => <div key={block.id} className="min-w-0">{renderBlock(block)}</div>)}
        </div>
        <div className="schedule-mobile-calendar">{pane(of(['calendar']))}</div>
        <MobileSchedulePager panes={[
          { id: 'timeline', label: '일정', badge: onDay.filter((item) => item.kind === 'event').length, content: pane(of(['timeline', 'category-summary'])) },
          { id: 'tasks', label: '할 일', badge: openTasks, content: pane(of(['task-list', 'unscheduled', 'completed'])) },
        ]} />
        {pane(shown.filter((block) => isLayoutBlock(block.type)))}
        {sheet}
      </div>
    )
  }

  return (
    <>
    <PageCanvas
      pageId="schedule"
      editing={editing}
      blocks={blocks}
      onChange={(next) => library.setPageLayout('schedule', next)}
      render={renderBlock}
    />
    {sheet}
    </>
  )
}

/** Free-form heading/text blocks; on phones they follow the calendar. */
function isLayoutBlock(type: PageBlock['type']): boolean {
  return !['date-header', 'quick-input', 'timeline', 'task-list', 'unscheduled', 'completed', 'calendar', 'category-summary'].includes(type)
}

export function SchedulePage() {
  const { t } = useI18n()
  const library=useLibrary(),{conflicts,error}=usePlannerConflicts(library.items)
  return <div className="flex min-h-0 flex-none flex-col md:flex-1">{(conflicts.length>0||error)&&<div role="status" className="mx-6 mt-4 rounded-md border border-line bg-surface p-3 text-sm text-blue-600">{error||t('schedule.conflicts', { count: conflicts.length })}<Link className="ml-2 underline" to="/">{t('schedule.replanHome')}</Link></div>}<DailyBoard /></div>
}

const SCOPES: { value: SeriesScope; label: string }[] = [
  { value: 'this', label: '이번만' },
  { value: 'future', label: '이후 전체' },
  { value: 'all', label: '전체' },
]

function deleteMessage(draft: ScheduleDraft): string {
  const title = draft.title || '이 항목'
  if (!draft.occurrence) return `${title}을 삭제할까요? 휴지통에서 복구할 수 있습니다.`
  if (draft.scope === 'future') return `${title}의 ${draft.occurrence}부터 이후 반복을 삭제할까요? 이전 반복은 남습니다.`
  if (draft.scope === 'all') return `${title}의 반복 전체를 삭제할까요? 휴지통에서 복구할 수 있습니다.`
  return `${title}의 ${draft.occurrence} 하루만 삭제할까요? 나머지 반복은 그대로 둡니다.`
}

type TaskNav = { filter: string; showDone: boolean; open: Record<string, boolean> }

type TaskSection = {
  id: string
  label: string
  icon: string | null
  color: string | null
  tasks: WorkItem[]
}

type TaskGroup = {
  id: string
  label: string
  icon: string | null
  color: string | null
  sections: TaskSection[]
}

function readTaskNav(userId: string, showDone: boolean): TaskNav {
  try {
    const raw = localStorage.getItem(taskNavKey(userId))
    if (!raw) return { filter: 'all', showDone, open: {} }
    const data = JSON.parse(raw) as Partial<TaskNav>
    const open: Record<string, boolean> = {}
    if (data.open && typeof data.open === 'object') {
      for (const [id, value] of Object.entries(data.open)) if (typeof value === 'boolean') open[id] = value
    }
    return {
      filter: typeof data.filter === 'string' ? data.filter : 'all',
      showDone: typeof data.showDone === 'boolean' ? data.showDone : showDone,
      open,
    }
  } catch {
    return { filter: 'all', showDone, open: {} }
  }
}

function scopeTasks<T extends { categoryId: string | null }>(
  tasks: T[],
  categories: { id: string; parentId: string | null }[],
  filterId: string,
): T[] {
  if (filterId === 'all') return tasks
  const selected = categories.find((category) => category.id === filterId)
  if (!selected) return tasks
  const ids = new Set<string>([selected.id])
  if (!selected.parentId) {
    for (const child of categories) if (child.parentId === selected.id) ids.add(child.id)
  }
  return tasks.filter((task) => task.categoryId !== null && ids.has(task.categoryId))
}

function holdsDay(
  groupId: string,
  tasks: { categoryId: string | null; date: string; undated?: boolean }[],
  categories: { id: string; parentId: string | null }[],
  day: string,
): boolean {
  const ids = new Set<string>([groupId])
  for (const child of categories) if (child.parentId === groupId) ids.add(child.id)
  return tasks.some((task) => !task.undated && task.date === day && task.categoryId !== null && ids.has(task.categoryId))
}

function groupTasks(tasks: WorkItem[], categories: WorkspaceCategory[], prioritySort = false): TaskGroup[] {
  const byDate = (left: WorkItem, right: WorkItem) => (prioritySort ? ({high:0,medium:1,low:2}[left.priority] - {high:0,medium:1,low:2}[right.priority]) : 0) || left.date.localeCompare(right.date) || left.title.localeCompare(right.title, 'ko')
  const used = new Set<string>()
  const take = (id: string | null) => {
    const list = tasks.filter((task) => (task.categoryId ?? null) === id).sort(byDate)
    for (const task of list) used.add(task.id)
    return list
  }
  const groups: TaskGroup[] = []
  for (const parent of categories.filter((category) => category.parentId === null)) {
    const own = take(parent.id)
    const children = categories
      .filter((category) => category.parentId === parent.id)
      .map((child) => ({
        id: child.id,
        label: child.name,
        icon: child.icon ?? null,
        color: child.color ?? null,
        tasks: take(child.id),
      }))
      .filter((child) => child.tasks.length > 0)
    const sections: TaskSection[] = [
      ...(own.length ? [{ id: `${parent.id}:own`, label: '', icon: null, color: null, tasks: own }] : []),
      ...children,
    ]
    if (sections.length === 0) continue
    groups.push({ id: parent.id, label: parent.name, icon: parent.icon ?? null, color: parent.color ?? null, sections })
  }
  const loose = tasks.filter((task) => !used.has(task.id)).sort(byDate)
  if (loose.length > 0) {
    groups.push({
      id: 'none',
      label: '미분류',
      icon: 'Tag',
      color: null,
      sections: [{ id: 'none:own', label: '', icon: null, color: null, tasks: loose }],
    })
  }
  return groups
}

function selfCheckTaskGroups() {
  const categories = [
    { id: 'a', name: 'A', parentId: null },
    { id: 'a1', name: 'A1', parentId: 'a' },
    { id: 'b', name: 'B', parentId: null },
  ]
  const tasks = [
    { id: '1', categoryId: 'a1', date: '2026-10-02', title: 'child' },
    { id: '2', categoryId: null, date: '2026-10-01', title: 'loose' },
    { id: '3', categoryId: 'a', date: '2026-10-03', title: 'parent' },
  ]
  const groups = groupTasks(tasks as WorkItem[], categories)
  if (groups.length !== 2 || groups[0]?.sections.length !== 2 || groups[1]?.label !== '미분류') {
    throw new Error('task folders')
  }
  if (scopeTasks(tasks, categories, 'a').length !== 2) throw new Error('scope area')
  if (scopeTasks([{ categoryId: 'blanky' }, { categoryId: 'stockmate' }], [{ id: 'project', parentId: null }, { id: 'blanky', parentId: 'project' }, { id: 'stockmate', parentId: 'project' }], 'blanky').length !== 1) {
    throw new Error('scope project')
  }
  if (!holdsDay('a', tasks, categories, '2026-10-02')) throw new Error('holds day')
}

selfCheckTaskGroups()

function spanLabel(item: WorkItem): string {
  if (item.startTime && item.endTime) return `${item.startTime}–${item.endTime}`
  if (item.startTime) return item.startTime
  if (item.kind === 'event') return '종일'
  return '시간 미배정'
}

function PlanRow({
  item,
  categories,
  draggable,
  onOpen,
  onToggle,
  timeline = false,
  rowHeight,
}: {
  item: WorkItem
  categories: { id: string; name: string; parentId: string | null; color?: string | null }[]
  draggable: boolean
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
  timeline?: boolean
  rowHeight?: number
}) {
  const path = categoryPath(item.categoryId, categories)
  const color = item.calendarColor || categories.find(category => category.id === item.categoryId)?.color
  const done = item.status === 'done'
  return (
    <div data-theme-slot={item.kind === 'event' ? 'schedule-card' : 'task-card'} className={item.kind === 'event' ? 'theme-plan flex items-start gap-3 p-2 my-1' : 'theme-task flex items-start gap-3'} style={item.kind === 'event' ? { borderLeftColor: color || 'var(--accent-color)', borderLeftWidth: 3 } : undefined}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', item.id)
        event.dataTransfer.effectAllowed = 'move'
        event.currentTarget.classList.add('block-lift')
      }}
      onDragEnd={(event) => event.currentTarget.classList.remove('block-lift')}
    >
      {item.kind === 'task' ? (
        <span className="mt-0.5">
          <TaskCheckbox checked={done} label={`${item.title} 완료`} onChange={() => onToggle(item.id)} />
        </span>
      ) : null}
      <button data-theme-slot="button" type="button" style={rowHeight ? { height: `min(100%, ${rowHeight}px)` } : undefined} title={`${item.title} · ${spanLabel(item)}${path ? ` · ${path}` : ''}`} draggable={draggable} onClick={() => onOpen(item)} className={draggable ? "min-w-0 flex-1 cursor-grab select-none py-0.5 text-left active:cursor-grabbing" : "min-w-0 flex-1 py-0.5 text-left"}>
        <span data-theme-slot="schedule-title" className={done ? 'block text-sm text-neutral-400 line-through' : 'block text-sm text-neutral-900'}>
          {item.title}
          <GoogleOriginBadge item={item} />
        </span>
        <span data-theme-slot="schedule-time" className="mt-1 block text-xs text-neutral-400">
          {spanLabel(item)}
          {!timeline && (item.kind === 'event' ? ' · 일정' : ' · 할 일')}
          {!timeline && item.endDate ? ` · ${item.date}–${item.endDate}` : ''}
          {!timeline && path ? ` · ${path}` : ''}
        </span>
        <DeadlineBadge item={item}/>
      </button>
    </div>
  )
}

/** Category color with parent fallback, as the month calendar uses. */
function categoryColor(item: WorkItem, categories: WorkspaceCategory[]): string {
  const category = categories.find((entry) => entry.id === item.categoryId)
  const parent = category?.parentId ? categories.find((entry) => entry.id === category.parentId) : undefined
  return item.calendarColor || category?.color || parent?.color || 'var(--accent-color)'
}

/** A task with a date but no time: a compact card above the timeline, tinted with its category color. */
function DayTaskCard({
  item,
  categories,
  draggable,
  onOpen,
  onToggle,
}: {
  item: WorkItem
  categories: WorkspaceCategory[]
  draggable: boolean
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
}) {
  const color = categoryColor(item, categories)
  const path = categoryPath(item.categoryId, categories)
  const done = item.status === 'done'
  return (
    <li data-day-task={item.id} data-theme-slot="task-card" className={`day-task-card theme-task${done ? ' day-task-done' : ''}`} style={{ '--cal-color': color } as CSSProperties}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', item.id)
        event.dataTransfer.effectAllowed = 'move'
        event.currentTarget.classList.add('block-lift')
      }}
      onDragEnd={(event) => event.currentTarget.classList.remove('block-lift')}
    >
      <span className="mt-0.5">
        <TaskCheckbox checked={done} label={`${item.title} 완료`} onChange={() => onToggle(item.id)} />
      </span>
      <button data-theme-slot="button" type="button" title={`${item.title} · 시간 미지정${path ? ` · ${path}` : ''}`} onClick={() => onOpen(item)} className={draggable ? 'min-w-0 flex-1 cursor-grab select-none text-left active:cursor-grabbing' : 'min-w-0 flex-1 text-left'}>
        <span data-theme-slot="schedule-title" className="day-task-title">
          {item.title}
          <GoogleOriginBadge item={item} />
        </span>
        <span className="day-task-meta">
          <PriorityBadge value={item.priority} completed={done} />
          {path ? <span className="min-w-0 truncate">{path}</span> : null}
        </span>
        <DeadlineBadge item={item} />
      </button>
    </li>
  )
}

function CategoryMark({ icon, color, compact }: { icon?: string | null; color?: string | null; compact?: boolean }) {
  const tint = color || '#737373'
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <IconView name={icon} className={compact ? 'size-3' : 'size-3.5'} style={{ color: tint }} />
    </span>
  )
}

function TaskFolders({
  prioritySort,
  tasks,
  categories,
  selected,
  filter,
  openMap,
  showDone,
  assignable,
  heading,
  onFilter,
  onToggleOpen,
  onToggleDone,
  onOpen,
  onToggle,
  onAssign,
}: {
  prioritySort: boolean
  tasks: WorkItem[]
  categories: WorkspaceCategory[]
  selected: string
  filter: string
  openMap: Record<string, boolean>
  showDone: boolean
  assignable: boolean
  heading: string
  onFilter: (id: string) => void
  onToggleOpen: (id: string, next: boolean) => void
  onToggleDone: () => void
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
  onAssign: (item: WorkItem) => void
}) {
  const { t } = useI18n()
  const areas = categories.filter((category) => category.parentId === null)
  const options = [{ id: 'all', name: '전체' }, ...areas]
  const many = areas.length > 5
  const visible = scopeTasks(tasks, categories, filter)
  const groups = groupTasks(visible, categories, prioritySort)

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-400">{heading}</p>
        <button data-theme-slot="button" type="button" aria-pressed={showDone} onClick={onToggleDone} className={showDone ? 'chip chip-on' : 'chip'}>
          완료 보기
        </button>
      </div>
      {many ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
          범위
          <select data-theme-slot="input"
            aria-label="할 일 범위"
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            className="field min-w-0 flex-1 py-1 text-xs"
          >
            <option value="all">전체</option>
            {areas.length > 0 ? (
              <optgroup label="카테고리">
                {areas.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
      ) : (
        <div role="group" aria-label="할 일 범위" className="mt-3 flex flex-wrap gap-1">
          {options.map((option) => {
            const tint = 'color' in option ? option.color : null
            return (
              <button data-theme-slot="button"
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => onFilter(option.id)}
                className={filter === option.id ? 'chip chip-on' : 'chip'}
              >
                {tint ? <span className="mr-1 inline-block size-1.5 rounded-full align-middle" style={{ backgroundColor: tint }} /> : null}
                {option.name}
              </button>
            )
          })}
        </div>
      )}
      {tasks.length === 0 ? (
        <EmptyState>{t('schedule.emptyTasks')}</EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState>{t('schedule.emptyRange')}</EmptyState>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((group) => {
            const expanded = group.id in openMap ? openMap[group.id] : holdsDay(group.id, visible, categories, selected)
            return (
              <section key={group.id}>
                <button data-theme-slot="button"
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`tasks-${group.id}`}
                  onClick={() => onToggleOpen(group.id, !expanded)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left hover:bg-hover"
                >
                  <ChevronRight size={14} strokeWidth={1.5} className="chevron shrink-0 inline-flex text-neutral-400" style={{ transform: expanded ? 'rotate(90deg)' : undefined }} aria-hidden="true" />
                  <CategoryMark icon={group.icon} color={group.color} />
                  <span className="min-w-0 truncate text-sm font-medium text-neutral-800">{group.label}</span>
                </button>
                <div id={`tasks-${group.id}`} className="fold" style={{ gridTemplateRows: expanded ? '1fr' : '0fr', opacity: expanded ? 1 : 0 }}>
                  <div>
                    {group.sections.map((section) => (
                      <div key={section.id} className="mt-3 pl-5">
                        {section.label ? (
                          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                            <CategoryMark icon={section.icon} color={section.color} compact />
                            <span className="min-w-0 truncate">{section.label}</span>
                          </p>
                        ) : null}
                        <ul className={section.label ? 'mt-1 space-y-1.5' : 'space-y-1.5'}>
                          {section.tasks.map((item) => (
                            <TaskRow key={item.id} item={item} color={occursOn(item, selected) ? categoryColor(item, categories) : null} assignable={assignable} onOpen={onOpen} onToggle={onToggle} onAssign={onAssign} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  item,
  color,
  assignable,
  onOpen,
  onToggle,
  onAssign,
}: {
  item: WorkItem
  /** Set only for tasks on the selected day, which get the category tint. */
  color: string | null
  assignable: boolean
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
  onAssign: (item: WorkItem) => void
}) {
  const done = item.status === 'done'
  return (
    <li
      data-task-row={item.id} data-theme-slot="task-card" className={color ? `task-tint-card theme-task${done ? ' day-task-done' : ''}` : 'theme-task flex items-start gap-2 rounded-md py-2 transition-colors duration-150'} style={color ? { '--cal-color': color } as CSSProperties : undefined}
      draggable={assignable}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', item.id)
        event.dataTransfer.effectAllowed = 'move'
        event.currentTarget.classList.add('block-lift')
      }}
      onDragEnd={(event) => event.currentTarget.classList.remove('block-lift')}
    >
      <span className="mt-0.5">
        <TaskCheckbox checked={done} label={`${item.title} 완료`} onChange={() => onToggle(item.id)} />
      </span>
      <div className="min-w-0 flex-1">
        <button data-theme-slot="button" type="button" draggable={assignable} onClick={() => onOpen(item)} className={assignable ? "block w-full cursor-grab select-none text-left active:cursor-grabbing" : "block w-full text-left"}>
          <span className={done ? 'block truncate text-sm text-neutral-400 line-through' : 'block truncate text-sm font-medium text-neutral-900'}>
            {item.title}
            <GoogleOriginBadge item={item} />
          </span>
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs text-neutral-400">
            {item.undated ? '날짜 없음' : isRecurring(item) ? `${repeatSummary(item)} · ${item.date.slice(5).replace('-', '/')}부터` : item.date.slice(5).replace('-', '/')} · {spanLabel(item)}
          </span>
          {assignable && !done && !item.startTime && <ExistingTaskPlanner task={item}/>}
          <PriorityBadge value={item.priority} completed={done}/><DeadlineBadge item={item}/>
          {assignable && !done && !item.startTime ? (
            <button data-theme-slot="button" type="button" onClick={() => onAssign(item)} className="rounded-md px-1.5 py-0.5 text-xs text-accent-text hover:bg-accent-light">
              시간 배정
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export function DraftEditor({
  draft,
  categories,
  onChange,
  onCancel,
  onSave,
  onDelete,
  seriesHref,
  formId,
  bare = false,
}: {
  draft: ScheduleDraft
  seriesHref?: string
  categories: { id: string; name: string; parentId: string | null; color?: string | null }[]
  onChange: (update: (draft: ScheduleDraft) => ScheduleDraft) => void
  onCancel: () => void
  onSave: () => void
  onDelete?: () => void
  /** Lets a header button outside the form submit it through the same validation. */
  formId?: string
  /** Only the delete action; the surrounding page supplies save and close. */
  bare?: boolean
}) {
  // Applied as updates: one control may report several fields in a row (RepeatPicker sends the rule, then the interval).
  const set = (patch: Partial<ScheduleDraft>) => onChange(current => ({ ...current, ...patch, ...('startTime' in patch || 'endTime' in patch ? { duration: '' } : {}) }))
  const { addCategory, items } = useLibrary()
  const { canEdit } = useCalendars()
  const saved = draft.id ? items.find(item => item.id === draft.id) : undefined
  const locked = Boolean(saved && !canEdit(saved))
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const task = draft.kind === 'task'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim()) {
      setError('제목을 입력해 주세요.')
      titleRef.current?.focus()
      return
    }
    if (locked) return
    setError('')
    onSave()
  }

  return (
    <form id={formId} onSubmit={submit} className={bare ? 'px-4 py-4' : 'mt-4 rounded-md border border-line px-4 py-4'}>
      {saved ? <CalendarInfo item={saved} /> : null}
      <fieldset disabled={locked} className="min-w-0">
      <div className={saved ? 'mt-3 flex gap-1' : 'flex gap-1'}>
        <button data-theme-slot="button" type="button" onClick={() => set({ kind: 'event' })} className={task ? 'chip' : 'chip chip-on'}>
          일정
        </button>
        <button data-theme-slot="button" type="button" onClick={() => set({ kind: 'task' })} className={task ? 'chip chip-on' : 'chip'}>
          할 일
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {!saved || saved.calendarType !== 'external' ? <div className="sm:col-span-2"><CalendarField value={draft.calendarId} onChange={calendarId => set({ calendarId })} /></div> : null}
        <label className="sm:col-span-2 text-xs text-neutral-500">
          제목
          <input data-theme-slot="input" ref={titleRef} value={draft.title} onChange={(event) => { set({ title: event.target.value }); if (error) setError('') }} className="field mt-1 w-full" enterKeyHint="done" />
        </label>
        <label className="text-xs text-neutral-500">
          {task ? '날짜' : '시작 날짜'}
          <input data-theme-slot="input" type="date" value={draft.date} onChange={(event) => set({ date: event.target.value })} className="field mt-1 w-full" />
          {task && !draft.date && !draft.dueDate && <span className="mt-1 block">비워 두면 날짜 없는 할 일로 저장합니다.</span>}
        </label>
        {task ? (
          <div className="sm:col-span-2"><DeadlineFields date={draft.dueDate} time={draft.dueTime ?? ''} onChange={(date, time) => set({ dueDate: date, dueTime: time })}/></div>
        ) : (
          <label className="text-xs text-neutral-500">
            종료 날짜
            <input data-theme-slot="input" type="date" value={draft.endDate} onChange={(event) => set({ endDate: event.target.value })} className="field mt-1 w-full" />
          </label>
        )}
        {!task ? (
          <div className="sm:col-span-2 text-xs text-neutral-500">
            시간
            <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="시간">
              <button data-theme-slot="button" type="button" role="radio" className={draft.startTime ? 'field choice-on text-center' : 'field text-center text-neutral-400'} aria-checked={Boolean(draft.startTime)} onClick={() => { if (!draft.startTime) set({ startTime: '09:00', endTime: '10:00' }) }}>시각</button>
              <button data-theme-slot="button" type="button" role="radio" className={!draft.startTime ? 'field choice-on text-center' : 'field text-center text-neutral-400'} aria-checked={!draft.startTime} onClick={() => set({ startTime: '', endTime: '' })}>종일</button>
            </div>
          </div>
        ) : null}
        {task || draft.startTime ? (
          <>
            <label className="text-xs text-neutral-500">
              {task ? '시간' : '시작'}
              <input data-theme-slot="input" type="time" value={draft.startTime} onChange={(event) => set({ startTime: event.target.value })} className="field mt-1 w-full" />
            </label>
            <label className="text-xs text-neutral-500">
              {task ? '종료 시간' : '종료'}
              <input data-theme-slot="input" type="time" value={draft.endTime} onChange={(event) => set({ endTime: event.target.value })} className="field mt-1 w-full" />
            </label>
          </>
        ) : null}
        {task ? (
          <label className="text-xs text-neutral-500">
            예상 소요 (분)
            <input data-theme-slot="input"
              inputMode="numeric"
              value={draft.duration}
              onChange={(event) => set({ duration: event.target.value })}
              className="field mt-1 w-full"
            />
          </label>
        ) : null}
        {task && <PriorityField value={draft.priority ?? 'medium'} onChange={priority => set({priority})}/>}
        <div className="text-xs text-neutral-500">
          카테고리
          <div className="mt-2">
            <CategoryPicker categories={categories} value={draft.categoryId} onChange={(categoryId) => set({ categoryId })} onCreate={(name) => addCategory(name, null)} />
          </div>
        </div>
        {task ? (
          <div className="flex items-center gap-2 text-sm text-neutral-700">
            <TaskCheckbox
              checked={draft.status === 'done'}
              label="완료"
              onChange={() => set({ status: draft.status === 'done' ? 'todo' : 'done' })}
            />
            완료
          </div>
        ) : null}
        <label className="sm:col-span-2 text-xs text-neutral-500">
          설명
          <textarea data-theme-slot="input" value={draft.description} onChange={(event) => set({ description: event.target.value })} className="field mt-1 min-h-16 w-full resize-y" />
        </label>
        {draft.occurrence ? (
          <div className="sm:col-span-2 text-xs text-neutral-500" data-series-scope>
            적용 범위 · {draft.occurrence}
            <div className="mt-1 grid grid-cols-3 gap-2" role="radiogroup" aria-label="적용 범위">
              {SCOPES.map(option => <button key={option.value} data-theme-slot="button" type="button" role="radio" aria-checked={(draft.scope ?? 'this') === option.value}
                className={(draft.scope ?? 'this') === option.value ? 'field choice-on text-center' : 'field text-center text-neutral-400'}
                onClick={() => set({ scope: option.value })}>{option.label}</button>)}
            </div>
            <p className="mt-1">저장·삭제·완료가 {draft.scope === 'future' ? '이 날짜부터 이후 반복에' : draft.scope === 'all' ? '지난 반복을 포함한 전체에' : '이 날짜 하나에만'} 적용됩니다.</p>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <fieldset disabled={draft.occurrence !== undefined && (draft.scope ?? 'this') === 'this'} className={draft.occurrence !== undefined && (draft.scope ?? 'this') === 'this' ? 'opacity-50' : ''}>
            <RepeatPicker repeat={draft.repeat ?? 'none'} days={draft.repeatDays} date={draft.date} interval={draft.repeatInterval ?? 1} until={draft.repeatUntil ?? ''}
              hint={draft.occurrence && (draft.scope ?? 'this') === 'this' ? '이번만 바꿀 때는 반복 규칙을 바꿀 수 없습니다.' : undefined}
              onChange={(repeat, repeatDays) => set({ repeat, repeatDays })} onIntervalChange={repeatInterval => set({ repeatInterval })} onUntilChange={repeatUntil => set({ repeatUntil })} />
          </fieldset>
        </div>
        {seriesHref && <Link to={seriesHref} className="sm:col-span-2 text-xs text-accent-text underline">반복 일정 관리에서 미리보기와 함께 수정하기</Link>}
      </div>
      </fieldset>
      {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
      {locked ? null : bare ? (
        onDelete ? (
          <div className="mt-3">
            <button data-theme-slot="button" type="button" onClick={onDelete} className="btn btn-ghost">
              삭제
            </button>
          </div>
        ) : null
      ) : (
        <div className="mt-4 flex items-center justify-between">
          <button data-theme-slot="button" type="button" onClick={onCancel} className="btn btn-ghost">
            취소
          </button>
          <div className="flex gap-2">
            {onDelete ? (
              <button data-theme-slot="button" type="button" onClick={onDelete} className="btn btn-ghost">
                삭제
              </button>
            ) : null}
            <button data-theme-slot="button-primary" type="submit" className="btn btn-primary">
              저장
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
