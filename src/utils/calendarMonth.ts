import { repeatsOn } from '../../packages/types/src/recurrence.ts'
import type { WorkItem } from '../types/work.ts'

export function occursOn(item: WorkItem, date: string): boolean {
  if (item.kind === 'task') return (!item.undated && repeatsOn(item, date)) || item.dueDate === date
  const end = item.endDate && item.endDate >= item.date ? item.endDate : item.date
  const span = Math.round((Date.parse(end) - Date.parse(item.date)) / 86400000)
  if (!item.repeat || item.repeat === 'none') return item.date <= date && date <= end
  // Include an occurrence's multi-day tail, without generating duplicate DB rows.
  for (let offset = 0; offset <= Math.min(span, 366); offset++) {
    const anchor = new Date(Date.parse(date) - offset * 86400000).toISOString().slice(0, 10)
    if (repeatsOn(item, anchor)) return true
  }
  return false
}

/** Start label for a month-calendar entry: event start, else task due time, else null (all-day / untimed). */
export function calendarTime(item: WorkItem): string | null {
  if (item.allDay) return null
  return item.startTime ?? (item.kind === 'task' ? item.dueTime ?? null : null)
}

/**
 * Items shown in one month-calendar cell: recurring items expand like one-offs,
 * repeated rows (same id, or a synced copy with the same title and times) appear once,
 * untimed entries first, then by time.
 */
export function calendarDayItems(items: WorkItem[], date: string): WorkItem[] {
  const seen = new Set<string>()
  const day: WorkItem[] = []
  for (const item of items) {
    if (!occursOn(item, date)) continue
    const signature = [item.kind, item.title.trim().toLowerCase(), calendarTime(item) ?? '', item.endTime ?? ''].join('|')
    if (seen.has(item.id) || seen.has(signature)) continue
    seen.add(item.id)
    seen.add(signature)
    day.push(item)
  }
  return day.sort((left, right) => {
    const a = calendarTime(left)
    const b = calendarTime(right)
    if (!a !== !b) return a ? 1 : -1
    return (a ?? '').localeCompare(b ?? '') || left.title.localeCompare(right.title)
  })
}

type HolidayName = { name: string; kind: 'public' | 'substitute' | 'temporary' }

function holidayToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/\(.*?\)/g, '').replace(/연휴$/, '')
}

/**
 * An all-day event that only restates the day's holiday (e.g. a synced "추석" from a holiday
 * calendar). The holiday label already shows it, so the copy is hidden from the month view.
 */
export function isHolidayCopy(item: WorkItem, holidays: readonly HolidayName[] | undefined): boolean {
  if (!holidays?.length || item.kind !== 'event' || calendarTime(item)) return false
  const title = holidayToken(item.title)
  if (!title) return false
  return holidays.some((holiday) => holidayToken(holiday.name) === title
    || (holiday.kind === 'substitute' && title.startsWith('대체') && title.includes('휴일')))
}
