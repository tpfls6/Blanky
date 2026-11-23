import { addDays, formatISODate, parseISODate } from '../../utils/date.ts'
import { calendarDayItems, isHolidayCopy, occursOn } from '../../utils/calendarMonth.ts'
import type { Holiday } from '../../services/holidays/index.ts'
import type { WorkItem, WorkspaceCategory } from '../../types/work.ts'

/** Month-grid helpers shared by the detailed month calendar and the phone calendar home. */

export type Cell = { iso: string; inMonth: boolean; day: number }
export type HolidayMap = Map<string, Holiday[]>

export function colorOf(item: WorkItem, categories: WorkspaceCategory[]): string {
  const category = categories.find((entry) => entry.id === item.categoryId)
  const parent = category?.parentId ? categories.find((entry) => entry.id === category.parentId) : undefined
  return item.calendarColor || category?.color || parent?.color || 'var(--accent-color)'
}

/** Text color that stays readable on a filled label of `color`; undefined for non-hex colors (theme accent). */
export function inkOn(color: string): string | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1]
  if (!hex) return undefined
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
  const [r, g, b] = [0, 2, 4]
    .map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2 ? '#1f2937' : '#ffffff'
}

/** A day's entries without synced copies of the day's holiday (the holiday label already shows it). */
export function visibleItems(items: WorkItem[], iso: string, holidays: HolidayMap): WorkItem[] {
  return calendarDayItems(items, iso).filter((item) => !isHolidayCopy(item, holidays.get(iso)))
}

export function isMultiDay(item: WorkItem): boolean {
  return item.kind === 'event' && !!item.endDate && item.endDate > item.date
}

/** How one day's piece of a multi-day bar meets its neighbours. */
export type Segment = {
  /** The bar continues into the cell on that side (same week row): bridge the gap. */
  joinLeft: boolean
  joinRight: boolean
  /** The bar continues past the week row's edge: square that end off. */
  openLeft: boolean
  openRight: boolean
}

/** A cell row: an entry, or an empty lane that keeps multi-day bars aligned across the week. */
export type Row = { item: WorkItem; segment?: Segment } | null

/**
 * Rows for each day of one week: multi-day events get a lane shared by all their days,
 * so each day's segment lines up into one horizontal bar; other entries follow in day order.
 */
export function weekRows(week: Cell[], byDay: Map<string, WorkItem[]>): Map<string, Row[]> {
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
