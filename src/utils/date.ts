import { addDays, formatISODate } from '@blanky/utils'

export { addDays, formatISODate }

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function todayISO(): string {
  return formatISODate(new Date())
}

export function tomorrowISO(): string {
  return formatISODate(addDays(new Date(), 1))
}

export function longDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function monthDay(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  })
}

export function monthTitle(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${month}/${day}`
}

export function daySpan(start: string, end: string): number {
  const ms = parseISODate(end).getTime() - parseISODate(start).getTime()
  return Math.round(ms / 86400000)
}

export function shiftISO(iso: string, days: number): string {
  return formatISODate(addDays(parseISODate(iso), days))
}
