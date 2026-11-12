/** ISO weekdays: Monday=1 ... Sunday=7. Empty weekly days means legacy anchor weekday. */
export function normalizeRepeatDays(value: unknown): number[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 7 || value.some(day => !Number.isInteger(day) || day < 1 || day > 7) || new Set(value).size !== value.length) throw new Error('반복 요일을 확인해 주세요.')
  return [...value].sort((a, b) => a - b)
}
/** Every N days/weeks/months; anything missing or invalid reads as 1. */
export function normalizeRepeatInterval(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99 ? value : 1
}
export function isoWeekday(date: string): number { return new Date(`${date}T12:00:00Z`).getUTCDay() || 7 }
const DAY = 86400000
function dayNumber(date: string): number { return Math.round(Date.parse(`${date}T12:00:00Z`) / DAY) }
/** `repeatUntil` is the last day a series may occur on; null/absent repeats forever. `repeatInterval` counts from `date`. */
export function repeatsOn(row: { date: string; repeat?: string; repeatDays?: number[]; repeatUntil?: string | null; repeatInterval?: number }, day: string): boolean {
  if (day < row.date) return false
  if (row.repeat && row.repeat !== 'none' && row.repeatUntil && day > row.repeatUntil) return false
  const every = normalizeRepeatInterval(row.repeatInterval)
  if (row.repeat === 'daily') return (dayNumber(day) - dayNumber(row.date)) % every === 0
  if (row.repeat === 'weekly') {
    // Weeks run Monday to Sunday; the start date's week is week 0.
    const weeks = Math.floor((dayNumber(day) - isoWeekday(day) - (dayNumber(row.date) - isoWeekday(row.date))) / 7)
    return weeks % every === 0 && (normalizeRepeatDays(row.repeatDays).length ? row.repeatDays! : [isoWeekday(row.date)]).includes(isoWeekday(day))
  }
  if (row.repeat === 'monthly') {
    const months = (Number(day.slice(0, 4)) - Number(row.date.slice(0, 4))) * 12 + Number(day.slice(5, 7)) - Number(row.date.slice(5, 7))
    return months % every === 0 && day.slice(8) === row.date.slice(8)
  }
  return day === row.date
}
