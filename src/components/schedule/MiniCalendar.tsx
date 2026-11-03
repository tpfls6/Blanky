import { useMemo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, formatISODate, parseISODate, todayISO } from '../../utils/date.ts'
import { calendarDayItems, calendarTime, isHolidayCopy, occursOn } from '../../utils/calendarMonth.ts'
import { useHolidays, type Holiday } from '../../services/holidays/index.ts'
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

type HolidayMap = Map<string, Holiday[]>

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

type Cell = { iso: string; inMonth: boolean; day: number }

function colorOf(item: WorkItem, categories: WorkspaceCategory[]): string {
  const category = categories.find((entry) => entry.id === item.categoryId)
  const parent = category?.parentId ? categories.find((entry) => entry.id === category.parentId) : undefined
  return category?.color || parent?.color || 'var(--accent-color)'
}

/** Text color that stays readable on a filled label of `color`; undefined for non-hex colors (theme accent). */
function inkOn(color: string): string | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1]
  if (!hex) return undefined
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
  const [r, g, b] = [0, 2, 4]
    .map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2 ? '#1f2937' : '#ffffff'
}

/** A day's entries without synced copies of the day's holiday (the holiday label already shows it). */
function visibleItems(items: WorkItem[], iso: string, holidays: HolidayMap): WorkItem[] {
  return calendarDayItems(items, iso).filter((item) => !isHolidayCopy(item, holidays.get(iso)))
}

function isMultiDay(item: WorkItem): boolean {
  return item.kind === 'event' && !!item.endDate && item.endDate > item.date
}

/** How one day's piece of a multi-day bar meets its neighbours. */
type Segment = {
  /** The bar continues into the cell on that side (same week row): bridge the gap. */
  joinLeft: boolean
  joinRight: boolean
  /** The bar continues past the week row's edge: square that end off. */
  openLeft: boolean
  openRight: boolean
}

/** A cell row: an entry, or an empty lane that keeps multi-day bars aligned across the week. */
type Row = { item: WorkItem; segment?: Segment } | null

/**
 * Rows for each day of one week: multi-day events get a lane shared by all their days,
 * so each day's segment lines up into one horizontal bar; other entries follow in day order.
 */
function weekRows(week: Cell[], byDay: Map<string, WorkItem[]>): Map<string, Row[]> {
  const spans = new Map<string, { item: WorkItem; days: number[] }>()
  week.forEach((cell, day) => {
    for (const item of byDay.get(cell.iso) ?? []) {
      if (!isMultiDay(item)) continue
      const span = spans.get(item.id) ?? { item, days: [] }
      span.days.push(day)
      spans.set(item.id, span)
    }
  })
  const lanes: (string | undefined)[][] = []
  const ordered = [...spans.values()].sort((a, b) => a.days[0] - b.days[0] || b.days.length - a.days.length || a.item.title.localeCompare(b.item.title))
  for (const span of ordered) {
    let lane = lanes.findIndex((taken) => span.days.every((day) => !taken[day]))
    if (lane < 0) lane = lanes.push([]) - 1
    for (const day of span.days) lanes[lane][day] = span.item.id
  }
  return new Map(week.map((cell, day) => {
    const rows: Row[] = []
    const last = lanes.reduce((top, taken, lane) => (taken[day] ? lane : top), -1)
    for (let lane = 0; lane <= last; lane++) {
      const id = lanes[lane][day]
      const item = id ? spans.get(id)!.item : undefined
      if (!item) { rows.push(null); continue }
      const date = parseISODate(cell.iso)
      const joinLeft = day > 0 && lanes[lane][day - 1] === id
      const joinRight = day < 6 && lanes[lane][day + 1] === id
      rows.push({
        item,
        segment: {
          joinLeft,
          joinRight,
          openLeft: joinLeft || (day === 0 && occursOn(item, formatISODate(addDays(date, -1)))),
          openRight: joinRight || (day === 6 && occursOn(item, formatISODate(addDays(date, 1)))),
        },
      })
    }
    for (const item of byDay.get(cell.iso) ?? []) if (!spans.has(item.id)) rows.push({ item })
    return [cell.iso, rows]
  }))
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
        <div data-calendar-view="detailed" className="grid grid-cols-7 overflow-hidden rounded-lg border border-line text-xs">
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
                  // Clip 1px past the padding box so a multi-day bar can cover the divider to the next day.
                  'flex min-h-22 min-w-0 cursor-pointer flex-col gap-0.5 [overflow:clip] [overflow-clip-margin:1px] border-line p-1 transition-colors duration-150 @2xl:min-h-28 @2xl:p-1.5',
                  '[&:not(:nth-child(7n))]:border-r [&:nth-last-child(n+8)]:border-b',
                  active ? 'bg-accent/8 shadow-[inset_0_0_0_1.5px_var(--accent-color)]' : 'hover:bg-hover',
                ].join(' ')}
              >
                <div className={['flex min-w-0 flex-col items-start gap-px @lg:flex-row @lg:items-center @lg:gap-1', cell.inMonth ? '' : 'opacity-40'].join(' ')}>
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
                    <div key={`lane-${index}`} data-calendar-lane className="h-4.5 @2xl:h-5" />
                  ))}
                  {overflow ? (
                    <button
                      type="button"
                      data-calendar-more={cell.iso}
                      onClick={(event) => { event.stopPropagation(); onSelect(cell.iso) }}
                      aria-label={`${hidden}개 더보기`}
                      className="w-full truncate rounded px-1 text-left text-[10px] font-medium leading-4 text-neutral-500 hover:bg-hover hover:text-neutral-800 @2xl:text-[11px]"
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
        'gap-1 rounded px-1 py-px text-[10px] leading-4 @2xl:px-1.5 @2xl:text-[11.5px] @2xl:leading-[18px]',
        // Bars reach through the cell padding and divider so a multi-day event reads as one band.
        segment?.joinLeft ? '-ml-1 @2xl:-ml-1.5' : '',
        segment?.joinRight ? '-mr-[5px] @2xl:-mr-[7px]' : '',
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
