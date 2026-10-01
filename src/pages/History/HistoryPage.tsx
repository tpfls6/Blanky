import { useState } from 'react'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { ScheduleRow } from '../../components/schedule/ScheduleRow.tsx'
import { TaskItem } from '../../components/tasks/TaskItem.tsx'
import { TaskDetail } from '../../components/tasks/TaskDetail.tsx'
import { useWorkspace } from '../../state/useWorkspace.ts'
import { monthTitle, parseISODate, todayISO, tomorrowISO } from '../../utils/date.ts'
import { historyDates, looseOn, scheduleOn } from '../../utils/work.ts'

function monthRows(dates: string[]) {
  return dates.reduce<{ date: string; month: string | null; label: string }[]>((rows, date) => {
    const label = monthTitle(parseISODate(date))
    const previous = rows.at(-1)?.label ?? ''
    return [...rows, { date, label, month: previous === label ? null : label }]
  }, [])
}

export function HistoryPage() {
  const { items, toggle, moveTo } = useWorkspace()
  const today = todayISO()
  const dates = historyDates(items, today)
  const rows = monthRows(dates)
  const [openDate, setOpenDate] = useState<string | null>(dates[0] ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find((item) => item.id === selectedId) ?? null

  return (
    <section className="w-full max-w-2xl px-5 py-10 sm:px-10 sm:py-14">
      <h1 className="text-2xl font-medium tracking-tight text-neutral-900 sm:text-3xl">
        History
      </h1>
      {dates.length === 0 ? (
        <EmptyState>지난 기록이 없습니다.</EmptyState>
      ) : (
        <div className="mt-8">
          {rows.map(({ date, month }) => {
            const open = openDate === date
            const schedule = scheduleOn(items, date)
            const tasks = looseOn(items, date)
            const done = tasks.filter((task) => task.status === 'done')
            const openTasks = tasks.filter((task) => task.status !== 'done')
            const preview = [...schedule, ...tasks]

            return (
              <div key={date} className={month ? 'mt-8' : 'mt-4'}>
                {month ? <h2 className="text-sm text-neutral-400">{month}</h2> : null}
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenDate((current) => (current === date ? null : date))}
                  className="mt-3 flex w-full gap-4 text-left"
                >
                  <span className="w-6 shrink-0 text-sm text-neutral-400">
                    {parseISODate(date).getDate()}
                  </span>
                  {open ? null : (
                    <span className="min-w-0 text-sm text-neutral-700">
                      {preview.map((item) => (
                        <span key={item.id} className="block truncate">
                          {item.title}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                {open ? (
                  <div className="mt-3 pl-10">
                    <h3 className="text-sm text-neutral-400">일정</h3>
                    {schedule.length === 0 ? (
                      <p className="mt-1 text-sm text-neutral-400">없음</p>
                    ) : (
                      schedule.map((item) => (
                        <ScheduleRow
                          key={item.id}
                          item={item}
                          onOpen={setSelectedId}
                          onToggle={toggle}
                        />
                      ))
                    )}
                    <h3 className="mt-5 text-sm text-neutral-400">완료한 할 일</h3>
                    {done.length === 0 ? (
                      <p className="mt-1 text-sm text-neutral-400">없음</p>
                    ) : (
                      done.map((item) => (
                        <TaskItem
                          key={item.id}
                          item={item}
                          meta="today"
                          onToggle={toggle}
                          onOpen={setSelectedId}
                          onTomorrow={(id) => moveTo(id, tomorrowISO())}
                        />
                      ))
                    )}
                    <h3 className="mt-5 text-sm text-neutral-400">미완료된 할 일</h3>
                    {openTasks.length === 0 ? (
                      <p className="mt-1 text-sm text-neutral-400">없음</p>
                    ) : (
                      openTasks.map((item) => (
                        <TaskItem
                          key={item.id}
                          item={item}
                          meta="today"
                          onToggle={toggle}
                          onOpen={setSelectedId}
                          onTomorrow={(id) => moveTo(id, tomorrowISO())}
                        />
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      {selected ? (
        <TaskDetail item={selected} onClose={() => setSelectedId(null)} />
      ) : null}
    </section>
  )
}
