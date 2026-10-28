import {
  asCalendarId,
  asConnectionId,
  asEtag,
  asGoogleCalendarId,
  asGoogleEventId,
  asGoogleSub,
  asIsoDateTime,
  asOAuthState,
  asScheduleId,
  asSyncToken,
  asUserId,
  type CalendarId,
  type ConnectionId,
  type DisconnectDisposition,
  type IsoDateTime,
  type LastSync,
  type ScheduleId,
  type SyncCursor,
  type UserId,
} from '../../../types/src/calendarSync.ts'
import { isCalendarDate } from '../../../types/src/aiSchema.ts'
import { mapScheduleRow } from '../scheduleRepository.ts'
import type { BlankySnapshot, BoundCalendar, Connection, EventLink, ReadyConnection, SnapshotRow, TokenSet } from './domain.ts'
import { CalendarSyncError } from './errors.ts'
import { parseRecurrenceFromSchedule } from './recurrence.ts'
import { asDateStr, asTimeStr, type PeerWhen } from '../../../types/src/calendarSync.ts'

export type DbClient = {
  from: (table: string) => unknown
}

type Query = {
  select: (columns?: string) => Query
  insert: (values: unknown) => Query
  update: (values: unknown) => Query
  delete: () => Query
  eq: (column: string, value: unknown) => Query
  is: (column: string, value: unknown) => Query
  in: (column: string, values: unknown[]) => Query
  single: () => Promise<{ data: unknown; error: { message: string } | null }>
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
  then: Promise<{ data: unknown; error: { message: string } | null }>['then']
}

function query(client: DbClient, table: string): Query {
  return client.from(table) as Query
}

async function one(result: Promise<{ data: unknown; error: { message: string } | null }>, fallback = 'Calendar 저장소를 읽지 못했습니다.'): Promise<unknown> {
  const { data, error } = await result
  if (error) throw new CalendarSyncError('GOOGLE_HTTP', error.message || fallback, 502)
  return data
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function lastSync(value: unknown): LastSync {
  const row = record(value)
  return {
    at: asIsoDateTime(text(row.at) || new Date().toISOString()),
    imported: typeof row.imported === 'number' ? row.imported : 0,
    exported: typeof row.exported === 'number' ? row.exported : 0,
    deletedLocal: typeof row.deletedLocal === 'number' ? row.deletedLocal : 0,
    deletedGoogle: typeof row.deletedGoogle === 'number' ? row.deletedGoogle : 0,
    skippedUnsupported: typeof row.skippedUnsupported === 'number' ? row.skippedUnsupported : 0,
    conflictCount: typeof row.conflictCount === 'number' ? row.conflictCount : 0,
    error: typeof row.error === 'string' ? row.error : null,
  }
}

function tokens(row: Record<string, unknown>): TokenSet {
  return {
    refreshToken: text(row.refresh_token),
    accessToken: text(row.access_token),
    accessTokenExpiresAt: asIsoDateTime(text(row.access_token_expires_at)),
  }
}

function calendar(row: Record<string, unknown>): BoundCalendar {
  return {
    googleCalendarId: asGoogleCalendarId(row.google_calendar_id),
    blankyCalendarId: asCalendarId(row.blanky_calendar_id),
    timeZone: text(row.calendar_timezone) || 'UTC',
    summary: text(row.calendar_summary) || text(row.google_calendar_id),
  }
}

function cursor(row: Record<string, unknown>): SyncCursor {
  const token = text(row.next_sync_token)
  return token ? { kind: 'incremental', token: asSyncToken(token) } : { kind: 'full' }
}

export function parseConnectionRow(value: unknown): Connection {
  const row = record(value)
  const id = asConnectionId(row.id)
  const userId = asUserId(row.user_id)
  if (row.status === 'awaiting_consent') {
    return {
      status: 'awaiting_consent',
      id,
      userId,
      oauthState: asOAuthState(row.oauth_state_hash),
      origin: text(row.origin),
    }
  }
  if (row.status === 'connected') {
    return {
      status: 'connected',
      id,
      userId,
      googleSub: asGoogleSub(row.google_sub),
      accountEmail: text(row.account_email),
      tokens: tokens(row),
    }
  }
  if (row.status === 'ready') {
    return {
      status: 'ready',
      id,
      userId,
      googleSub: asGoogleSub(row.google_sub),
      accountEmail: text(row.account_email),
      tokens: tokens(row),
      calendar: calendar(row),
      cursor: cursor(row),
      autoSync: row.auto_sync === true,
      lastSync: lastSync(row.last_sync),
    }
  }
  if (row.status === 'needs_reauth') {
    return {
      status: 'needs_reauth',
      id,
      userId,
      googleSub: asGoogleSub(row.google_sub),
      accountEmail: text(row.account_email),
      calendar: calendar(row),
      autoSync: row.auto_sync === true,
    }
  }
  throw new CalendarSyncError('INVALID_COMMAND', '연결 상태를 읽지 못했습니다.')
}

export async function loadConnection(admin: DbClient, userId: UserId): Promise<Connection | null> {
  const data = await one(query(admin, 'google_calendar_connections').select('*').eq('user_id', userId).maybeSingle())
  return data ? parseConnectionRow(data) : null
}

export async function loadConnectionByStateHash(admin: DbClient, hash: string): Promise<Connection | null> {
  const data = await one(query(admin, 'google_calendar_connections').select('*').eq('oauth_state_hash', hash).maybeSingle())
  return data ? parseConnectionRow(data) : null
}

export async function saveAwaitingConsent(admin: DbClient, input: { userId: UserId; hash: string; origin: string; id?: ConnectionId }): Promise<void> {
  // Old links would look like missing local rows on the next bind and delete Google events.
  if (input.id) await wipeLinks(admin, input.id)
  const row = {
    id: input.id,
    user_id: input.userId,
    status: 'awaiting_consent',
    oauth_state_hash: input.hash,
    origin: input.origin,
    google_sub: null,
    account_email: null,
    refresh_token: null,
    access_token: null,
    access_token_expires_at: null,
    google_calendar_id: null,
    blanky_calendar_id: null,
    calendar_summary: null,
    calendar_timezone: null,
    next_sync_token: null,
    last_sync: null,
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    await one(query(admin, 'google_calendar_connections').update(row).eq('id', input.id).select('id').maybeSingle())
    return
  }
  const { id: _omit, ...create } = row
  await one(query(admin, 'google_calendar_connections').insert(create).select('id').single())
}

export async function saveConnected(admin: DbClient, input: {
  id: ConnectionId
  userId: UserId
  googleSub: string
  accountEmail: string
  tokens: TokenSet
}): Promise<void> {
  await one(query(admin, 'google_calendar_connections').update({
    status: 'connected',
    google_sub: input.googleSub,
    account_email: input.accountEmail,
    refresh_token: input.tokens.refreshToken,
    access_token: input.tokens.accessToken,
    access_token_expires_at: input.tokens.accessTokenExpiresAt,
    oauth_state_hash: null,
    updated_at: new Date().toISOString(),
  }).eq('id', input.id).select('id').single())
}

export async function saveReadyBind(admin: DbClient, input: {
  id: ConnectionId
  calendar: BoundCalendar
}): Promise<void> {
  await one(query(admin, 'google_calendar_connections').update({
    status: 'ready',
    google_calendar_id: input.calendar.googleCalendarId,
    blanky_calendar_id: input.calendar.blankyCalendarId,
    calendar_summary: input.calendar.summary,
    calendar_timezone: input.calendar.timeZone,
    next_sync_token: null,
    updated_at: new Date().toISOString(),
  }).eq('id', input.id).select('id').single())
}

export async function saveAutoSync(admin: DbClient, id: ConnectionId, enabled: boolean): Promise<void> {
  await one(query(admin, 'google_calendar_connections').update({
    auto_sync: enabled,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('id').single())
}

export async function saveCursor(admin: DbClient, id: ConnectionId, cursorValue: SyncCursor, report: LastSync): Promise<void> {
  await one(query(admin, 'google_calendar_connections').update({
    next_sync_token: cursorValue.kind === 'incremental' ? cursorValue.token : null,
    last_sync: report,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('id').single())
}

export async function markNeedsReauth(admin: DbClient, id: ConnectionId): Promise<void> {
  await one(query(admin, 'google_calendar_connections').update({
    status: 'needs_reauth',
    refresh_token: null,
    access_token: null,
    access_token_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('id').single())
}

export async function insertExternalCalendar(admin: DbClient, input: { userId: UserId; summary: string; timeZone: string }): Promise<CalendarId> {
  const data = await one(query(admin, 'calendars').insert({
    owner_user_id: input.userId,
    name: input.summary,
    description: '',
    color: '#3A62B0',
    icon: 'Calendar',
    type: 'external',
    is_default_personal: false,
    timezone: input.timeZone,
  }).select('id').single())
  return asCalendarId(record(data).id)
}

function whenFromSchedule(row: { allDay?: boolean; date: string; startTime: string | null; endTime: string | null; endDate?: string | null }): PeerWhen {
  if (row.allDay || !row.startTime) {
    return {
      allDay: true,
      date: asDateStr(row.date),
      endDate: row.endDate && isCalendarDate(row.endDate) ? asDateStr(row.endDate) : null,
    }
  }
  return {
    allDay: false,
    date: asDateStr(row.date),
    startTime: asTimeStr(row.startTime),
    endTime: row.endTime ? asTimeStr(row.endTime) : null,
  }
}

async function categoryColors(admin: DbClient, userId: UserId): Promise<Map<string, string | null>> {
  const rows = await one(query(admin, 'categories').select('id, color').eq('user_id', userId))
  const colors = new Map<string, string | null>()
  for (const value of Array.isArray(rows) ? rows : []) {
    const row = record(value)
    const id = text(row.id)
    if (id) colors.set(id, text(row.color) || null)
  }
  return colors
}

export function snapshotRowFromSchedule(
  row: ReturnType<typeof mapScheduleRow>,
  colors: ReadonlyMap<string, string | null> = new Map(),
): SnapshotRow {
  return {
    scheduleId: asScheduleId(row.id),
    updatedAt: asIsoDateTime(row.updatedAt),
    title: row.title,
    description: row.description,
    when: whenFromSchedule(row),
    recurrence: parseRecurrenceFromSchedule(row),
    categoryId: row.categoryId,
    color: row.categoryId ? colors.get(row.categoryId) ?? null : null,
  }
}

export async function loadSnapshot(admin: DbClient, connection: ReadyConnection): Promise<BlankySnapshot> {
  const schedules = await one(query(admin, 'schedules').select('*').eq('calendar_id', connection.calendar.blankyCalendarId))
  const links = await one(query(admin, 'google_calendar_event_links').select('*').eq('connection_id', connection.id))
  const colors = await categoryColors(admin, connection.userId)
  return {
    calendarId: connection.calendar.blankyCalendarId,
    rows: (Array.isArray(schedules) ? schedules : []).map((row) => snapshotRowFromSchedule(mapScheduleRow(row), colors)),
    links: (Array.isArray(links) ? links : []).map((value) => {
      const row = record(value)
      return {
        connectionId: asConnectionId(row.connection_id),
        scheduleId: asScheduleId(row.schedule_id),
        googleEventId: asGoogleEventId(row.google_event_id),
        appliedEtag: asEtag(row.etag),
        appliedBlankyUpdatedAt: asIsoDateTime(row.applied_blanky_updated_at),
        origin: row.origin === 'google' ? 'google' as const : 'blanky' as const,
        recurrenceMirror: 'mirrored' as const,
      }
    }),
  }
}

export async function wipeLinks(admin: DbClient, connectionId: ConnectionId): Promise<void> {
  await one(query(admin, 'google_calendar_event_links').delete().eq('connection_id', connectionId))
}

export async function upsertSchedule(admin: DbClient, input: {
  userId: UserId
  calendarId: CalendarId
  draft: SnapshotRow
}): Promise<{ scheduleId: ScheduleId; updatedAt: IsoDateTime }> {
  const when = input.draft.when
  const data = await one(query(admin, 'schedules').insert({
    user_id: input.userId,
    calendar_id: input.calendarId,
    created_by_user_id: input.userId,
    title: input.draft.title,
    description: input.draft.description,
    date: when.date,
    start_time: when.allDay ? null : when.startTime,
    end_time: when.allDay ? null : when.endTime,
    all_day: when.allDay,
    end_date: when.allDay ? when.endDate : null,
    repeat_rule: input.draft.recurrence.freq,
    repeat_days: input.draft.recurrence.freq === 'weekly' ? [...input.draft.recurrence.days] : [],
    change_source: 'calendar_sync',
    kind: 'event',
    priority: 'medium',
    status: 'todo',
    category_id: input.draft.categoryId,
  }).select('id, updated_at').single())
  const row = record(data)
  return { scheduleId: asScheduleId(row.id), updatedAt: asIsoDateTime(row.updated_at) }
}

export async function casUpdateSchedule(admin: DbClient, input: {
  id: ScheduleId
  expectedUpdatedAt: IsoDateTime
  draft: SnapshotRow
}): Promise<'updated' | 'lost_race'> {
  const when = input.draft.when
  const data = await one(query(admin, 'schedules').update({
    title: input.draft.title,
    description: input.draft.description,
    date: when.date,
    start_time: when.allDay ? null : when.startTime,
    end_time: when.allDay ? null : when.endTime,
    all_day: when.allDay,
    end_date: when.allDay ? when.endDate : null,
    repeat_rule: input.draft.recurrence.freq,
    repeat_days: input.draft.recurrence.freq === 'weekly' ? [...input.draft.recurrence.days] : [],
    change_source: 'calendar_sync',
    updated_at: new Date().toISOString(),
  }).eq('id', input.id).eq('updated_at', input.expectedUpdatedAt).select('id').maybeSingle())
  return data ? 'updated' : 'lost_race'
}

export async function deleteSchedule(admin: DbClient, id: ScheduleId): Promise<void> {
  await one(query(admin, 'schedules').delete().eq('id', id))
}

export async function readUpdatedAt(admin: DbClient, id: ScheduleId): Promise<IsoDateTime> {
  const data = await one(query(admin, 'schedules').select('updated_at').eq('id', id).single())
  return asIsoDateTime(record(data).updated_at)
}

export async function upsertLink(admin: DbClient, link: EventLink): Promise<void> {
  await one(query(admin, 'google_calendar_event_links').upsert({
    connection_id: link.connectionId,
    schedule_id: link.scheduleId,
    google_event_id: link.googleEventId,
    etag: link.appliedEtag,
    applied_blanky_updated_at: link.appliedBlankyUpdatedAt,
    origin: link.origin,
    recurrence_mirror: 'mirrored',
  }))
}

export async function deleteLink(admin: DbClient, input: { scheduleId: ScheduleId } | { googleEventId: import('../../../types/src/calendarSync.ts').GoogleEventId }): Promise<void> {
  const q = query(admin, 'google_calendar_event_links')
  if ('scheduleId' in input) await one(q.delete().eq('schedule_id', input.scheduleId))
  else await one(q.delete().eq('google_event_id', input.googleEventId))
}

export async function clonePersonalOntoBoundCalendar(admin: DbClient, input: {
  userId: UserId
  personalCalendarId: CalendarId
  boundCalendarId: CalendarId
}): Promise<void> {
  const rows = await one(query(admin, 'schedules').select('*').eq('calendar_id', input.personalCalendarId).eq('user_id', input.userId))
  const colors = await categoryColors(admin, input.userId)
  for (const value of Array.isArray(rows) ? rows : []) {
    const row = mapScheduleRow(value)
    await upsertSchedule(admin, {
      userId: input.userId,
      calendarId: input.boundCalendarId,
      draft: snapshotRowFromSchedule(row, colors),
    })
  }
}

export async function disconnectConnection(admin: DbClient, connection: Connection, disposition: DisconnectDisposition): Promise<void> {
  if (disposition.importedRows === 'delete') {
    const links = await one(query(admin, 'google_calendar_event_links').select('schedule_id, origin').eq('connection_id', connection.id))
    const imported = (Array.isArray(links) ? links : [])
      .filter((row) => record(row).origin === 'google')
      .map((row) => asScheduleId(record(row).schedule_id))
    for (const id of imported) await deleteSchedule(admin, id)
  }
  await wipeLinks(admin, connection.id)
  await one(query(admin, 'google_calendar_connections').delete().eq('id', connection.id))
}

export async function loadPersonalCalendarId(admin: DbClient, userId: UserId): Promise<CalendarId | null> {
  const data = await one(query(admin, 'calendars').select('id').eq('owner_user_id', userId).eq('is_default_personal', true).maybeSingle())
  return data ? asCalendarId(record(data).id) : null
}
