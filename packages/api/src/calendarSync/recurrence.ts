import { isoWeekday, normalizeRepeatDays, normalizeRepeatInterval } from '../../../types/src/recurrence.ts'
import { asDateStr, asIsoWeekday, type DateStr, type IsoWeekday, type PeerWhen, type Recurrence } from '../../../types/src/calendarSync.ts'

const BYDAY_TO_ISO: Record<string, IsoWeekday> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
}

const ISO_TO_BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

function weekdays(days: readonly number[]): readonly [IsoWeekday, ...IsoWeekday[]] {
  const unique = [...new Set(days.map(asIsoWeekday))].sort((left, right) => left - right)
  if (unique.length === 0) throw new Error('반복 요일을 확인해 주세요.')
  return [unique[0], ...unique.slice(1)]
}

export function parseRecurrenceFromSchedule(row: {
  date: string
  repeat?: string
  repeatDays?: number[]
  repeatUntil?: string | null
  repeatInterval?: number
}): Recurrence {
  // `interval` is present only when it is not 1, so plain rules compare equal to rows synced before it existed.
  const every = normalizeRepeatInterval(row.repeatInterval)
  const until = { ...(row.repeatUntil ? { until: asDateStr(row.repeatUntil) } : {}), ...(every > 1 ? { interval: every } : {}) }
  if (row.repeat === 'daily') return { freq: 'daily', ...until }
  if (row.repeat === 'monthly') return { freq: 'monthly', ...until }
  if (row.repeat === 'weekly') {
    const days = normalizeRepeatDays(row.repeatDays)
    return { freq: 'weekly', days: weekdays(days.length ? days : [isoWeekday(row.date)]), ...until }
  }
  return { freq: 'none' }
}

/** Placement of the series, needed because RFC 5545 UNTIL is UTC for timed events. */
export type RecurrenceContext = { when: PeerWhen; timeZone: string }

function zonedParts(ms: number, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return { date: `${read('year')}-${read('month')}-${read('day')}`, time: `${read('hour')}:${read('minute')}:${read('second')}` }
}

/** UTC instant of a wall clock in `timeZone`; the second pass settles DST offsets. */
function zonedToUtc(date: string, time: string, timeZone: string): number {
  const wanted = Date.parse(`${date}T${time}Z`)
  let utc = wanted
  for (let pass = 0; pass < 2; pass++) {
    const shown = zonedParts(utc, timeZone)
    utc += wanted - Date.parse(`${shown.date}T${shown.time}Z`)
  }
  return utc
}

function shiftDate(value: string, days: number): string {
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}

function untilRule(until: DateStr, context?: Pick<RecurrenceContext, 'timeZone'> & { allDay: boolean }): string {
  if (!context || context.allDay) return `;UNTIL=${until.replaceAll('-', '')}`
  // The whole last local day is included, whatever the start time.
  const stamp = new Date(zonedToUtc(until, '23:59:59', context.timeZone)).toISOString()
  return `;UNTIL=${stamp.slice(0, 19).replace(/[-:]/g, '')}Z`
}

/** Last local start date allowed by an RRULE UNTIL, or null when unreadable. */
function untilFromGoogle(raw: string, context?: RecurrenceContext): DateStr | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(raw)
  if (!match) return null
  const date = `${match[1]}-${match[2]}-${match[3]}`
  const noon = Date.parse(`${date}T12:00:00Z`)
  if (Number.isNaN(noon) || new Date(noon).toISOString().slice(0, 10) !== date) return null
  if (!match[4]) return asDateStr(date)
  const time = `${match[4]}:${match[5]}:${match[6]}`
  const local = match[7] && context ? zonedParts(Date.parse(`${date}T${time}Z`), context.timeZone) : { date, time }
  // A timed occurrence on the UNTIL day is kept only if it starts at or before the UNTIL instant.
  if (context && !context.when.allDay && `${context.when.startTime}:00` > local.time) return asDateStr(shiftDate(local.date, -1))
  return asDateStr(local.date)
}

function parseRrule(value: string): Map<string, string> | null {
  const body = value.startsWith('RRULE:') ? value.slice(6) : value.startsWith('RRULE') ? null : value
  if (body === null || body.includes(':')) return null
  const parts = new Map<string, string>()
  for (const part of body.split(';')) {
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq <= 0) return null
    const key = part.slice(0, eq).toUpperCase()
    const raw = part.slice(eq + 1)
    if (!raw || parts.has(key)) return null
    parts.set(key, raw)
  }
  return parts
}

export function parseGoogleRecurrence(rrule: readonly string[], context?: RecurrenceContext): Recurrence | { kind: 'unsupported' } {
  if (rrule.length === 0) return { freq: 'none' }
  if (rrule.some((line) => /^(EXDATE|RDATE)/i.test(line))) return { kind: 'unsupported' }
  const rules = rrule.filter((line) => /^RRULE(?::|$)/i.test(line) || (!line.includes(':') && /FREQ=/i.test(line)))
  if (rules.length !== 1 || rules.length !== rrule.length) return { kind: 'unsupported' }
  const parts = parseRrule(rules[0])
  if (!parts) return { kind: 'unsupported' }
  const freq = parts.get('FREQ')?.toUpperCase()
  const rawInterval = parts.get('INTERVAL') ?? '1'
  const interval = /^\d{1,2}$/.test(rawInterval) ? Number(rawInterval) : 0
  if (interval < 1) return { kind: 'unsupported' }
  if (parts.has('COUNT')) return { kind: 'unsupported' }
  // WKST changes which weeks count once INTERVAL > 1; Blanky counts Monday-start weeks (the RFC 5545 default).
  if (interval > 1 && freq === 'WEEKLY' && (parts.get('WKST') ?? 'MO').toUpperCase() !== 'MO') return { kind: 'unsupported' }
  const keys = [...parts.keys()].filter((key) => !['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'WKST'].includes(key))
  if (keys.length > 0) return { kind: 'unsupported' }
  let until: { until?: DateStr; interval?: number } = {}
  const rawUntil = parts.get('UNTIL')
  if (rawUntil) {
    const date = untilFromGoogle(rawUntil.toUpperCase(), context)
    // An end before the first start has no occurrences Blanky could store.
    if (!date || (context && date < context.when.date)) return { kind: 'unsupported' }
    until = { until: date }
  }
  if (interval > 1) until = { ...until, interval }
  if (freq === 'DAILY') {
    if (parts.has('BYDAY')) return { kind: 'unsupported' }
    return { freq: 'daily', ...until }
  }
  if (freq === 'MONTHLY') {
    if (parts.has('BYDAY')) return { kind: 'unsupported' }
    return { freq: 'monthly', ...until }
  }
  if (freq === 'WEEKLY') {
    const byday = parts.get('BYDAY')
    if (!byday) return { kind: 'unsupported' }
    const days: IsoWeekday[] = []
    for (const token of byday.split(',')) {
      const iso = BYDAY_TO_ISO[token.trim().toUpperCase()]
      if (!iso) return { kind: 'unsupported' }
      days.push(iso)
    }
    try {
      return { freq: 'weekly', days: weekdays(days), ...until }
    } catch {
      return { kind: 'unsupported' }
    }
  }
  return { kind: 'unsupported' }
}

export function toGoogleRrule(recurrence: Recurrence, context?: { allDay: boolean; timeZone: string }): string[] {
  if (recurrence.freq === 'none') return []
  const until = (recurrence.interval && recurrence.interval > 1 ? `;INTERVAL=${recurrence.interval}` : '') + (recurrence.until ? untilRule(recurrence.until, context) : '')
  if (recurrence.freq === 'daily') return [`RRULE:FREQ=DAILY${until}`]
  if (recurrence.freq === 'monthly') return [`RRULE:FREQ=MONTHLY${until}`]
  const days = recurrence.days.map((day) => ISO_TO_BYDAY[day - 1]).join(',')
  return [`RRULE:FREQ=WEEKLY;BYDAY=${days}${until}`]
}
