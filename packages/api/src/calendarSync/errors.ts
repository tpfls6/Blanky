import type { CalendarError, CalendarErrorCode } from '../../../types/src/calendarSync.ts'

export class CalendarSyncError extends Error {
  readonly code: CalendarErrorCode
  readonly status: number

  constructor(code: CalendarErrorCode, message: string, status = 400) {
    super(message)
    this.name = 'CalendarSyncError'
    this.code = code
    this.status = status
  }
}

export function calendarError(code: CalendarErrorCode, message: string): CalendarError {
  return { code, message }
}

export function errorStatus(code: CalendarErrorCode): number {
  if (code === 'UNAUTHENTICATED') return 401
  if (code === 'GOOGLE_ENV_MISSING') return 503
  if (code === 'GOOGLE_FN_MISSING') return 404
  if (code === 'GOOGLE_DENIED' || code === 'GOOGLE_HTTP') return 502
  if (code === 'NOT_CONNECTED' || code === 'NEEDS_CALENDAR') return 409
  return 400
}

const CALENDAR_ERROR_CODES: readonly CalendarErrorCode[] = [
  'UNAUTHENTICATED',
  'GOOGLE_ENV_MISSING',
  'GOOGLE_FN_MISSING',
  'GOOGLE_DENIED',
  'NOT_CONNECTED',
  'NEEDS_CALENDAR',
  'GOOGLE_HTTP',
  'INVALID_COMMAND',
]

export function isCalendarError(value: unknown): value is CalendarError {
  if (!value || typeof value !== 'object') return false
  const row = value as { code?: unknown; message?: unknown }
  return CALENDAR_ERROR_CODES.includes(row.code as CalendarErrorCode) && typeof row.message === 'string'
}

export function asCalendarSyncError(value: unknown, fallback: CalendarErrorCode = 'GOOGLE_HTTP'): CalendarSyncError {
  if (value instanceof CalendarSyncError) return value
  if (isCalendarError(value)) return new CalendarSyncError(value.code, value.message, errorStatus(value.code))
  if (value && typeof value === 'object' && 'error' in value && isCalendarError((value as { error: unknown }).error)) {
    return asCalendarSyncError((value as { error: CalendarError }).error)
  }
  const message = value instanceof Error ? value.message : 'Google Calendar 요청을 처리하지 못했습니다.'
  return new CalendarSyncError(fallback, message, errorStatus(fallback))
}
