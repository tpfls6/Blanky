import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react'
import { CategoryPicker } from '../../components/schedule/CategoryPicker.tsx'
import { MiniCalendar } from '../../components/schedule/MiniCalendar.tsx'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { TaskCheckbox } from '../../components/tasks/TaskCheckbox.tsx'
import { IconView } from '../../constants/icons.ts'
import { PageCanvas } from '../../features/pages/PageCanvas.tsx'
import { resolveLayout, type PageBlock } from '../../features/pages/layout.ts'
import { classifySchedule, recordScheduleFeedback } from '../../services/schedule/index.ts'
import { taskNavKey } from '../../state/storage.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import type { TimelineDensity } from '../../types/records.ts'
import type { WorkItem, WorkspaceCategory } from '../../types/work.ts'
import { koreanLongDate, shiftISO, todayISO } from '../../utils/date.ts'
import { selfCheckScheduleDraft, type ScheduleDraft } from '../../utils/scheduleDraft.ts'
import { categoryPath, createWorkItem, hourOf, occursOn, placedTimes } from '../../utils/work.ts'

selfCheckScheduleDraft()

const SLOT: Record<TimelineDensity, string> = {
  compact: 'slot-compact',
  default: 'slot-default',
  comfortable: 'slot-comfortable',
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

function eventDates(items: WorkItem[]): Set<string> {
  const dates = new Set<string>()
  for (const item of items) {
    if (item.kind !== 'event') continue
    let date = item.date
    const end = item.endDate && item.endDate >= item.date ? item.endDate : item.date
    dates.add(date)
    while (date < end) {
      date = shiftISO(date, 1)
      dates.add(date)
    }
  }
  return dates
}

function taskDates(items: WorkItem[]): Set<string> {
  const dates = new Set<string>()
  for (const item of items) {
    if (item.kind !== 'task') continue
    dates.add(item.date)
    if (item.dueDate) dates.add(item.dueDate)
  }
  return dates
}

function draftFromItem(item: WorkItem): ScheduleDraft {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    date: item.date,
    endDate: item.endDate ?? '',
    startTime: item.startTime ?? '',
    endTime: item.endTime ?? '',
    duration: item.duration ? String(item.duration) : '',
    dueDate: item.dueDate ?? '',
    categoryId: item.categoryId,
    description: item.description,
    status: item.status,
  }
}

function byTime(left: WorkItem, right: WorkItem): number {
  return (left.startTime ?? '').localeCompare(right.startTime ?? '')
}

export function DailyBoard({ editing = false }: { editing?: boolean }) {
  const library = useLibrary()
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
  const [draft, setDraft] = useState<ScheduleDraft | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [overHour, setOverHour] = useState<string | null>(null)
  const draftOpen = draft !== null

  useEffect(() => {
    if (!draftOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      event.preventDefault()
      setDraft(null)
      setReviewOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [draftOpen])

  const events = useMemo(() => eventDates(library.items), [library.items])
  const taskMarks = useMemo(() => taskDates(library.items), [library.items])

  const onDay = library.items.filter((item) => occursOn(item, selected))
  const timed = onDay.filter((item) => item.kind === 'event' || item.startTime).sort(byTime)
  const allTasks = library.items.filter((item) => item.kind === 'task' && (showDone || item.status !== 'done'))
  const hours = useMemo(() => {
    const ranged = hourRange(library.settings.dayStartTime, library.settings.dayEndTime)
    const extra = timed.flatMap((item) => {
      const hour = item.startTime ? hourOf(item.startTime) : null
      return hour ? [hour] : []
    })
    return [...new Set([...ranged, ...extra])].sort()
  }, [library.settings.dayStartTime, library.settings.dayEndTime, timed])
  const slotClass = SLOT[library.settings.timelineDensity]

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

  const open = (item: WorkItem) => {
    setDraft(draftFromItem(item))
    setReviewOpen(true)
  }

  const analyze = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    void classifySchedule(trimmed, selected, library.categories, new Date())
      .then((next) => {
        setText('')
        if (library.settings.autoSaveAfterClassify) {
          const saved = saveDraft(next)
          if (saved) library.addItem(saved)
          void recordScheduleFeedback(next)
          setDraft(null)
          setReviewOpen(false)
          return
        }
        setDraft(next)
        setReviewOpen(false)
      })
      .finally(() => setBusy(false))
  }

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
    setOverHour(null)
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
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-base font-medium tracking-tight">{koreanLongDate(selected)}</h1>
          {selected !== today ? (
            <button data-theme-slot="button" type="button" onClick={() => setSelected(today)} className="shrink-0 text-sm text-accent-text">
              오늘
            </button>
          ) : null}
        </div>
      )
    }
    if (block.type === 'quick-input') {
      const saveReview = () => {
        if (!draft) return
        const saved = saveDraft(draft)
        if (!saved) return
        if (draft.id) library.updateItem(draft.id, saved)
        else library.addItem(saved)
        void recordScheduleFeedback(draft)
        setDraft(null)
        setReviewOpen(false)
      }
      return (
        <div className="relative z-20">
          <form onSubmit={analyze} className="composer-line flex w-full items-center gap-2">
            <input data-theme-slot="input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="일정이나 할 일을 입력하세요"
              aria-label="일정 또는 할 일"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-300"
            />
            <span className="shrink-0 text-xs text-neutral-400">자동 분류</span>
            <button data-theme-slot="button-primary" type="submit" className="btn btn-primary shrink-0 px-3" disabled={busy || !text.trim()}>
              {busy ? '분류' : '전송'}
            </button>
          </form>
          {draft ? (
            <div className="absolute top-full right-0 z-30 mt-1 w-full max-w-xl rounded-md border border-line bg-surface shadow-lg">
              <div className="flex items-center gap-2 px-3 py-2">
                <button data-theme-slot="button"
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                  aria-expanded={reviewOpen}
                  onClick={() => setReviewOpen((value) => !value)}
                >
                  <span className="chevron inline-block text-neutral-400" style={{ transform: reviewOpen ? 'rotate(90deg)' : undefined }}>
                    ›
                  </span>
                  <span className="truncate">{reviewLine(draft, library.categories)}</span>
                </button>
                <button data-theme-slot="button" type="button" className="btn btn-ghost shrink-0" onClick={() => setDraft(null)}>
                  취소
                </button>
                <button data-theme-slot="button-primary" type="button" className="btn btn-primary shrink-0 px-3" onClick={saveReview}>
                  확인
                </button>
              </div>
              <div className="fold" style={{ gridTemplateRows: reviewOpen ? '1fr' : '0fr', opacity: reviewOpen ? 1 : 0 }}>
                <div inert={reviewOpen ? undefined : true}>
                  <DraftEditor
                    bare
                    draft={draft}
                    categories={library.categories}
                    onChange={setDraft}
                    onCancel={() => setDraft(null)}
                    onDelete={
                      draft.id
                        ? () => {
                            library.removeItem(draft.id as string)
                            setDraft(null)
                          }
                        : undefined
                    }
                    onSave={saveReview}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )
    }
    if (block.type === 'timeline') {
      return (
        <div className="column-scroll">
          <p className="text-xs text-neutral-400">일정</p>
          <ul className="mt-2">
            {timed
              .filter((item) => item.kind === 'event' && !item.startTime)
              .map((item) => (
                <li key={item.id} className="border-t border-line py-2">
                  <PlanRow item={item} categories={library.categories} onOpen={open} onToggle={library.toggleItem} />
                </li>
              ))}
            {hours.map((hour) => {
              const slot = timed.filter((item) => item.startTime && hourOf(item.startTime) === hour)
              return (
                <li
                  key={hour}
                  onDragOver={(event) => {
                    if (editing) return
                    event.preventDefault()
                    setOverHour(hour)
                  }}
                  onDragLeave={() => setOverHour((current) => (current === hour ? null : current))}
                  onDrop={(event) => {
                    if (!editing) takeDrop(event, hour)
                  }}
                  className={['grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 border-t border-line transition-colors duration-150', overHour === hour ? 'bg-accent-light' : ''].join(' ')}
                >
                  <time className="pt-2 text-xs tabular-nums text-neutral-400">{hour}</time>
                  <div className={`${slotClass} py-1`}>
                    {slot.map((item) => (
                      <PlanRow key={item.id} item={item} categories={library.categories} onOpen={open} onToggle={library.toggleItem} />
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )
    }
    if (block.type === 'task-list' || block.type === 'unscheduled' || block.type === 'completed') {
      const tasks =
        block.type === 'completed'
          ? library.items.filter((item) => item.kind === 'task' && item.status === 'done')
          : block.type === 'unscheduled'
            ? allTasks.filter((item) => !item.startTime)
            : allTasks
      return (
        <div className="column-scroll">
          <TaskFolders
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
            onToggle={library.toggleItem}
            onAssign={open}
          />
        </div>
      )
    }
    if (block.type === 'calendar') {
      return (
        <MiniCalendar
          selected={selected}
          weekStartsOn={library.settings.weekStartsOn}
          events={events}
          tasks={taskMarks}
          onSelect={setSelected}
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

  return (
    <PageCanvas
      pageId="schedule"
      editing={editing}
      blocks={blocks}
      onChange={(next) => library.setPageLayout('schedule', next)}
      render={renderBlock}
    />
  )
}

export function SchedulePage() {
  return <DailyBoard />
}

function reviewLine(draft: ScheduleDraft, categories: WorkspaceCategory[]): string {
  const kind = draft.kind === 'event' ? '일정' : '할 일'
  const time = draft.startTime ? (draft.endTime ? `${draft.startTime}–${draft.endTime}` : draft.startTime) : '시간 없음'
  const project = categories.find((category) => category.id === draft.categoryId)?.name ?? '미분류'
  return `${kind} · ${time} · ${project} · ${draft.title || '제목 없음'}`
}

function saveDraft(draft: ScheduleDraft): Omit<WorkItem, 'id' | 'priority' | 'repeat'> | null {
  const created = createWorkItem({
    kind: draft.kind,
    title: draft.title,
    description: draft.description,
    date: draft.date,
    endDate: draft.kind === 'event' ? draft.endDate || null : null,
    startTime: draft.startTime || null,
    endTime: draft.endTime || null,
    duration: Number(draft.duration) || null,
    dueDate: draft.kind === 'task' ? draft.dueDate || null : null,
    categoryId: draft.categoryId,
    allDay: draft.kind === 'event' && !draft.startTime,
    status: draft.kind === 'task' ? draft.status : 'todo',
  })
  if (!created) return null
  const { id: _id, priority: _priority, repeat: _repeat, ...rest } = created
  return rest
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
  tasks: { categoryId: string | null; date: string }[],
  categories: { id: string; parentId: string | null }[],
  day: string,
): boolean {
  const ids = new Set<string>([groupId])
  for (const child of categories) if (child.parentId === groupId) ids.add(child.id)
  return tasks.some((task) => task.date === day && task.categoryId !== null && ids.has(task.categoryId))
}

function groupTasks(tasks: WorkItem[], categories: WorkspaceCategory[]): TaskGroup[] {
  const byDate = (left: WorkItem, right: WorkItem) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title, 'ko')
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
  if (item.dueDate) return `마감 ${item.dueDate}`
  return '시간 미배정'
}

function PlanRow({
  item,
  categories,
  onOpen,
  onToggle,
}: {
  item: WorkItem
  categories: { id: string; name: string; parentId: string | null; color?: string | null }[]
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
}) {
  const path = categoryPath(item.categoryId, categories)
  const done = item.status === 'done'
  return (
    <div data-theme-slot={item.kind === 'event' ? 'schedule-card' : 'task-card'} className={item.kind === 'event' ? 'theme-plan flex items-start gap-3 p-2 my-1' : 'theme-task flex items-start gap-3'} style={{borderLeftColor:categories.find(c=>c.id===item.categoryId)?.color??undefined,borderLeftWidth:categories.find(c=>c.id===item.categoryId)?.color?3:undefined}}>
      {item.kind === 'task' ? (
        <span className="mt-0.5">
          <TaskCheckbox checked={done} label={`${item.title} 완료`} onChange={() => onToggle(item.id)} />
        </span>
      ) : null}
      <button data-theme-slot="button" type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 py-0.5 text-left">
        <span data-theme-slot="schedule-title" className={done ? 'block text-sm text-neutral-400 line-through' : 'block text-sm text-neutral-900'}>
          {item.title}
        </span>
        <span data-theme-slot="schedule-time" className="mt-1 block text-xs text-neutral-400">
          {spanLabel(item)}
          {item.kind === 'event' ? ' · 일정' : ' · 할 일'}
          {item.endDate ? ` · ${item.date}–${item.endDate}` : ''}
          {path ? ` · ${path}` : ''}
        </span>
      </button>
    </div>
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
  const areas = categories.filter((category) => category.parentId === null)
  const options = [{ id: 'all', name: '전체' }, ...areas]
  const many = areas.length > 5
  const visible = scopeTasks(tasks, categories, filter)
  const groups = groupTasks(visible, categories)

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
        <EmptyState>할 일이 없습니다.</EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState>이 범위의 할 일이 없습니다.</EmptyState>
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
                  <span className="chevron inline-flex text-neutral-400" style={{ transform: expanded ? 'rotate(90deg)' : undefined }} aria-hidden="true">
                    ›
                  </span>
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
                        <ul className={section.label ? 'mt-1' : ''}>
                          {section.tasks.map((item) => (
                            <TaskRow key={item.id} item={item} assignable={assignable} onOpen={onOpen} onToggle={onToggle} onAssign={onAssign} />
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
  assignable,
  onOpen,
  onToggle,
  onAssign,
}: {
  item: WorkItem
  assignable: boolean
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
  onAssign: (item: WorkItem) => void
}) {
  const done = item.status === 'done'
  return (
    <li
      data-theme-slot="task-card" className="theme-task flex items-start gap-2 rounded-md py-2 transition-colors duration-150"
      draggable={assignable && !item.startTime}
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
        <button data-theme-slot="button" type="button" onClick={() => onOpen(item)} className="block w-full text-left">
          <span className={done ? 'block truncate text-sm text-neutral-400 line-through' : 'block truncate text-sm text-neutral-900'}>
            {item.title}
          </span>
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs text-neutral-400">
            {item.date.slice(5).replace('-', '/')} · {spanLabel(item)}
          </span>
          {!item.startTime ? (
            <button data-theme-slot="button" type="button" onClick={() => onAssign(item)} className="rounded-md px-1.5 py-0.5 text-xs text-accent-text hover:bg-accent-light">
              시간 배정
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function DraftEditor({
  draft,
  categories,
  onChange,
  onCancel,
  onSave,
  onDelete,
  bare = false,
}: {
  draft: ScheduleDraft
  categories: { id: string; name: string; parentId: string | null; color?: string | null }[]
  onChange: (draft: ScheduleDraft) => void
  onCancel: () => void
  onSave: () => void
  onDelete?: () => void
  bare?: boolean
}) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch })
  const [error, setError] = useState('')
  const task = draft.kind === 'task'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim()) {
      setError('제목을 입력해 주세요.')
      return
    }
    onSave()
  }

  return (
    <form onSubmit={submit} className={bare ? 'max-h-80 overflow-auto border-t border-line px-3 py-3' : 'mt-4 rounded-md border border-line px-4 py-4'}>
      <div className="flex gap-1">
        <button data-theme-slot="button" type="button" onClick={() => set({ kind: 'event' })} className={task ? 'chip' : 'chip chip-on'}>
          일정
        </button>
        <button data-theme-slot="button" type="button" onClick={() => set({ kind: 'task' })} className={task ? 'chip chip-on' : 'chip'}>
          할 일
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-xs text-neutral-500">
          제목
          <input data-theme-slot="input" value={draft.title} onChange={(event) => set({ title: event.target.value })} className="field mt-1 w-full" />
        </label>
        <label className="text-xs text-neutral-500">
          {task ? '날짜' : '시작 날짜'}
          <input data-theme-slot="input" type="date" value={draft.date} onChange={(event) => set({ date: event.target.value })} className="field mt-1 w-full" />
        </label>
        {task ? (
          <label className="text-xs text-neutral-500">
            마감
            <input data-theme-slot="input" type="date" value={draft.dueDate} onChange={(event) => set({ dueDate: event.target.value })} className="field mt-1 w-full" />
          </label>
        ) : (
          <label className="text-xs text-neutral-500">
            종료 날짜
            <input data-theme-slot="input" type="date" value={draft.endDate} onChange={(event) => set({ endDate: event.target.value })} className="field mt-1 w-full" />
          </label>
        )}
        <label className="text-xs text-neutral-500">
          {task ? '시간' : '시작'}
          <input data-theme-slot="input" type="time" value={draft.startTime} onChange={(event) => set({ startTime: event.target.value })} className="field mt-1 w-full" />
        </label>
        <label className="text-xs text-neutral-500">
          {task ? '종료 시간' : '종료'}
          <input data-theme-slot="input" type="time" value={draft.endTime} onChange={(event) => set({ endTime: event.target.value })} className="field mt-1 w-full" />
        </label>
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
        <div className="text-xs text-neutral-500">
          카테고리
          <div className="mt-2">
            <CategoryPicker categories={categories} value={draft.categoryId} onChange={(categoryId) => set({ categoryId })} />
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
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {bare ? (
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
