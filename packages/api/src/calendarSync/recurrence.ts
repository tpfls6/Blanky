import { isoWeekday, normalizeRepeatDays } from '../../../types/src/recurrence.ts'
import { asIsoWeekday, type IsoWeekday, type Recurrence } from '../../../types/src/calendarSync.ts'

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
}): Recurrence {
  if (row.repeat === 'daily') return { freq: 'daily' }
  if (row.repeat === 'monthly') return { freq: 'monthly' }
  if (row.repeat === 'weekly') {
    const days = normalizeRepeatDays(row.repeatDays)
    return { freq: 'weekly', days: weekdays(days.length ? days : [isoWeekday(row.date)]) }
  }
  return { freq: 'none' }
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

export function parseGoogleRecurrence(rrule: readonly string[]): Recurrence | { kind: 'unsupported' } {
  if (rrule.length === 0) return { freq: 'none' }
  if (rrule.some((line) => /^(EXDATE|RDATE)/i.test(line))) return { kind: 'unsupported' }
  const rules = rrule.filter((line) => /^RRULE(?::|$)/i.test(line) || (!line.includes(':') && /FREQ=/i.test(line)))
  if (rules.length !== 1 || rules.length !== rrule.length) return { kind: 'unsupported' }
  const parts = parseRrule(rules[0])
  if (!parts) return { kind: 'unsupported' }
  const freq = parts.get('FREQ')?.toUpperCase()
  const interval = parts.get('INTERVAL') ?? '1'
  if (interval !== '1') return { kind: 'unsupported' }
  if (parts.has('COUNT') || parts.has('UNTIL')) return { kind: 'unsupported' }
  const keys = [...parts.keys()].filter((key) => key !== 'FREQ' && key !== 'INTERVAL' && key !== 'BYDAY')
  if (keys.length > 0) return { kind: 'unsupported' }
  if (freq === 'DAILY') {
    if (parts.has('BYDAY')) return { kind: 'unsupported' }
    return { freq: 'daily' }
  }
  if (freq === 'MONTHLY') {
    if (parts.has('BYDAY')) return { kind: 'unsupported' }
    return { freq: 'monthly' }
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
      return { freq: 'weekly', days: weekdays(days) }
    } catch {
      return { kind: 'unsupported' }
    }
  }
  return { kind: 'unsupported' }
}

export function toGoogleRrule(recurrence: Recurrence): string[] {
  if (recurrence.freq === 'none') return []
  if (recurrence.freq === 'daily') return ['RRULE:FREQ=DAILY']
  if (recurrence.freq === 'monthly') return ['RRULE:FREQ=MONTHLY']
  const days = recurrence.days.map((day) => ISO_TO_BYDAY[day - 1]).join(',')
  return [`RRULE:FREQ=WEEKLY;BYDAY=${days}`]
}
