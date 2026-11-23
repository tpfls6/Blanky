import { useMemo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, formatISODate, parseISODate, todayISO } from '../../utils/date.ts'
import { calendarTime, occursOn } from '../../utils/calendarMonth.ts'
import { useHolidays } from '../../services/holidays/index.ts'
import { colorOf, inkOn, isMultiDay, visibleItems, weekRows, type Cell, type HolidayMap, type Row, type Segment } from './calendarRows.ts'
import type { CalendarView } from '../../types/records.ts'
import type { WorkItem, WorkspaceCategory } from '../../types/work.ts'

type MiniCalendarProps = {
  selected: string
  weekStartsOn: 0 | 1
  events: ReadonlySet<string>
  tasks: ReadonlySet<string>
  items?: WorkItem[]
  view?: CalendarView
  categories?: WorkspaceCategory[]
  onSelect: (iso: string) => void
  /** Opens the existing detail modal; required for the detailed view. */
  onOpen?: (item: WorkItem) => void
}

/** Rows a detailed cell holds; past this, the last row becomes "+N개". */
const VISIBLE_ROWS = 3

const SUNDAY = ['일', '월', '화', '수', '목', '금', '토']
const MONDAY = ['월', '화', '수', '목', '금', '토', '일']

export function MiniCalendar({ selected, weekStartsOn, events, tasks, items = [], view = 'simple', categories = [], onSelect, onOpen }: MiniCalendarProps) {
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

  // A December/January grid spans two years.
  const holidays = useHolidays([Number(cells[0].iso.slice(0, 4)), Number(cells[41].iso.slice(0, 4))])

  const shift = (amount: number) => {
    const [year, month] = cursor.split('-').map(Number)
    const next = new Date(year, month - 1 + amount, 1)
    setCursor(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  const heading = parseISODate(`${cursor}-01`)
  const detailed = view === 'detailed' && onOpen

  return (
    <div data-theme-slot="calendar" className="theme-calendar">
      <div data-theme-slot="calendar-header" className="flex items-center justify-between">
        <p className={detailed ? 'text-base font-medium tracking-tight text-neutral-800' : 'text-sm text-neutral-800'}>
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
      {detailed ? (
        <DetailedMonth cells={cells} labels={labels} items={items} categories={categories} holidays={holidays} selected={selected} today={today} onSelect={onSelect} onOpen={onOpen} />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-7 text-center text-xs text-neutral-400">
            {labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 text-center text-sm">
            {cells.map((cell) => {
              const active = cell.iso === selected
              const isToday = cell.iso === today
              const dayHolidays = holidays.get(cell.iso)
              const hasEvent = events.has(cell.iso) || items.some(item => item.kind === 'event' && occursOn(item, cell.iso))
              const hasTask = tasks.has(cell.iso) || items.some(item => item.kind === 'task' && occursOn(item, cell.iso))
              return (
                <button
                  key={cell.iso}
                  aria-label={cell.iso}
                  title={dayHolidays?.map((holiday) => holiday.name).join(', ')}
                  data-has-event={hasEvent}
                  data-holiday={!!dayHolidays}
                  data-theme-slot={active ? "calendar-selected" : isToday ? "calendar-today" : "calendar-day"}
                  data-selected={active}
                  data-weekend={[0,6].includes(parseISODate(cell.iso).getDay())}
                  type="button"
                  onClick={() => onSelect(cell.iso)}
                  className={[
                    'relative flex aspect-square w-full items-center justify-center rounded-md transition-colors duration-150',
                    active
                      ? 'bg-accent text-accent-on'
                      : dayHolidays
                        ? ['cal-holiday hover:bg-hover', cell.inMonth ? '' : 'opacity-50'].join(' ')
                        : cell.inMonth
                          ? 'text-neutral-800 hover:bg-hover'
                          : 'text-neutral-300 hover:bg-hover',
                    active && isToday ? 'shadow-[inset_0_0_0_2px_var(--blanky-card-background,var(--surface))]' : '',
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
        </>
      )}
    </div>
  )
}

function DetailedMonth({ cells, labels, items, categories, holidays, selected, today, onSelect, onOpen }: {
  cells: Cell[]
  labels: string[]
  items: WorkItem[]
  categories: WorkspaceCategory[]
  holidays: HolidayMap
  selected: string
  today: string
  onSelect: (iso: string) => void
  onOpen: (item: WorkItem) => void
}) {
  const byDay = useMemo(() => new Map(cells.map((cell) => [cell.iso, visibleItems(items, cell.iso, holidays)])), [cells, items, holidays])
  const rowsByDay = useMemo(() => {
    const rows = new Map<string, Row[]>()
    for (let start = 0; start < cells.length; start += 7) {
      for (const [iso, dayRows] of weekRows(cells.slice(start, start + 7), byDay)) rows.set(iso, dayRows)
    }
    return rows
  }, [cells, byDay])

  return (
    <div className="@container mt-3">
      <div className="@container min-w-0">
        <div className="grid grid-cols-7 pb-1.5 text-center text-[11px] font-medium text-neutral-400">
          {labels.map((label) => (
            <span key={label} className={label === '일' ? 'cal-holiday-soft' : ''}>{label}</span>
          ))}
        </div>
        <div data-calendar-view="detailed" className="grid grid-cols-7 border-t border-line text-xs">
          {cells.map((cell) => {
            const active = cell.iso === selected
            const isToday = cell.iso === today
            const entries = byDay.get(cell.iso) ?? []
            const rows = rowsByDay.get(cell.iso) ?? []
            const dayHolidays = holidays.get(cell.iso)
            const sunday = parseISODate(cell.iso).getDay() === 0
            const overflow = rows.length > VISIBLE_ROWS
            const shown = overflow ? rows.slice(0, VISIBLE_ROWS - 1) : rows
            const hidden = entries.length - shown.filter(Boolean).length
            return (
              <div
                key={cell.iso}
                data-calendar-cell={cell.iso}
                data-selected={active}
                data-holiday={!!dayHolidays}
                onClick={() => onSelect(cell.iso)}
                className={[
                  // Like the phone calendar: week rows split by a line, no column dividers, entries nearly edge to edge.
                  // Clip 1px past the padding box so a multi-day bar meets the next day's piece.
                  'flex min-h-22 min-w-0 cursor-pointer flex-col gap-0.5 [overflow:clip] [overflow-clip-margin:1px] border-b border-line px-0.5 py-1 transition-colors duration-150 @2xl:min-h-28 @2xl:gap-1',
                  active ? 'bg-accent/8 shadow-[inset_0_0_0_1.5px_var(--accent-color)]' : 'hover:bg-hover',
                ].join(' ')}
              >
                <div className={['flex min-w-0 flex-col items-start gap-px px-0.5 @lg:flex-row @lg:items-center @lg:gap-1', cell.inMonth ? '' : 'opacity-40'].join(' ')}>
                  {/* Keyboard access; a click bubbles to the cell. */}
                  <button
                    aria-label={cell.iso}
                    aria-pressed={active}
                    data-theme-slot={active ? 'calendar-selected' : isToday ? 'calendar-today' : 'calendar-day'}
                    data-selected={active}
                    data-holiday={!!dayHolidays}
                    data-weekend={[0, 6].includes(parseISODate(cell.iso).getDay())}
                    type="button"
                    className={[
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums transition-colors duration-150 @2xl:text-xs',
                      active ? 'bg-accent text-accent-on' : dayHolidays || sunday ? 'cal-holiday' : 'text-neutral-800',
                      !active && isToday ? 'cal-today' : '',
                    ].join(' ')}
                  >
                    {cell.day}
                  </button>
                  {dayHolidays ? (
                    <span data-calendar-holiday={cell.iso} className="cal-holiday w-full min-w-0 truncate px-0.5 text-[10px] font-medium leading-3.5 @lg:w-auto @lg:px-0 @2xl:text-[11px]" title={dayHolidays.map((holiday) => holiday.name).join(', ')}>
                      {dayHolidays.map((holiday) => holiday.name).join(', ')}
                    </span>
                  ) : null}
                </div>
                <div className={['flex min-w-0 flex-col gap-0.5', cell.inMonth ? '' : 'opacity-50'].join(' ')}>
                  {shown.map((row, index) => row ? (
                    <CalendarEntry key={row.item.id} item={row.item} color={colorOf(row.item, categories)} segment={row.segment} onOpen={onOpen} />
                  ) : (
                    <div key={`lane-${index}`} data-calendar-lane className="h-4 @2xl:h-5" />
                  ))}
                  {overflow ? (
                    <button
                      type="button"
                      data-calendar-more={cell.iso}
                      onClick={(event) => { event.stopPropagation(); onSelect(cell.iso) }}
                      aria-label={`${hidden}개 더보기`}
                      className="w-full truncate rounded px-1 text-left text-[10px] font-medium leading-4 text-neutral-500 hover:bg-hover hover:text-neutral-800 @2xl:text-xs @2xl:leading-5"
                    >
                      +{hidden}개
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * One calendar entry. All-day and multi-day events are labels filled with the category color;
 * timed events and tasks are a light tint with a short category-colored mark on the left.
 */
function CalendarEntry({ item, color, segment, onOpen }: { item: WorkItem; color: string; segment?: Segment; onOpen: (item: WorkItem) => void }) {
  const multiDay = isMultiDay(item)
  const time = multiDay ? null : calendarTime(item)
  const filled = item.kind === 'event' && (multiDay || !time)
  const done = item.kind === 'task' && item.status === 'done'
  const ink = filled ? inkOn(color) : undefined
  const label = item.title || '제목 없음'
  return (
    <button
      type="button"
      data-calendar-item={item.id}
      data-calendar-color={color}
      data-calendar-style={filled ? 'fill' : 'mark'}
      data-calendar-span={segment ? `${segment.openLeft ? 'from' : 'start'}-${segment.openRight ? 'to' : 'end'}` : undefined}
      title={time ? `${time} ${item.title}` : item.title}
      aria-label={time ? `${time} ${label}` : label}
      onClick={(event) => { event.stopPropagation(); onOpen(item) }}
      className={[
        'cal-entry flex min-w-0 items-center text-left transition-[filter] duration-150 hover:brightness-95',
        filled ? 'cal-entry-fill font-medium' : 'cal-entry-mark',
        'gap-1 rounded-[3px] px-1 py-px text-[10px] leading-4 @2xl:px-1.5 @2xl:text-xs @2xl:leading-5',
        // Bars reach through the cell padding so a multi-day event reads as one band (no column dividers to cover).
        segment?.joinLeft ? '-ml-0.5' : '',
        segment?.joinRight ? '-mr-0.5' : '',
        segment?.openLeft ? 'rounded-l-none' : '',
        segment?.openRight ? 'rounded-r-none' : '',
        segment ? '' : 'w-full',
        filled ? '' : done ? 'text-neutral-400 line-through' : 'text-neutral-800',
      ].join(' ')}
      style={{ '--cal-color': color, ...(ink ? { '--cal-ink': ink } : {}) } as CSSProperties}
    >
      {time ? <span className="hidden shrink-0 tabular-nums text-neutral-500 @lg:inline">{time}</span> : null}
      {/* Continuation pieces keep their height but only the first piece in a week row shows the title. */}
      <span aria-hidden={segment?.joinLeft || undefined} className={['min-w-0 flex-1 truncate', segment?.joinLeft ? 'invisible' : ''].join(' ')}>{label}</span>
    </button>
  )
}
