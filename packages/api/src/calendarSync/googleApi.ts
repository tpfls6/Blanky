import type { Etag, GoogleCalendarChoice, GoogleCalendarId, GoogleEventId, PeerWhen, Recurrence, ScheduleId, SyncToken } from '../../../types/src/calendarSync.ts'
import { asEtag, asGoogleCalendarId, asGoogleEventId } from '../../../types/src/calendarSync.ts'
import type { GoogleEventWrite, GoogleListResult } from './domain.ts'
import { CalendarSyncError } from './errors.ts'
import { parseGoogleList } from './googleParse.ts'
import { BLANKY_SCHEDULE_EXTENDED_PROPERTY } from './oauth.ts'
import { toGoogleRrule } from './recurrence.ts'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function shiftDate(value: string, days: number): string {
  const next = new Date(`${value}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function googleWhen(when: PeerWhen, timeZone: string): { start: Record<string, string>; end: Record<string, string> } {
  if (when.allDay) {
    const end = when.endDate ? shiftDate(when.endDate, 1) : shiftDate(when.date, 1)
    return { start: { date: when.date }, end: { date: end } }
  }
  return {
    start: { dateTime: `${when.date}T${when.startTime}:00`, timeZone },
    end: { dateTime: `${when.date}T${when.endTime ?? when.startTime}:00`, timeZone },
  }
}

export function googleBodyFromWrite(body: GoogleEventWrite, timeZone: string): Record<string, unknown> {
  const when = googleWhen(body.when, timeZone)
  return {
    summary: body.summary,
    description: body.description,
    start: when.start,
    end: when.end,
    recurrence: toGoogleRrule(body.recurrence),
    ...(body.colorId ? { colorId: body.colorId } : {}),
    extendedProperties: { private: { [BLANKY_SCHEDULE_EXTENDED_PROPERTY]: body.blankyScheduleId } },
  }
}

async function googleJson(
  input: { accessToken: string; url: string; method?: string; body?: unknown; etag?: Etag },
  fetcher: typeof fetch,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetcher(input.url, {
    method: input.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      ...(input.body ? { 'Content-Type': 'application/json' } : {}),
      ...(input.etag ? { 'If-Match': input.etag } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  })
  const body = record(await response.json().catch(() => null))
  if (response.status === 401 || response.status === 403) {
    throw new CalendarSyncError('GOOGLE_DENIED', 'Google Calendar 권한이 거부되었습니다.', 502)
  }
  return { status: response.status, body }
}

export async function listGoogleCalendars(accessToken: string, fetcher: typeof fetch = fetch): Promise<readonly GoogleCalendarChoice[]> {
  const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList')
  const { status, body } = await googleJson({ accessToken, url: url.toString() }, fetcher)
  if (status >= 400) throw new CalendarSyncError('GOOGLE_HTTP', 'Google 캘린더 목록을 읽지 못했습니다.', 502)
  return (Array.isArray(body.items) ? body.items : []).flatMap((item) => {
    const row = record(item)
    const id = text(row.id)
    if (!id) return []
    return [{
      id: asGoogleCalendarId(id),
      summary: text(row.summary) || id,
      timeZone: text(row.timeZone) || 'UTC',
      primary: row.primary === true,
    }]
  })
}

export async function listGoogleEvents(
  input: { accessToken: string; googleCalendarId: GoogleCalendarId; syncToken: SyncToken | null; pageToken: string | null; timeZone: string },
  fetcher: typeof fetch = fetch,
): Promise<GoogleListResult> {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.googleCalendarId)}/events`)
  url.searchParams.set('singleEvents', 'false')
  url.searchParams.set('showDeleted', 'true')
  if (input.syncToken) url.searchParams.set('syncToken', input.syncToken)
  if (input.pageToken) url.searchParams.set('pageToken', input.pageToken)
  const { status, body } = await googleJson({ accessToken: input.accessToken, url: url.toString() }, fetcher)
  if (status === 410) return { kind: 'gone' }
  if (status >= 400) throw new CalendarSyncError('GOOGLE_HTTP', 'Google 일정을 읽지 못했습니다.', 502)
  return { kind: 'page', page: parseGoogleList(body, input.timeZone) }
}

export async function createGoogleEvent(
  input: { accessToken: string; googleCalendarId: GoogleCalendarId; body: GoogleEventWrite; timeZone: string },
  fetcher: typeof fetch = fetch,
): Promise<{ id: GoogleEventId; etag: Etag }> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.googleCalendarId)}/events`
  const { status, body } = await googleJson({
    accessToken: input.accessToken,
    url,
    method: 'POST',
    body: googleBodyFromWrite(input.body, input.timeZone),
  }, fetcher)
  if (status >= 400 || !body.id) throw new CalendarSyncError('GOOGLE_HTTP', 'Google 일정을 만들지 못했습니다.', 502)
  return { id: asGoogleEventId(body.id), etag: asEtag(text(body.etag) || 'etag-missing') }
}

export async function updateGoogleEvent(
  input: { accessToken: string; googleCalendarId: GoogleCalendarId; id: GoogleEventId; etag: Etag; body: GoogleEventWrite; timeZone: string },
  fetcher: typeof fetch = fetch,
): Promise<{ etag: Etag } | { kind: 'etag_mismatch' }> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.googleCalendarId)}/events/${encodeURIComponent(input.id)}`
  const { status, body } = await googleJson({
    accessToken: input.accessToken,
    url,
    method: 'PUT',
    etag: input.etag,
    body: googleBodyFromWrite(input.body, input.timeZone),
  }, fetcher)
  if (status === 412) return { kind: 'etag_mismatch' }
  if (status >= 400) throw new CalendarSyncError('GOOGLE_HTTP', 'Google 일정을 수정하지 못했습니다.', 502)
  return { etag: asEtag(text(body.etag) || input.etag) }
}

export async function deleteGoogleEvent(
  input: { accessToken: string; googleCalendarId: GoogleCalendarId; id: GoogleEventId; etag: Etag },
  fetcher: typeof fetch = fetch,
): Promise<'ok' | 'already_gone'> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.googleCalendarId)}/events/${encodeURIComponent(input.id)}`
  const { status } = await googleJson({ accessToken: input.accessToken, url, method: 'DELETE', etag: input.etag }, fetcher)
  if (status === 404 || status === 410) return 'already_gone'
  if (status >= 400 && status !== 204) throw new CalendarSyncError('GOOGLE_HTTP', 'Google 일정을 삭제하지 못했습니다.', 502)
  return 'ok'
}

export type { Recurrence, ScheduleId }
