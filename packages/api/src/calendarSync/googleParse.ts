import {
  asDateStr,
  asEtag,
  asGoogleEventId,
  asIsoDateTime,
  asScheduleId,
  asSyncToken,
  asTimeStr,
  type DateStr,
  type PeerWhen,
  type TimeStr,
} from '../../../types/src/calendarSync.ts'
import type { GoogleEventPage, GooglePeerEvent } from './domain.ts'
import { CalendarSyncError } from './errors.ts'
import { parseGoogleRecurrence } from './recurrence.ts'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function wallClock(iso: string, timeZone: string): { date: DateStr; time: TimeStr } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { date: asDateStr(`${read('year')}-${read('month')}-${read('day')}`), time: asTimeStr(`${read('hour')}:${read('minute')}`) }
}

function shiftDate(value: string, days: number): string {
  const next = new Date(`${value}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function whenFromGoogle(event: Record<string, unknown>, calendarTimeZone: string): PeerWhen {
  const start = record(event.start)
  const end = record(event.end)
  if (typeof start.date === 'string') {
    const date = asDateStr(start.date)
    const exclusive = typeof end.date === 'string' ? end.date : start.date
    const inclusive = exclusive > start.date ? shiftDate(exclusive, -1) : start.date
    return { allDay: true, date, endDate: inclusive === start.date ? null : asDateStr(inclusive) }
  }
  if (typeof start.dateTime !== 'string') throw new CalendarSyncError('GOOGLE_HTTP', 'Google 일정의 시간을 읽지 못했습니다.')
  const zone = text(start.timeZone) || calendarTimeZone
  const startClock = wallClock(start.dateTime, zone)
  const endClock = typeof end.dateTime === 'string' ? wallClock(end.dateTime, text(end.timeZone) || zone) : null
  return {
    allDay: false,
    date: startClock.date,
    startTime: startClock.time,
    endTime: endClock && endClock.date === startClock.date ? endClock.time : endClock ? endClock.time : null,
  }
}

export function parseGoogleEvent(value: unknown, calendarTimeZone: string): GooglePeerEvent {
  const event = record(value)
  const id = asGoogleEventId(event.id)
  const etag = asEtag(text(event.etag) || 'etag-missing')
  if (event.status === 'cancelled') return { id, etag, status: 'cancelled' }
  const privateProps = record(record(event.extendedProperties).private)
  const blanky = text(privateProps.blankyScheduleId)
  const colorId = text(event.colorId)
  return {
    id,
    etag,
    status: 'confirmed',
    title: text(event.summary) || '(제목 없음)',
    description: text(event.description),
    when: whenFromGoogle(event, calendarTimeZone),
    recurrence: parseGoogleRecurrence(Array.isArray(event.recurrence) ? event.recurrence.map(String) : []),
    updated: asIsoDateTime(text(event.updated) || new Date().toISOString()),
    blankyScheduleId: blanky ? asScheduleId(blanky) : null,
    colorId: /^([1-9]|1[01])$/.test(colorId) ? colorId : null,
  }
}

export function parseGoogleList(value: unknown, calendarTimeZone: string): GoogleEventPage {
  const row = record(value)
  const items = Array.isArray(row.items) ? row.items : []
  return {
    events: items.map((item) => parseGoogleEvent(item, calendarTimeZone)),
    nextPageToken: text(row.nextPageToken) || null,
    nextSyncToken: text(row.nextSyncToken) ? asSyncToken(text(row.nextSyncToken)) : null,
  }
}
