import { useWorkspace } from '../../state/useWorkspace.ts'
import type { WorkItem } from '../../types/work.ts'
import { shortDate, todayISO } from '../../utils/date.ts'
import { categoryPath } from '../../utils/work.ts'
import { TaskCheckbox } from './TaskCheckbox.tsx'

type TaskItemProps = {
  item: WorkItem
  meta?: 'today' | 'full'
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onTomorrow: (id: string) => void
}

export function TaskItem({
  item,
  meta = 'full',
  onToggle,
  onOpen,
  onTomorrow,
}: TaskItemProps) {
  const { categories } = useWorkspace()
  const done = item.status === 'done'
  const path = categoryPath(item.categoryId, categories)
  const showTomorrow = !done && item.date === todayISO()

  return (
    <div className="flex items-start gap-2 py-1">
      <span className="mt-0.5 inline-flex">
        <TaskCheckbox
          checked={done}
          label={`${item.title} 완료`}
          onChange={() => onToggle(item.id)}
        />
      </span>
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', item.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => onOpen(item.id)}
        className="min-w-0 flex-1 cursor-grab py-0.5 text-left active:cursor-grabbing"
      >
        <span
          className={[
            'block truncate text-sm',
            done ? 'text-neutral-400 line-through' : 'text-neutral-900',
          ].join(' ')}
        >
          {item.title}
        </span>
        {meta === 'today' && (path || item.duration) ? (
          <span className="mt-0.5 block text-xs text-neutral-400">
            {path}
            {path && item.duration ? ' · ' : ''}
            {item.duration ? `${item.duration}분` : ''}
          </span>
        ) : null}
        {meta === 'full' ? (
          <span className="mt-0.5 block text-xs text-neutral-400">
            {path ? <span className="block">{path}</span> : null}
            <span>
              {shortDate(item.date)}
              {item.startTime ? ` · ${item.startTime}` : ''}
              {item.duration ? ` · ${item.duration}분` : ''}
              {item.dueDate ? ` · 마감 ${shortDate(item.dueDate)}` : ''}
            </span>
          </span>
        ) : null}
      </button>
      {showTomorrow ? (
        <button
          type="button"
          onClick={() => onTomorrow(item.id)}
          className="shrink-0 px-1 py-1 text-xs text-neutral-400 hover:text-neutral-800"
        >
          내일
        </button>
      ) : null}
    </div>
  )
}
