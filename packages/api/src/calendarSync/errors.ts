import type { CalendarError, CalendarErrorCode } from '../../../types/src/calendarSync.ts'

const MAX_MESSAGE = 240

/** Strips OAuth tokens, JWTs and secrets from text that may reach logs, the database or the browser. */
export function safeMessage(value: unknown): string {
  const text = typeof value === 'string' ? value : ''
  return text
    .replace(/Bearer\s+[^\s"',]+/gi, 'Bearer [redacted]')
    .replace(/\b(access_token|refresh_token|id_token|client_secret|client_id|code|token|key|apikey|api_key)=([^&\s"']+)/gi, '$1=[redacted]')
    .replace(/"(access_token|refresh_token|id_token|client_secret|token)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .replace(/\bya29\.[\w.-]+/g, '[redacted]')
    .replace(/\b1\/\/[\w.-]{10,}/g, '[redacted]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE)
}

export class CalendarSyncError extends Error {
  readonly code: CalendarErrorCode
  readonly status: number
  /** HTTP status Google returned, when the failure came from a Google API call. */
  readonly googleStatus: number | null

  constructor(code: CalendarErrorCode, message: string, status = 400, googleStatus: number | null = null) {
    super(safeMessage(message) || 'Google Calendar 요청을 처리하지 못했습니다.')
    this.name = 'CalendarSyncError'
    this.code = code
    this.status = status
    this.googleStatus = googleStatus
  }
}

export function calendarError(code: CalendarErrorCode, message: string): CalendarError {
  return { code, message: safeMessage(message) }
}

export function errorStatus(code: CalendarErrorCode): number {
  if (code === 'UNAUTHENTICATED') return 401
  if (code === 'GOOGLE_ENV_MISSING' || code === 'NETWORK' || code === 'GOOGLE_UNAVAILABLE') return 503
  if (code === 'GOOGLE_FN_MISSING') return 404
  if (code === 'GOOGLE_RATE_LIMITED') return 429
  if (code === 'GOOGLE_DENIED' || code === 'GOOGLE_HTTP' || code === 'GOOGLE_INVALID_EVENT') return 502
  if (code === 'NOT_CONNECTED' || code === 'NEEDS_CALENDAR' || code === 'GOOGLE_CONFLICT') return 409
  if (code === 'STORE_FAILED') return 500
  return 400
}

export const CALENDAR_ERROR_CODES: readonly CalendarErrorCode[] = [
  'UNAUTHENTICATED',
  'GOOGLE_ENV_MISSING',
  'GOOGLE_FN_MISSING',
  'GOOGLE_DENIED',
  'NOT_CONNECTED',
  'NEEDS_CALENDAR',
  'GOOGLE_HTTP',
  'INVALID_COMMAND',
  'NETWORK',
  'GOOGLE_UNAVAILABLE',
  'GOOGLE_RATE_LIMITED',
  'GOOGLE_INVALID_EVENT',
  'GOOGLE_CONFLICT',
  'STORE_FAILED',
]

export function isCalendarError(value: unknown): value is CalendarError {
  if (!value || typeof value !== 'object') return false
  const row = value as { code?: unknown; message?: unknown }
  return CALENDAR_ERROR_CODES.includes(row.code as CalendarErrorCode) && typeof row.message === 'string'
}

/**
 * Failures that hit every item alike. Applying the remaining items would only repeat the same
 * error, so the sync stops and is retried as a whole.
 */
export function isSyncWideError(error: unknown): boolean {
  if (!(error instanceof CalendarSyncError)) return false
  if (error.code === 'GOOGLE_RATE_LIMITED' || error.code === 'GOOGLE_UNAVAILABLE') return true
  return error.code === 'GOOGLE_DENIED' && error.googleStatus === 401
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
