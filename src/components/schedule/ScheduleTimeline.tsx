import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import type { WorkItem, WorkspaceCategory } from '../../types/work.ts'
import { layoutTimeline, timelineCurrentTime, timelineRange } from '../../utils/scheduleTimeline.ts'
import { TaskCheckbox } from '../tasks/TaskCheckbox.tsx'
import { DeadlineBadge } from '../tasks/DeadlineBadge.tsx'
import './scheduleTimeline.css'

type Props = {
  items: WorkItem[]
  categories: WorkspaceCategory[]
  day: string
  hours: string[]
  hourHeight: number
  editing: boolean
  onOpen: (item: WorkItem) => void
  onToggle: (id: string) => void
  onDropHour: (event: DragEvent, hour: string) => void
  onResize: (item: WorkItem, end: number) => void
}

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export function ScheduleTimeline({ items, categories, day, hours, hourHeight, editing, onOpen, onToggle, onDropHour, onResize }: Props) {
  const [overHour, setOverHour] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(new Date())
      clearTimeout(timer)
      timer = setTimeout(tick, 60_000 - Date.now() % 60_000)
    }
    timer = setTimeout(tick, 60_000 - Date.now() % 60_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  const [preview, setPreview] = useState<{ id: string; end: number } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const resizing = useRef<{ item: WorkItem; y: number; start: number; end: number } | null>(null)
  const placements = useMemo(() => layoutTimeline(items.flatMap(item => {
    const range = timelineRange(item, day)
    return range ? [{ ...range, id: item.id, kind: item.kind, item, end: preview?.id === item.id ? preview.end : range.end }] : []
  })), [items, day, preview])
  const firstMinute = Number(hours[0].slice(0, 2)) * 60
  const currentTime = !editing ? timelineCurrentTime(day, firstMinute, firstMinute + hours.length * 60, now) : null
  const dropHour = (event: DragEvent<HTMLDivElement>) => hours[Math.max(0, Math.min(hours.length - 1, Math.floor((event.clientY - event.currentTarget.getBoundingClientRect().top) / hourHeight)))]
  const resizeEnd = (event: PointerEvent) => {
    const drag = resizing.current
    return drag ? Math.max(drag.start + 15, Math.min(1440, Math.round((drag.end + (event.clientY - drag.y) / hourHeight * 60) / 15) * 15)) : 0
  }
  return <div className="schedule-timeline-scroll" aria-label="시간별 일정">
    <div className="schedule-time-grid"
      onDragOver={event => { if (!editing) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOverHour(dropHour(event)) } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverHour(null) }}
      onDrop={event => { if (!editing) { onDropHour(event, dropHour(event)); setOverHour(null) } }}>
      <ul>{hours.map(hour => <li key={hour} className={`schedule-time-row${overHour === hour ? ' schedule-time-row-over' : ''}${currentTime?.hour === hour ? ' schedule-time-row-current' : ''}`} style={{ height: hourHeight }}>
        <time aria-current={currentTime?.hour === hour ? 'time' : undefined} style={{ opacity: currentTime && Math.abs((Number(hour.slice(0, 2)) * 60 - currentTime.minutes) / 60 * hourHeight + 12) < 18 ? 0 : undefined }}>{hour}</time>
      </li>)}</ul>
      <div className="schedule-time-blocks">
        {placements.map(({ item, start, end, column, columns: count, span }) => {
          const height = (end - start) / 60 * hourHeight
          const color = categories.find(category => category.id === item.categoryId)?.color || 'var(--accent-color)'
          const done = item.status === 'done'
          const label = `${item.title} · ${clock(start)}–${clock(end)}`
          const open = expanded === item.id
          return <article key={item.id} data-timeline-id={item.id} data-kind={item.kind} data-theme-slot={item.kind === 'event' ? 'schedule-card' : 'task-card'}
            className={`schedule-time-block ${item.kind === 'event' ? 'theme-plan' : 'theme-task'}${done ? ' schedule-time-done' : ''}${height < 38 && !open ? ' schedule-time-short' : ''}${open ? ' schedule-time-expanded' : ''}`}
            style={{ top: (start - firstMinute) / 60 * hourHeight, height: open ? 'auto' : height, minHeight: height, left: `${column / count * 100}%`, width: `calc(${span / count * 100}% - 6px)`, borderLeftColor: color }}
            draggable={!editing} onDragStart={event => { event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move' }}
            onClick={event => {
              const target = event.target as HTMLElement
              if (target.closest('[role=checkbox],[role=slider]')) return
              const title = target.closest<HTMLElement>('.schedule-card-title')
              // A truncated title expands in place; anywhere else on the card opens the details.
              if (title && (open || title.scrollHeight > title.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1)) setExpanded(open ? null : item.id)
              else onOpen(item)
            }}>
            <div className="schedule-card-heading">
              {item.kind === 'task' ? <TaskCheckbox checked={done} label={`${item.title} 완료`} onChange={() => onToggle(item.id)} /> : null}
              <button type="button" data-theme-slot="button" title={label} className="schedule-card-open" aria-label={label}>
                <span data-theme-slot="schedule-title" className="schedule-card-title" style={{ WebkitLineClamp: open ? 'unset' : height >= 82 ? 3 : height >= 54 ? 2 : 1 }}>{item.title}</span>
                <span data-theme-slot="schedule-time" className="schedule-card-time">{clock(start)}–{clock(end)}</span>
                <DeadlineBadge item={item}/>
              </button>
            </div>
            {!editing && item.date === day && (!item.endDate || item.endDate === day) ? <div role="slider" tabIndex={0} aria-label={`${item.title} 종료 시간 조절`} aria-valuemin={start + 15} aria-valuemax={1440} aria-valuenow={end} aria-valuetext={clock(end)}
              className="schedule-card-resize" draggable={false} data-no-drag
              onDragStart={event => { event.preventDefault(); event.stopPropagation() }}
              onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); resizing.current = { item, y: event.clientY, start, end } }}
              onPointerMove={event => { if (resizing.current?.item.id === item.id) setPreview({ id: item.id, end: resizeEnd(event) }) }}
              onPointerUp={event => { if (resizing.current?.item.id === item.id) { onResize(item, resizeEnd(event)); resizing.current = null; setPreview(null) } }}
              onPointerCancel={() => { resizing.current = null; setPreview(null) }}
              onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onResize(item, Math.max(start + 15, Math.min(1440, end + (event.key === 'ArrowUp' ? -15 : 15)))) } }} /> : null}
          </article>
        })}
      </div>
      {currentTime && <div className="schedule-now" data-current-time={currentTime.label} style={{ top: (currentTime.minutes - firstMinute) / 60 * hourHeight }} aria-label={`현재 시각 ${currentTime.label}`}>
        <time className="schedule-now-label" dateTime={`${day}T${currentTime.label}`}><span className="sr-only">현재 시각 </span>{currentTime.label}</time>
        <span className="schedule-now-line" aria-hidden="true" />
      </div>}
    </div>
  </div>
}
