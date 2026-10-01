import type { WorkItem } from '../../types/work.ts'
import { EmptyState } from '../common/EmptyState.tsx'
import { TaskGroups } from '../tasks/TaskGroups.tsx'

type TodayTasksProps = {
  items: WorkItem[]
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onTomorrow: (id: string) => void
}

export function TodayTasks({ items, onToggle, onOpen, onTomorrow }: TodayTasksProps) {
  return (
    <section className="mt-10">
      <h2 className="text-sm text-neutral-400">할 일</h2>
      {items.length === 0 ? (
        <EmptyState>오늘 할 일이 없습니다.</EmptyState>
      ) : (
        <TaskGroups
          tasks={items}
          meta="today"
          onToggle={onToggle}
          onOpen={onOpen}
          onTomorrow={onTomorrow}
        />
      )}
    </section>
  )
}
