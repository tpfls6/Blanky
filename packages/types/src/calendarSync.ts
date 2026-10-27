declare const brand: unique symbol
type Brand<T, Name extends string> = T & { readonly [brand]: Name }

export type UserId = Brand<string, 'UserId'>
export type ConnectionId = Brand<string, 'ConnectionId'>
export type CalendarId = Brand<string, 'CalendarId'>
export type ScheduleId = Brand<string, 'ScheduleId'>
export type GoogleSub = Brand<string, 'GoogleSub'>
export type GoogleCalendarId = Brand<string, 'GoogleCalendarId'>
export type GoogleEventId = Brand<string, 'GoogleEventId'>
export type Etag = Brand<string, 'Etag'>
export type SyncToken = Brand<string, 'SyncToken'>
export type OAuthState = Brand<string, 'OAuthState'>
export type DateStr = Brand<string, 'DateStr'>
export type TimeStr = Brand<string, 'TimeStr'>
export type IsoDateTime = Brand<string, 'IsoDateTime'>

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** Blanky recurrence ceiling. No COUNT, UNTIL, INTERVAL, EXDATE, or exception instances. */
export type Recurrence =
  | { freq: 'none' }
  | { freq: 'daily' }
  | { freq: 'weekly'; days: readonly [IsoWeekday, ...IsoWeekday[]] }
  | { freq: 'monthly' }

export type PeerWhen =
  | { allDay: true; date: DateStr; endDate: DateStr | null }
  | { allDay: false; date: DateStr; startTime: TimeStr; endTime: TimeStr | null }

export type FirstImport =
  | { direction: 'from_google' }
  | { direction: 'from_blanky' }

export type DisconnectDisposition =
  | { importedRows: 'keep' }
  | { importedRows: 'delete' }

export type SyncCursor =
  | { kind: 'full' }
  | { kind: 'incremental'; token: SyncToken }

export type LastSync = {
  at: IsoDateTime
  imported: number
  exported: number
  deletedLocal: number
  deletedGoogle: number
  skippedUnsupported: number
  conflictCount: number
  error: string | null
}

export type GoogleCalendarChoice = {
  id: GoogleCalendarId
  summary: string
  timeZone: string
  primary: boolean
}

export type CalendarErrorCode =
  | 'UNAUTHENTICATED'
  | 'GOOGLE_ENV_MISSING'
  | 'GOOGLE_FN_MISSING'
  | 'GOOGLE_DENIED'
  | 'NOT_CONNECTED'
  | 'NEEDS_CALENDAR'
  | 'GOOGLE_HTTP'
  | 'INVALID_COMMAND'

export type CalendarError = {
  code: CalendarErrorCode
  message: string
}

export type ConnectionView =
  | { status: 'disconnected' }
  | { status: 'awaiting_consent' }
  | { status: 'connected'; accountEmail: string }
  | {
      status: 'ready'
      accountEmail: string
      calendarSummary: string
      autoSync: boolean
      lastSync: LastSync
    }
  | {
      status: 'needs_reauth'
      accountEmail: string
      calendarSummary: string
    }
  | { status: 'error'; code: CalendarErrorCode; message: string }

export type ConflictNote = {
  scheduleId: ScheduleId
  googleEventId: GoogleEventId
  reason: 'both_dirty' | 'etag_mismatch'
  resolved: 'blanky_wins'
}

export type SyncReport = {
  imported: number
  exported: number
  deletedLocal: number
  deletedGoogle: number
  skippedUnsupported: number
  conflicts: readonly ConflictNote[]
  cursor: SyncCursor
}

function brandedString<T extends string>(value: unknown, label: string): T {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label}이 필요합니다.`)
  return value as T
}

export function asUserId(value: unknown): UserId { return brandedString(value, '사용자') }
export function asConnectionId(value: unknown): ConnectionId { return brandedString(value, '연결') }
export function asCalendarId(value: unknown): CalendarId { return brandedString(value, '캘린더') }
export function asScheduleId(value: unknown): ScheduleId { return brandedString(value, '일정') }
export function asGoogleSub(value: unknown): GoogleSub { return brandedString(value, 'Google 계정') }
export function asGoogleCalendarId(value: unknown): GoogleCalendarId { return brandedString(value, 'Google 캘린더') }
export function asGoogleEventId(value: unknown): GoogleEventId { return brandedString(value, 'Google 일정') }
export function asEtag(value: unknown): Etag { return brandedString(value, 'etag') }
export function asSyncToken(value: unknown): SyncToken { return brandedString(value, '동기화 토큰') }
export function asOAuthState(value: unknown): OAuthState { return brandedString(value, 'OAuth 상태') }
export function asDateStr(value: unknown): DateStr { return brandedString(value, '날짜') }
export function asTimeStr(value: unknown): TimeStr { return brandedString(value, '시간') }
export function asIsoDateTime(value: unknown): IsoDateTime { return brandedString(value, '시각') }

const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

export function asIsoWeekday(value: unknown): IsoWeekday {
  if (typeof value !== 'number' || !WEEKDAYS.includes(value as IsoWeekday)) throw new Error('반복 요일을 확인해 주세요.')
  return value as IsoWeekday
}
