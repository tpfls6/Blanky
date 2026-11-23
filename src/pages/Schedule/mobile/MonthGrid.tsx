import { useMemo, type CSSProperties, type KeyboardEvent } from 'react'
import { colorOf, inkOn, isMultiDay, visibleItems, weekRows, type Cell, type HolidayMap, type Row } from '../../../components/schedule/calendarRows.ts'
import { useI18n } from '../../../i18n/useI18n.ts'
import { parseISODate } from '../../../utils/date.ts'
import type { WorkItem, WorkspaceCategory } from '../../../types/work.ts'

/** Rows a cell holds; past this, the last row becomes "+N". */
const VISIBLE_ROWS = 3
const MAX_DOTS = 4

/**
 * Phone month grid: six week rows filling the screen. Full mode shows event bars (multi-day bars
 * joined across the week) and task lines; with the day sheet open the CSS swaps them for dots,
 * and at the full snap only the selected week row stays.
 */
export function MonthGrid({ cells, items, categories, holidays, selected, today, slide, onPick }: {
  cells: Cell[]
  items: WorkItem[]
  categories: WorkspaceCategory[]
  holidays: HolidayMap
  selected: string
  today: string
  slide: 'left' | 'right' | null
  onPick: (iso: string) => void
}) {
  const { t } = useI18n()
  // Events before tasks, so a busy day's bars show first and its tasks fold into +N.
  const byDay = useMemo(() => new Map(cells.map((cell) => [cell.iso, visibleItems(items, cell.iso, holidays).sort((x, y) => Number(x.kind === 'task') - Number(y.kind === 'task'))])), [cells, items, holidays])
  const rowsByDay = useMemo(() => {
    const rows = new Map<string, Row[]>()
    for (let start = 0; start < cells.length; start += 7) {
      for (const [iso, dayRows] of weekRows(cells.slice(start, start + 7), byDay)) rows.set(iso, dayRows)
    }
    return rows
  }, [cells, byDay])

  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))
  const onKey = (event: KeyboardEvent, iso: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onPick(iso)
  }

  return (
    <div className="mcal-grid" data-theme-slot="calendar" data-slide={slide ?? undefined} role="group" aria-label={t('schedule.mobile.monthGrid')}>
      {weeks.map((week) => (
        <div key={week[0].iso} className="mcal-row" data-selected-week={week.some((cell) => cell.iso === selected) || undefined}>
          {week.map((cell) => {
            const date = parseISODate(cell.iso)
            const dow = date.getDay()
            const entries = byDay.get(cell.iso) ?? []
            const rows = rowsByDay.get(cell.iso) ?? []
            const dayHolidays = holidays.get(cell.iso)
            const events = entries.filter((item) => item.kind === 'event')
            const tasks = entries.filter((item) => item.kind === 'task')
            const overflow = rows.length > VISIBLE_ROWS
            const shown = overflow ? rows.slice(0, VISIBLE_ROWS - 1) : rows
            const hidden = entries.length - shown.filter(Boolean).length
            const dots = [
              ...events.map((item) => ({ id: item.id, color: colorOf(item, categories), todo: false })),
              ...tasks.filter((item) => item.status !== 'done').map((item) => ({ id: item.id, color: '', todo: true })),
            ].slice(0, MAX_DOTS)
            const label = [
              t('schedule.mobile.cellLabel', { month: date.getMonth() + 1, day: cell.day, weekday: t(`schedule.mobile.dowLong.${dow}`), events: events.length, tasks: tasks.length }),
              ...(dayHolidays ?? []).map((holiday) => holiday.name),
            ].join(', ')
            const numberTone = dayHolidays || dow === 0 ? 'cal-holiday' : dow === 6 ? 'mcal-sat' : ''
            return (
              <div key={cell.iso} role="button" className="mcal-cell" data-calendar-cell={cell.iso} data-other={cell.inMonth ? undefined : ''}
                tabIndex={0} aria-label={label} aria-pressed={cell.iso === selected} aria-current={cell.iso === today ? 'date' : undefined}
                title={dayHolidays?.map((holiday) => holiday.name).join(', ')}
                onClick={() => onPick(cell.iso)} onKeyDown={(event) => onKey(event, cell.iso)}>
                <span className={`mcal-num ${numberTone}`} aria-hidden="true">{cell.day}</span>
                <div className="mcal-items" aria-hidden="true">
                  {shown.map((row, index) => row ? <Entry key={row.item.id} row={row} color={colorOf(row.item, categories)} /> : <div key={`lane-${index}`} className="mcal-lane" />)}
                  {overflow ? <div className="mcal-more">+{hidden}</div> : null}
                </div>
                <div className="mcal-dots" aria-hidden="true">
                  {dots.map((dot) => <i key={dot.id} className="mcal-dot" data-todo={dot.todo || undefined} style={dot.todo ? undefined : { '--cal-color': dot.color } as CSSProperties} />)}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function Entry({ row, color }: { row: NonNullable<Row>; color: string }) {
  const { item, segment } = row
  if (item.kind === 'task') return <div className="mcal-it mcal-td" data-done={item.status === 'done' || undefined}>{item.title}</div>
  const multi = isMultiDay(item)
  const ink = multi ? inkOn(color) : undefined
  const span = segment ? [segment.openLeft ? '' : 'start', segment.openRight ? '' : 'end', 'bar'].filter(Boolean).join(' ') : undefined
  return (
    <div className="mcal-it mcal-ev" data-span={multi ? span : undefined} style={{ '--cal-color': color, ...(ink ? { '--cal-ink': ink } : {}) } as CSSProperties}>
      {/* Continuation pieces keep the bar but only the first piece in a week row shows the title. */}
      {segment?.joinLeft ? ' ' : item.title}
    </div>
  )
}
