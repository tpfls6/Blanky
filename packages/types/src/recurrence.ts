/** ISO weekdays: Monday=1 ... Sunday=7. Empty weekly days means legacy anchor weekday. */
export function normalizeRepeatDays(value: unknown): number[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 7 || value.some(day => !Number.isInteger(day) || day < 1 || day > 7) || new Set(value).size !== value.length) throw new Error('반복 요일을 확인해 주세요.')
  return [...value].sort((a, b) => a - b)
}
export function isoWeekday(date: string): number { return new Date(`${date}T12:00:00Z`).getUTCDay() || 7 }
export function repeatsOn(row: { date: string; repeat?: string; repeatDays?: number[] }, day: string): boolean {
  if (day < row.date) return false
  if (row.repeat === 'daily') return true
  if (row.repeat === 'weekly') return (normalizeRepeatDays(row.repeatDays).length ? row.repeatDays! : [isoWeekday(row.date)]).includes(isoWeekday(day))
  if (row.repeat === 'monthly') return day.slice(8) === row.date.slice(8)
  return day === row.date
}
