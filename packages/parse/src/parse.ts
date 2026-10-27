import { addDays, formatISODate } from '../../utils/src/date.ts'
import type {
  CategoryRef,
  LearnedRule,
  ParseContext,
  ParsedSchedule,
  RecordFieldHint,
  RecordSchema,
  ScheduleKind,
} from './model.ts'

const WEEKDAY: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
}

const DATE_PHRASE = String.raw`(?:오늘|내일|모레|주말|(?:이번\s*주|다음\s*주)\s*[일월화수목금토]요일|(?:이번\s*주|다음\s*주)(?!\s*[일월화수목금토])|[일월화수목금토]요일|\d{1,2}\s*월\s*\d{1,2}\s*일)`
const MERIDIEM = String.raw`오전|오후|저녁|밤`
const MINUTE = String.raw`(?:\s*(?:반|(\d{1,2})\s*분))?`
const KO_TIME = String.raw`(${MERIDIEM})?\s*(\d{1,2})\s*시(?!간)${MINUTE}`
const CLOCK = String.raw`(\d{1,2}):(\d{2})`
const TIME_RANGE = new RegExp(
  `(?:(${MERIDIEM})\\s*)?(?:${CLOCK}|(\\d{1,2})\\s*시(?!간)(?:\\s*(?:반|(\\d{1,2})\\s*분))?)\\s*부터\\s*(?:(${MERIDIEM})\\s*)?(?:${CLOCK}|(\\d{1,2})\\s*시(?!간)(?:\\s*(?:반|(\\d{1,2})\\s*분))?)\\s*까지`,
)

const EVENT_HINTS: ReadonlyArray<readonly [string, number]> = [
  ['회의', 1],
  ['약속', 1],
  ['수업', 1],
  ['병원', 1],
  ['미팅', 1],
  ['식사', 0.8],
  ['점심', 0.8],
  ['운동', 0.8],
]

const TASK_HINTS: ReadonlyArray<readonly [string, number]> = [
  ['하기', 1],
  ['작성', 1],
  ['정리', 1],
  ['제출', 1],
  ['공부', 1],
  ['읽기', 1],
  ['완료', 1],
  ['마감', 1],
  ['완성', 1],
  ['수정', 1],
  ['문제', 0.6],
]

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
  if (next > 23 || minute > 59 || next < 0 || minute < 0) return null
  return next * 60 + minute
}

function formatClock(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function minuteValue(half: boolean, digits: string | undefined): number {
  if (half) return 30
  return digits ? Number(digits) : 0
}

function parseDatePhrase(phrase: string, today: Date, anchor: Date | null): Date | null {
  const text = phrase.replace(/\s+/g, ' ').trim()
  if (text === '오늘') return today
  if (text === '내일') return addDays(today, 1)
  if (text === '모레') return addDays(today, 2)
  if (text === '주말') {
    const day = today.getDay()
    if (day === 0 || day === 6) return today
    return addDays(today, 6 - day)
  }
  if (text === '이번 주') return mondayOf(today)
  if (text === '다음 주') return addDays(mondayOf(today), 7)

  const week = /^(이번 주|다음 주)\s*([일월화수목금토])요일$/.exec(text)
  if (week) {
    const base = week[1] === '다음 주' ? addDays(mondayOf(today), 7) : mondayOf(today)
    return dateOnWeek(base, WEEKDAY[week[2]] ?? 1)
  }

  const bare = /^([일월화수목금토])요일$/.exec(text)
  if (bare) {
    const weekday = WEEKDAY[bare[1]] ?? 0
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

export function parseKoreanDate(text: string, today: Date, anchor: Date | null = null): string | null {
  const match = new RegExp(DATE_PHRASE).exec(text)
  if (!match) return null
  const date = parseDatePhrase(match[0], today, anchor)
  return date ? formatISODate(date) : null
}

function clockFromMatch(meridiem: string | undefined, hour: string | undefined, minute: string | undefined, half: boolean, inherited: Meridiem | null): number | null {
  if (!hour) return null
  return toMinutes(Number(hour), minuteValue(half, minute), readMeridiem(meridiem) ?? inherited)
}

export function parseKoreanTime(text: string): { startTime: string | null; endTime: string | null } | null {
  const range = TIME_RANGE.exec(text)
  if (range) {
    const firstHalf = range[0].slice(0, range[0].indexOf('부터')).includes('반')
    const secondHalf = range[0].slice(range[0].indexOf('부터')).includes('반')
    const firstMeridiem = readMeridiem(range[1])
    const start = range[2] && range[3]
      ? toMinutes(Number(range[2]), Number(range[3]), firstMeridiem)
      : clockFromMatch(range[1], range[4], range[5], firstHalf && !range[5], null)
    const secondMeridiem = readMeridiem(range[6]) ?? firstMeridiem
    const end = range[7] && range[8]
      ? toMinutes(Number(range[7]), Number(range[8]), secondMeridiem)
      : clockFromMatch(range[6], range[9], range[10], secondHalf && !range[10], firstMeridiem)
    if (start === null && end === null) return null
    return {
      startTime: start === null ? null : formatClock(start),
      endTime: end === null ? null : formatClock(end),
    }
  }

  const clock = new RegExp(`(?<![\\d:])${CLOCK}(?![\\d:])`).exec(text)
  if (clock) {
    const minutes = toMinutes(Number(clock[1]), Number(clock[2]), null)
    return minutes === null ? null : { startTime: formatClock(minutes), endTime: null }
  }

  const one = new RegExp(KO_TIME).exec(text)
  if (!one) return null
  const half = one[0].includes('반')
  const minutes = toMinutes(Number(one[2]), minuteValue(half, one[3]), readMeridiem(one[1]))
  return minutes === null ? null : { startTime: formatClock(minutes), endTime: null }
}

export function parseDateRange(text: string, today: Date): { start: string; end: string } | null {
  const range = new RegExp(`(${DATE_PHRASE})\\s*부터\\s*(?:시작해서\\s*)?(${DATE_PHRASE})\\s*까지`).exec(text)
  if (!range) return null
  const start = parseDatePhrase(range[1] ?? '', today, null)
  if (!start) return null
  let end = parseDatePhrase(range[2] ?? '', today, start)
  if (!end) return null
  if (end < start) end = addDays(end, 7)
  return { start: formatISODate(start), end: formatISODate(end) }
}

export function parseDueDate(text: string, today: Date): string | null {
  const withoutTime = text.replace(TIME_RANGE, ' ')
  const deadline = new RegExp(`(${DATE_PHRASE})\\s*까지`).exec(withoutTime)
  if (!deadline) return null
  const date = parseDatePhrase(deadline[1] ?? '', today, null)
  return date ? formatISODate(date) : null
}

export function parseDuration(text: string): number | null {
  const withoutTime = text.replace(TIME_RANGE, ' ').replace(new RegExp(KO_TIME, 'g'), ' ').replace(new RegExp(CLOCK, 'g'), ' ')
  const normalized = withoutTime.replace(/한\s*시간/g, '1시간')
  const hourSpan = /(\d+)\s*시간(?:\s*(\d+)\s*분)?/.exec(normalized)
  if (hourSpan) return Number(hourSpan[1]) * 60 + Number(hourSpan[2] ?? 0)
  const minuteSpan = /(\d+)\s*분/.exec(normalized)
  if (minuteSpan) return Number(minuteSpan[1])
  return null
}

function scoreHints(text: string, hints: ReadonlyArray<readonly [string, number]>): number {
  let score = 0
  for (const [word, weight] of hints) {
    if (text.includes(word)) score += weight
  }
  return score
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function confidenceFor(
  eventScore: number,
  taskScore: number,
  hasDate: boolean,
  hasTime: boolean,
  hasRange: boolean,
  personal: boolean,
): number {
  let confidence = 0.5
  if (hasDate) confidence += 0.15
  if (hasTime) confidence += 0.15
  if (hasRange) confidence += 0.05
  if (personal) confidence += 0.2
  const gap = Math.abs(eventScore - taskScore)
  if (gap >= 1) confidence += 0.2
  else if (gap >= 0.5) confidence += 0.08
  else confidence -= 0.08
  return clamp(Number(confidence.toFixed(2)), 0.2, 0.97)
}

function matchCategory(text: string, categories: CategoryRef[]): string | null {
  const named = [...categories].sort(
    (a, b) => b.name.length - a.name.length || Number(Boolean(b.parentId)) - Number(Boolean(a.parentId)),
  )
  for (const category of named) {
    if (category.name && text.includes(category.name)) return category.id
  }
  return null
}

function applyRules(text: string, rules: LearnedRule[]): {
  eventScore: number
  taskScore: number
  categoryId: string | null
  personal: boolean
} {
  let eventScore = 0
  let taskScore = 0
  let categoryId: string | null = null
  let personal = false
  const ordered = [...rules].sort((a, b) => b.weight - a.weight || b.pattern.length - a.pattern.length)
  for (const rule of ordered) {
    if (!rule.pattern || !text.includes(rule.pattern)) continue
    personal = true
    if (rule.targetType === 'event') eventScore += rule.weight
    if (rule.targetType === 'task') taskScore += rule.weight
    if (rule.categoryId && !categoryId) categoryId = rule.categoryId
  }
  return { eventScore, taskScore, categoryId, personal }
}

function flattenFields(blocks: RecordFieldHint[] | undefined, out: RecordFieldHint[]) {
  for (const block of blocks ?? []) {
    out.push(block)
    if (block.children) flattenFields(block.children, out)
  }
}

export function extractRecordFields(text: string, schema: RecordSchema): Record<string, string | number> | null {
  const fields: RecordFieldHint[] = []
  flattenFields(schema.blocks, fields)
  if (fields.length === 0) return null
  const values: Record<string, string | number> = {}
  const kg = /(\d+(?:\.\d+)?)\s*kg/i.exec(text)
  const reps = /(\d+)\s*회/.exec(text)
  const sets = /(\d+)\s*세트/.exec(text)
  for (const field of fields) {
    const key = field.fieldKey
    const label = field.label ?? ''
    if (!key) continue
    if (kg && (label.includes('무게') || label.toLowerCase().includes('weight'))) values[key] = Number(kg[1])
    else if (reps && label.includes('횟수')) values[key] = Number(reps[1])
    else if (sets && label.includes('세트')) values[key] = Number(sets[1])
    else if (label.includes('운동') && (field.type === 'text' || field.type === 'textField' || !field.type)) {
      const name = text.replace(/\d+(?:\.\d+)?\s*(?:kg|회|세트)/gi, ' ').replace(/\s+/g, ' ').trim()
      if (name) values[key] = name
    }
  }
  return Object.keys(values).length > 0 ? values : null
}

function chooseKind(eventScore: number, taskScore: number, hasTime: boolean, hasDue: boolean, hasParsedDate: boolean): ScheduleKind {
  if (hasDue || taskScore > eventScore) return 'task'
  if (eventScore > taskScore) return 'event'
  if (hasTime) return 'event'
  if (hasParsedDate && taskScore === 0) return 'event'
  return 'task'
}

export function parseScheduleText(text: string, context: ParseContext): ParsedSchedule {
  const today = context.today
  let rest = text.replace(/\s+/g, ' ').trim().replace(/한\s*시간/g, '1시간')
  const original = rest

  let startTime: string | null = null
  let endTime: string | null = null
  const time = parseKoreanTime(rest)
  if (time?.startTime || time?.endTime) {
    startTime = time.startTime
    endTime = time.endTime
    const range = TIME_RANGE.exec(rest)
    if (range) rest = rest.replace(range[0], ' ')
    else {
      const clock = new RegExp(`(?<![\\d:])${CLOCK}(?![\\d:])`).exec(rest)
      if (clock && startTime === `${clock[1].padStart(2, '0')}:${clock[2]}`) rest = rest.replace(clock[0], ' ')
      else {
        const one = new RegExp(`${KO_TIME}(?:에는|에)?`).exec(rest)
        if (one) rest = rest.replace(one[0], ' ')
      }
    }
  }

  const duration = parseDuration(original)
  if (duration) {
    const hourSpan = /(\d+)\s*시간(?:\s*(\d+)\s*분)?/.exec(rest)
    if (hourSpan) rest = rest.replace(hourSpan[0], ' ')
    else {
      const minuteSpan = /(\d+)\s*분/.exec(rest)
      if (minuteSpan) rest = rest.replace(minuteSpan[0], ' ')
    }
  }
  if (startTime && !endTime && duration && duration > 0) {
    const [hour, minute] = startTime.split(':').map(Number)
    const start = (hour ?? 0) * 60 + (minute ?? 0)
    endTime = formatClock(Math.min(start + duration, 23 * 60 + 59))
  }

  let date: string | null = null
  let endDate: string | null = null
  let dueDate: string | null = null
  const span = parseDateRange(rest, today)
  if (span) {
    date = span.start
    endDate = span.end
    const range = new RegExp(`(${DATE_PHRASE})\\s*부터\\s*(?:시작해서\\s*)?(${DATE_PHRASE})\\s*까지`).exec(rest)
    if (range) rest = rest.replace(range[0], ' ')
  } else {
    dueDate = parseDueDate(rest, today)
    if (dueDate) {
      const deadline = new RegExp(`(${DATE_PHRASE})\\s*까지`).exec(rest)
      if (deadline) rest = rest.replace(deadline[0], ' ')
    }
    if (!date) {
      const single = new RegExp(DATE_PHRASE).exec(rest)
      if (single) {
        date = parseKoreanDate(single[0], today, null)
        rest = rest.replace(single[0], ' ')
      }
    }
  }

  rest = rest.replace(/[^\s,]+\s*카테고리|카테고리\s*[^\s,]+/g, ' ')
  const title = rest.replace(/[,\s]+/g, ' ').trim()

  const hintedEvent = scoreHints(original, EVENT_HINTS)
  const hintedTask = scoreHints(original, TASK_HINTS)
  const learned = applyRules(original, context.rules ?? [])
  const eventScore = hintedEvent + learned.eventScore
  const taskScore = hintedTask + learned.taskScore
  const hasTime = Boolean(startTime)
  const type = chooseKind(eventScore, taskScore, hasTime, Boolean(dueDate), Boolean(date))
  const hasDate = Boolean(date || dueDate || endDate)
  const categoryId = learned.categoryId ?? matchCategory(original, context.categories ?? [])
  const resolvedDate = date ?? (dueDate && type === 'task' ? dueDate : null) ?? context.fallbackDate ?? formatISODate(today)
  let confidence = confidenceFor(eventScore, taskScore, hasDate, hasTime, Boolean(endTime && startTime), learned.personal)
  if (title && (date || dueDate || taskScore >= 1 || eventScore >= 1)) confidence = Math.max(confidence, 0.8)

  const fields = context.recordSchema ? extractRecordFields(original, context.recordSchema) : null
  return {
    type,
    confidence,
    source: learned.personal ? 'personal_rule' : 'rule',
    draft: {
      title: title || (type === 'task' ? '할 일' : '일정'),
      date: resolvedDate,
      startTime,
      endTime,
      dueDate: type === 'task' ? dueDate ?? (endDate && endDate !== resolvedDate ? endDate : null) : null,
      endDate: type === 'event' && endDate && endDate !== resolvedDate ? endDate : null,
      categoryId,
    },
    ...(fields ? { fields } : {}),
  }
}
