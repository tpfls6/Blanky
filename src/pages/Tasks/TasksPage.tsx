import { useState } from 'react'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { QuickAdd } from '../../components/schedule/QuickAdd.tsx'
import { ScheduleRow } from '../../components/schedule/ScheduleRow.tsx'
import { TaskDetail } from '../../components/tasks/TaskDetail.tsx'
import { TaskGroups } from '../../components/tasks/TaskGroups.tsx'
import { usePanels } from '../../state/usePanels.ts'
import { useWorkspace } from '../../state/useWorkspace.ts'
import { todayISO, tomorrowISO } from '../../utils/date.ts'
import {
  filterByWhen,
  filterTasks,
  inCategory,
  matchesQuery,
  type TaskFilter,
} from '../../utils/work.ts'

const FILTERS: { id: TaskFilter; label: string; empty: string }[] = [
  { id: 'all', label: 'All', empty: '할 일이 없습니다.' },
  { id: 'today', label: 'Today', empty: '오늘 할 일이 없습니다.' },
  { id: 'upcoming', label: 'Upcoming', empty: '예정된 할 일이 없습니다.' },
  { id: 'completed', label: 'Completed', empty: '완료한 할 일이 없습니다.' },
]

export function TasksPage() {
  const { items, categories, toggle, moveTo } = useWorkspace()
  const panels = usePanels()
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const today = todayISO()
  const parents = categories.filter((category) => category.parentId === null)
  const browsed = items.filter(
    (item) => inCategory(item, categoryId, categories) && matchesQuery(item, query),
  )
  const tasks = filterTasks(browsed, filter, today)
  const showEvents = query.trim().length > 0 || categoryId !== null
  const events = showEvents
    ? browsed
        .filter((item) => item.kind === 'event' && filterByWhen(item, filter, today))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    : []
  const selected = items.find((item) => item.id === panels.selectedId) ?? null
  const empty = FILTERS.find((item) => item.id === filter)?.empty ?? '할 일이 없습니다.'

  return (
    <section className="w-full max-w-2xl px-5 py-10 sm:px-10 sm:py-14">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-medium tracking-tight text-neutral-900 sm:text-3xl">Tasks</h1>
      </div>
      <QuickAdd kind="task" date={today} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="검색"
        aria-label="제목 검색"
        className="mt-6 w-full border-b border-neutral-100 bg-transparent py-2 text-sm text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={filter === item.id ? 'text-neutral-900' : 'text-neutral-400'}
          >
            {item.label}
          </button>
        ))}
        <select
          aria-label="카테고리"
          value={categoryId ?? ''}
          onChange={(event) => setCategoryId(event.target.value || null)}
          className={[
            'bg-transparent focus:outline-none',
            categoryId ? 'text-neutral-900' : 'text-neutral-400',
          ].join(' ')}
        >
          <option value="">카테고리</option>
          {parents.map((parent) => (
            <optgroup key={parent.id} label={parent.name}>
              <option value={parent.id}>{parent.name}</option>
              {categories.filter((category) => category.parentId === parent.id).map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {events.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm text-neutral-400">일정</h2>
          <div className="mt-2">
            {events.map((item) => (
              <ScheduleRow key={item.id} item={item} onOpen={panels.openItem} />
            ))}
          </div>
        </section>
      ) : null}
      {tasks.length === 0 && events.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : tasks.length > 0 ? (
        <TaskGroups
          tasks={tasks}
          onToggle={toggle}
          onOpen={panels.openItem}
          onTomorrow={(id) => moveTo(id, tomorrowISO())}
        />
      ) : null}
      {selected ? <TaskDetail item={selected} onClose={panels.closeItem} /> : null}
    </section>
  )
}
