import type { WorkItem } from '../../types/work.ts'
import { ScheduleRow } from '../schedule/ScheduleRow.tsx'

type TodayScheduleProps = {
  items: WorkItem[]
  onOpen: (id: string) => void
  onToggle: (id: string) => void
}

export function TodaySchedule({ items, onOpen, onToggle }: TodayScheduleProps) {
  return (
    <section className="mt-10">
      <h2 className="text-sm text-neutral-400">일정</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">없음</p>
      ) : (
        <div className="mt-2">
          {items.map((item) => (
            <ScheduleRow key={item.id} item={item} onOpen={onOpen} onToggle={onToggle} />
          ))}
        </div>
      )}
    </section>
  )
}
