import { useState, type DragEvent } from 'react'
import type { WorkItem } from '../../types/work.ts'
import { hourOf, timelineHours } from '../../utils/work.ts'
import { ScheduleRow } from '../schedule/ScheduleRow.tsx'

type TimelineDayProps = {
  items: WorkItem[]
  date: string
  onOpen: (id: string) => void
  onToggle: (id: string) => void
  onPlace: (id: string, date: string, startTime: string) => void
}

export function TimelineDay({ items, date, onOpen, onToggle, onPlace }: TimelineDayProps) {
  const [over, setOver] = useState<string | null>(null)
  const timed = items.filter((item) => item.date === date && item.startTime)
  const hours = timelineHours(timed.map((item) => item.startTime))

  const acceptDrop = (event: DragEvent, hour: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setOver(hour)
  }

  const takeDrop = (event: DragEvent, hour: string) => {
    event.preventDefault()
    setOver(null)
    const id = event.dataTransfer.getData('text/plain')
    if (id) onPlace(id, date, hour)
  }

  return (
    <div>
      {hours.map((hour) => {
        const slot = timed.filter((item) => item.startTime && hourOf(item.startTime) === hour)
        return (
          <div
            key={hour}
            onDragOver={(event) => acceptDrop(event, hour)}
            onDragLeave={() => setOver((current) => (current === hour ? null : current))}
            onDrop={(event) => takeDrop(event, hour)}
            className={[
              'grid grid-cols-[3rem_minmax(0,1fr)] gap-3 border-t border-neutral-100',
              over === hour ? 'bg-neutral-50' : '',
            ].join(' ')}
          >
            <span className="pt-3 text-xs tabular-nums text-neutral-400">{hour}</span>
            <div className="min-h-14 py-1">
              {slot.map((item) => (
                <ScheduleRow
                  key={item.id}
                  item={item}
                  onOpen={onOpen}
                  onToggle={onToggle}
                  draggable
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
