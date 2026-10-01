import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import type { WorkItem } from '../../types/work.ts'
import { addDays, formatISODate, monthTitle, todayISO } from '../../utils/date.ts'
import { itemsOn, spansDays } from '../../utils/work.ts'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

type CalendarViewProps = {
  items: WorkItem[]
  selected: string
  onSelect: (date: string) => void
  onOpen: (id: string) => void
  onMove: (id: string, date: string) => void
}

function monthCells(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

export function CalendarView({
  items,
  selected,
  onSelect,
  onOpen,
  onMove,
}: CalendarViewProps) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  )
  const [over, setOver] = useState<string | null>(null)
  const today = todayISO()

  const acceptDrop = (event: DragEvent, iso: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setOver(iso)
  }

  const takeDrop = (event: DragEvent, iso: string) => {
    event.preventDefault()
    event.stopPropagation()
    setOver(null)
    const id = event.dataTransfer.getData('text/plain')
    if (id) onMove(id, iso)
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium tracking-tight text-neutral-900">
          {monthTitle(month)}
        </h2>
        <button
          type="button"
          aria-label="이전 달"
          onClick={() =>
            setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
          }
          className="p-1 text-neutral-400 hover:text-neutral-800"
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() =>
            setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
          }
          className="p-1 text-neutral-400 hover:text-neutral-800"
        >
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => {
            const now = new Date()
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
            onSelect(todayISO())
          }}
          className="text-sm text-neutral-400 hover:text-neutral-800"
        >
          오늘
        </button>
      </div>
      <div className="mt-6 grid grid-cols-7">
        {WEEKDAYS.map((label) => (
          <div key={label} className="pb-2 text-center text-xs text-neutral-400 sm:text-left sm:pl-1">
            {label}
          </div>
        ))}
        {monthCells(month).map((date) => {
          const iso = formatISODate(date)
          const inMonth = date.getMonth() === month.getMonth()
          const dayItems = itemsOn(items, iso)
          const spans = dayItems.filter((item) => spansDays(item))
          const singles = dayItems.filter((item) => !spansDays(item))
          const visible = singles.slice(0, 3)
          const hidden = singles.length - visible.length
          const weekStart = date.getDay() === 0

          return (
            <div
              key={iso}
              onDragOver={(event) => acceptDrop(event, iso)}
              onDragLeave={() => setOver((current) => (current === iso ? null : current))}
              onDrop={(event) => takeDrop(event, iso)}
              className={[
                'min-h-11 min-w-0 rounded-md px-0.5 py-1 sm:min-h-28 sm:px-1',
                iso === selected || over === iso ? 'bg-neutral-50' : '',
              ].join(' ')}
            >
              <button
                type="button"
                aria-pressed={iso === selected}
                onDragOver={(event) => acceptDrop(event, iso)}
                onDrop={(event) => takeDrop(event, iso)}
                onClick={() => onSelect(iso)}
                className={[
                  'flex w-full justify-center text-xs sm:justify-start',
                  inMonth ? 'text-neutral-700' : 'text-neutral-300',
                  iso === today ? 'font-medium text-neutral-900' : '',
                ].join(' ')}
              >
                {date.getDate()}
              </button>
              {dayItems.length > 0 ? (
                <span className="mx-auto mt-1 block size-1 rounded-full bg-neutral-400 sm:hidden" />
              ) : null}
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {spans.map((item) => {
                  const start = item.date === iso || weekStart
                  const end = item.endDate === iso || date.getDay() === 6
                  return (
                    <button
                      key={item.id}
                      type="button"
                      draggable={item.date === iso}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', item.id)
                        event.dataTransfer.effectAllowed = 'move'
                        event.stopPropagation()
                      }}
                      onClick={() => {
                        onSelect(iso)
                        onOpen(item.id)
                      }}
                      className={[
                        'block h-4 truncate bg-neutral-100 text-left text-[11px] leading-4 text-neutral-800',
                        start ? 'rounded-l pl-1' : '-ml-0.5',
                        end ? 'rounded-r' : '-mr-0.5',
                      ].join(' ')}
                    >
                      {start ? item.title : ''}
                    </button>
                  )
                })}
                {visible.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', item.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.stopPropagation()
                    }}
                    onClick={() => {
                      onSelect(iso)
                      onOpen(item.id)
                    }}
                    className={[
                      'flex w-full min-w-0 items-center gap-1 text-left text-[11px] leading-4',
                      item.status === 'done'
                        ? 'text-neutral-400 line-through'
                        : 'text-neutral-700',
                    ].join(' ')}
                  >
                    {item.startTime ? (
                      <span className="shrink-0 tabular-nums text-neutral-400">
                        {item.startTime}
                      </span>
                    ) : null}
                    {item.kind === 'task' ? (
                      <span className="size-2 shrink-0 rounded-[2px] border border-neutral-300" />
                    ) : null}
                    <span className="truncate">{item.title}</span>
                  </button>
                ))}
                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelect(iso)}
                    className="text-[11px] text-neutral-400"
                  >
                    +{hidden}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
