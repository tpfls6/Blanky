import type { WorkItem } from '../../types/work.ts'
import { monthDay } from '../../utils/date.ts'
import { looseOn, scheduleOn } from '../../utils/work.ts'
import { ScheduleRow } from '../schedule/ScheduleRow.tsx'
import { TaskItem } from '../tasks/TaskItem.tsx'

type DayDetailProps = {
  date: string
  items: WorkItem[]
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onTomorrow: (id: string) => void
}

export function DayDetail({ date, items, onToggle, onOpen, onTomorrow }: DayDetailProps) {
  const schedule = scheduleOn(items, date)
  const tasks = looseOn(items, date)

  return (
    <section>
      <h2 className="text-lg font-medium tracking-tight text-neutral-900">{monthDay(date)}</h2>
      <h3 className="mt-6 text-sm text-neutral-400">일정</h3>
      {schedule.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">없음</p>
      ) : (
        <div className="mt-2">
          {schedule.map((item) => (
            <ScheduleRow key={item.id} item={item} onOpen={onOpen} onToggle={onToggle} />
          ))}
        </div>
      )}
      <h3 className="mt-8 text-sm text-neutral-400">할 일</h3>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">없음</p>
      ) : (
        <div className="mt-2">
          {tasks.map((item) => (
            <TaskItem
              key={item.id}
              item={item}
              meta="today"
              onToggle={onToggle}
              onOpen={onOpen}
              onTomorrow={onTomorrow}
            />
          ))}
        </div>
      )}
    </section>
  )
}
