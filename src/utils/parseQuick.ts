import { addDays, formatClock, formatISODate, parseClock } from '@blanky/utils'
import type { WorkKind, WorkspaceCategory } from '../types/work.ts'

export type QuickDraft = {
  kind: WorkKind
  title: string
  date: string
  endDate: string | null
  startTime: string | null
  endTime: string | null
  duration: number | null
  dueDate: string | null
  allDay: boolean
  categoryId: string | null
}

const WEEKDAY: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
}

const DATE_PHRASE = String.raw`(?:오늘|내일|모레|(?:이번\s*주|다음\s*주)\s*[일월화수목금토]요일|[일월화수목금토]요일|\d{1,2}\s*월\s*\d{1,2}\s*일)`

type Meridiem = 'am' | 'pm' | 'evening' | 'night'

function mondayOf(date: Date): Date {
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  return addDays(date, offset)
}

function dateOnWeek(monday: Date, weekday: number): Date {
  const offset = weekday === 0 ? 6 : weekday - 1
  return addDays(monday, offset)
}

function parseDatePhrase(phrase: string, today: Date, anchor: Date | null): Date | null {
  const text = phrase.replace(/\s+/g, ' ').trim()
  if (text === '오늘') return today
  if (text === '내일') return addDays(today, 1)
  if (text === '모레') return addDays(today, 2)

  const week = /^(이번 주|다음 주)\s*([일월화수목금토])요일$/.exec(text)
  if (week) {
    const base = week[1] === '다음 주' ? addDays(mondayOf(today), 7) : mondayOf(today)
    return dateOnWeek(base, WEEKDAY[week[2]])
  }

  const bare = /^([일월화수목금토])요일$/.exec(text)
  if (bare) {
    const weekday = WEEKDAY[bare[1]]
    if (anchor) return dateOnWeek(mondayOf(anchor), weekday)
    const delta = (weekday - today.getDay() + 7) % 7
    return addDays(today, delta)
  }

  const monthDay = /^(\d{1,2})월\s*(\d{1,2})일$/.exec(text)
  if (!monthDay) return null
  const month = Number(monthDay[1])
  const day = Number(monthDay[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return new Date(today.getFullYear(), month - 1, day)
}

function readMeridiem(word: string | undefined): Meridiem | null {
  if (word === '오전') return 'am'
  if (word === '오후') return 'pm'
  if (word === '저녁') return 'evening'
  if (word === '밤') return 'night'
  return null
}

function toMinutes(hour: number, minute: number, meridiem: Meridiem | null): number | null {
  let next = hour
  if (meridiem === 'am') {
    if (next === 12) next = 0
    if (next > 11) return null
  } else if (meridiem && next < 12) {
    next += 12
  }
  if (next > 23 || minute > 59 || next < 0) return null
  return next * 60 + minute
}

function takeCategory(
  text: string,
  categories: WorkspaceCategory[],
): { rest: string; categoryId: string | null } {
  let rest = text
  let parentId: string | null = null
  let subId: string | null = null

  const explicit = /([^\s,]+)\s*카테고리|카테고리\s*([^\s,]+)/.exec(rest)
  if (explicit) {
    const name = explicit[1] || explicit[2]
    const found = categories.find((category) => category.name === name)
    if (found) {
      if (found.parentId) {
        subId = found.id
        parentId = found.parentId
      } else {
        parentId = found.id
      }
    }
    rest = rest.replace(explicit[0], ' ')
  }

  const named = [...categories].sort((a, b) => b.name.length - a.name.length)
  for (const category of named) {
    if (!rest.includes(category.name)) continue
    const next = rest.replace(category.name, ' ')
    const remainder = next.replace(/[,\s]+/g, ' ').trim()
    const child = category.parentId !== null
    if (!child && !remainder.includes(' ') && [...remainder].length < 4) continue
    if (child) {
      subId = category.id
      parentId = category.parentId
      if (remainder.length > 0) rest = next
    } else if (!parentId) {
      parentId = category.id
      rest = next
    }
  }

  return { rest, categoryId: subId ?? parentId }
}

export function parseQuick(
  input: string,
  today: Date,
  categories: WorkspaceCategory[],
  kind: WorkKind,
  fallbackDate?: string,
): QuickDraft {
  let rest = input.replace(/\s+/g, ' ').trim()
  const baseDate = fallbackDate ?? formatISODate(today)
  let startTime: string | null = null
  let endTime: string | null = null
  let duration: number | null = null

  const timeRange =
    /(오전|오후|저녁|밤)?\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?\s*부터\s*(오전|오후|저녁|밤)?\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?\s*까지/.exec(
      rest,
    )
  if (timeRange) {
    const first = readMeridiem(timeRange[1])
    const second = readMeridiem(timeRange[4]) ?? first
    const start = toMinutes(Number(timeRange[2]), Number(timeRange[3] ?? 0), first)
    const end = toMinutes(Number(timeRange[5]), Number(timeRange[6] ?? 0), second)
    if (start !== null) startTime = formatClock(start)
    if (end !== null) endTime = formatClock(end)
    if (start !== null && end !== null && end > start) duration = end - start
    rest = rest.replace(timeRange[0], ' ')
  }

  const hourSpan = /(\d+)\s*시간(?:\s*(\d+)\s*분)?/.exec(rest)
  if (hourSpan) {
    duration = Number(hourSpan[1]) * 60 + Number(hourSpan[2] ?? 0)
    rest = rest.replace(hourSpan[0], ' ')
  } else {
    const minuteSpan = /(\d+)\s*분/.exec(rest)
    if (minuteSpan) {
      duration = Number(minuteSpan[1])
      rest = rest.replace(minuteSpan[0], ' ')
    }
  }

  if (!startTime) {
    const one = /(오전|오후|저녁|밤)\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?(?:에는|에)?/.exec(rest)
    if (one) {
      const minutes = toMinutes(Number(one[2]), Number(one[3] ?? 0), readMeridiem(one[1]))
      if (minutes !== null) startTime = formatClock(minutes)
      rest = rest.replace(one[0], ' ')
    }
  }

  if (startTime && !endTime && duration && duration > 0) {
    const start = parseClock(startTime)
    if (start !== null) endTime = formatClock(Math.min(start + duration, 23 * 60 + 59))
  }

  let startDate: string | null = null
  let rangeEnd: string | null = null
  const range = new RegExp(
    `(${DATE_PHRASE})\\s*부터\\s*(?:시작해서\\s*)?(${DATE_PHRASE})\\s*까지`,
  ).exec(rest)
  if (range) {
    const start = parseDatePhrase(range[1], today, null)
    let end = start ? parseDatePhrase(range[2], today, start) : null
    if (start && end && end < start) end = addDays(end, 7)
    if (start) startDate = formatISODate(start)
    if (end) rangeEnd = formatISODate(end)
    rest = rest.replace(range[0], ' ')
  }

  if (!startDate && !rangeEnd) {
    const deadline = new RegExp(`(${DATE_PHRASE})\\s*까지`).exec(rest)
    if (deadline) {
      const date = parseDatePhrase(deadline[1], today, null)
      if (date) rangeEnd = formatISODate(date)
      rest = rest.replace(deadline[0], ' ')
    }
  }

  if (!startDate) {
    const single = new RegExp(DATE_PHRASE).exec(rest)
    if (single) {
      const date = parseDatePhrase(single[0], today, null)
      if (date) startDate = formatISODate(date)
      rest = rest.replace(single[0], ' ')
    }
  }

  const category = takeCategory(rest, categories)
  rest = category.rest
  const title = rest
    .replace(/[,\s]+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim()

  const date = startDate ?? (rangeEnd && kind === 'task' ? rangeEnd : baseDate)
  const task = kind === 'task'
  const dueDate =
    task && rangeEnd && rangeEnd !== (startDate ?? '')
      ? rangeEnd
      : task && rangeEnd && !startDate
        ? rangeEnd
        : null

  return {
    kind,
    title: title || (task ? '할 일' : '일정'),
    date,
    endDate: !task && rangeEnd && rangeEnd !== date ? rangeEnd : null,
    startTime,
    endTime: startTime ? endTime : null,
    duration,
    dueDate,
    allDay: !task && !startTime,
    categoryId: category.categoryId,
  }
}
