import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, formatISODate, parseISODate, todayISO } from '../../utils/date.ts'
import { occursOn } from '../../utils/work.ts'
import type { WorkItem } from '../../types/work.ts'

type MiniCalendarProps = {
  selected: string
  weekStartsOn: 0 | 1
  events: ReadonlySet<string>
  tasks: ReadonlySet<string>
  items?: WorkItem[]
  onSelect: (iso: string) => void
}

const SUNDAY = ['일', '월', '화', '수', '목', '금', '토']
const MONDAY = ['월', '화', '수', '목', '금', '토', '일']

export function MiniCalendar({ selected, weekStartsOn, events, tasks, items = [], onSelect }: MiniCalendarProps) {
  const [cursor, setCursor] = useState(() => selected.slice(0, 7))
  const labels = weekStartsOn === 1 ? MONDAY : SUNDAY
  const today = todayISO()

  const cells = useMemo(() => {
    const [year, month] = cursor.split('-').map(Number)
    const first = new Date(year, month - 1, 1)
    const pad = (first.getDay() - weekStartsOn + 7) % 7
    const start = addDays(first, -pad)
    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(start, index)
      return {
        iso: formatISODate(date),
        inMonth: date.getMonth() === month - 1,
        day: date.getDate(),
      }
    })
  }, [cursor, weekStartsOn])

  const shift = (amount: number) => {
    const [year, month] = cursor.split('-').map(Number)
    const next = new Date(year, month - 1 + amount, 1)
    setCursor(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  const heading = parseISODate(`${cursor}-01`)

  return (
    <div data-theme-slot="calendar" className="theme-calendar">
      <div data-theme-slot="calendar-header" className="flex items-center justify-between">
        <p className="text-sm text-neutral-800">
          {heading.getFullYear()}년 {heading.getMonth() + 1}월
        </p>
        <div className="flex gap-0.5">
          <button data-theme-slot="button" type="button" onClick={() => shift(-1)} aria-label="이전 달" className="icon-btn">
            <ChevronLeft className="size-4" strokeWidth={1.5} />
          </button>
          <button data-theme-slot="button" type="button" onClick={() => shift(1)} aria-label="다음 달" className="icon-btn">
            <ChevronRight className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 text-center text-xs text-neutral-400">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 text-center text-sm">
        {cells.map((cell) => {
          const active = cell.iso === selected
          const isToday = cell.iso === today
          const hasEvent = events.has(cell.iso) || items.some(item => item.kind === 'event' && occursOn(item, cell.iso))
          const hasTask = tasks.has(cell.iso) || items.some(item => item.kind === 'task' && occursOn(item, cell.iso))
          return (
            <button
              key={cell.iso}
              aria-label={cell.iso}
              data-has-event={hasEvent}
              data-theme-slot={active ? "calendar-selected" : isToday ? "calendar-today" : "calendar-day"}
              data-selected={active}
              data-weekend={[0,6].includes(parseISODate(cell.iso).getDay())}
              type="button"
              onClick={() => onSelect(cell.iso)}
              className={[
                'relative flex aspect-square w-full items-center justify-center rounded-md transition-colors duration-150',
                active
                  ? 'bg-accent text-accent-on'
                  : cell.inMonth
                    ? 'text-neutral-800 hover:bg-hover'
                    : 'text-neutral-300 hover:bg-hover',
                active && isToday ? 'shadow-[inset_0_0_0_2px_var(--bg)]' : '',
                !active && isToday ? 'cal-today' : '',
              ].join(' ')}
            >
              {cell.day}
              {hasEvent || hasTask ? (
                <span className="absolute bottom-1 flex gap-0.5">
                  {hasEvent ? (
                    <span className={['size-1 rounded-full', active ? 'bg-accent-on' : 'bg-accent'].join(' ')} />
                  ) : null}
                  {hasTask ? (
                    <span
                      className={[
                        'size-1 rounded-full border',
                        active ? 'border-accent-on' : 'border-accent',
                      ].join(' ')}
                    />
                  ) : null}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
