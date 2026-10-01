import type { WorkItem } from '../../types/work.ts'
import { REPEAT_LABEL } from '../../utils/work.ts'
import { TaskCheckbox } from '../tasks/TaskCheckbox.tsx'

type ScheduleRowProps = {
  item: WorkItem
  onOpen?: (id: string) => void
  onToggle?: (id: string) => void
  draggable?: boolean
}

export function ScheduleRow({ item, onOpen, onToggle, draggable = false }: ScheduleRowProps) {
  const done = item.status === 'done'
  const task = item.kind === 'task'

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-28 shrink-0 text-sm tabular-nums text-neutral-400">
        {item.allDay && !item.startTime ? '종일' : item.startTime}
        {!item.allDay && item.endTime ? `–${item.endTime}` : ''}
      </span>
      {task && onToggle ? (
        <TaskCheckbox
          checked={done}
          label={`${item.title} 완료`}
          onChange={() => onToggle(item.id)}
        />
      ) : null}
      <button
        type="button"
        draggable={draggable}
        onDragStart={
          draggable
            ? (event) => {
                event.dataTransfer.setData('text/plain', item.id)
                event.dataTransfer.effectAllowed = 'move'
              }
            : undefined
        }
        onClick={() => onOpen?.(item.id)}
        className={[
          'min-w-0 flex-1 text-left text-sm',
          draggable ? 'cursor-grab active:cursor-grabbing' : '',
        ].join(' ')}
      >
        <span className={done ? 'text-neutral-400 line-through' : 'text-neutral-800'}>{item.title}</span>
        {item.repeat !== 'none' ? (
          <span className="ml-2 text-xs text-neutral-400">{REPEAT_LABEL[item.repeat]}</span>
        ) : null}
      </button>
    </div>
  )
}
