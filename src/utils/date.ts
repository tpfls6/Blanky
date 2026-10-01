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

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

export function koreanLongDate(iso: string): string {
  const date = parseISODate(iso)
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY[date.getDay()]}요일`
}

export function koreanMonth(isoMonth: string): string {
  const [year, month] = isoMonth.split('-')
  return `${year}년 ${Number(month)}월`
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
