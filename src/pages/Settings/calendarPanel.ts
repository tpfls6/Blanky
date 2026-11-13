import type { CalendarErrorCode, ConnectionView, LastSync } from '../../../packages/types/src/calendarSync.ts'
import { formatDateTime } from '../../i18n/format.ts'
import { DEFAULT_LOCALE, type AppLocale } from '../../i18n/locale.ts'
import { translate } from '../../i18n/translate.ts'

const ERROR_KEY: Record<CalendarErrorCode, string> = {
  GOOGLE_ENV_MISSING: 'calendar.envMissing',
  GOOGLE_FN_MISSING: 'calendar.fnMissing',
  UNAUTHENTICATED: 'calendar.unauthenticated',
  GOOGLE_DENIED: 'calendar.denied',
  NOT_CONNECTED: 'calendar.notConnected',
  NEEDS_CALENDAR: 'calendar.needsCalendar',
  GOOGLE_HTTP: 'calendar.http',
  INVALID_COMMAND: 'calendar.invalid',
  NETWORK: 'calendar.network',
  GOOGLE_UNAVAILABLE: 'calendar.unavailable',
  GOOGLE_RATE_LIMITED: 'calendar.rateLimited',
  GOOGLE_INVALID_EVENT: 'calendar.invalidEvent',
  GOOGLE_CONFLICT: 'calendar.conflict',
  STORE_FAILED: 'calendar.storeFailed',
}

const ERROR_FIX_KEY: Record<CalendarErrorCode, string> = {
  GOOGLE_ENV_MISSING: 'calendar.fixEnv',
  GOOGLE_FN_MISSING: 'calendar.fixFn',
  UNAUTHENTICATED: 'calendar.fixAuth',
  GOOGLE_DENIED: 'calendar.fixDenied',
  NOT_CONNECTED: 'calendar.fixConnect',
  NEEDS_CALENDAR: 'calendar.fixCalendar',
  GOOGLE_HTTP: 'calendar.fixHttp',
  INVALID_COMMAND: 'calendar.fixInvalid',
  NETWORK: 'calendar.fixNetwork',
  GOOGLE_UNAVAILABLE: 'calendar.fixUnavailable',
  GOOGLE_RATE_LIMITED: 'calendar.fixRateLimited',
  GOOGLE_INVALID_EVENT: 'calendar.fixInvalidEvent',
  GOOGLE_CONFLICT: 'calendar.fixConflict',
  STORE_FAILED: 'calendar.fixStore',
}

export type CalendarPanelCopy = {
  statusLabel: string
  canConnect: boolean
  connectLabel: string | null
  accountEmail: string | null
  calendarSummary: string | null
  lastSync: LastSync | null
  intro: string | null
  hint: string | null
  errorText: string | null
}

const empty: Omit<CalendarPanelCopy, 'statusLabel'> = {
  canConnect: false,
  connectLabel: null,
  accountEmail: null,
  calendarSummary: null,
  lastSync: null,
  intro: null,
  hint: null,
  errorText: null,
}

export function errorCode(error: unknown): CalendarErrorCode {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : ''
  if (code in ERROR_KEY) return code as CalendarErrorCode
  // fetch() rejects with a TypeError when the network is down.
  if (error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'NETWORK'
  return 'GOOGLE_HTTP'
}

export function errorLine(error: unknown, locale: AppLocale = DEFAULT_LOCALE): string {
  return translate(locale, ERROR_KEY[errorCode(error)])
}

export function errorHint(error: unknown, locale: AppLocale = DEFAULT_LOCALE): string {
  return translate(locale, ERROR_FIX_KEY[errorCode(error)])
}

export function lastSyncLine(last: LastSync, locale: AppLocale = DEFAULT_LOCALE): string {
  if (last.error || last.errorCode) return translate(locale, 'calendar.lastFailed', { at: formatDateTime(locale, last.at) })
  return [
    translate(locale, 'calendar.lastSync', { at: formatDateTime(locale, last.at) }),
    translate(locale, 'calendar.imported', { count: last.imported }),
    translate(locale, 'calendar.exported', { count: last.exported }),
    translate(locale, 'calendar.deleted', { count: last.deletedLocal + last.deletedGoogle }),
  ].join(' · ')
}

export type SyncProblem = {
  /** One line, shown in the top banner and on the settings screen. */
  line: string
  hint: string | null
  /** Per-schedule failures, settings screen only. */
  details: readonly string[]
}

const DETAIL_LIMIT = 3

/**
 * The sync problem the server recorded for this connection, or null when the last sync was clean.
 * Banner and settings both read this, so they never disagree.
 */
export function syncProblem(view: ConnectionView, locale: AppLocale = DEFAULT_LOCALE): SyncProblem | null {
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values)
  if (view.status === 'needs_reauth') return { line: t('calendar.needsReauth'), hint: t('calendar.reauthHint'), details: [] }
  if (view.status !== 'ready') return null
  const last = view.lastSync
  const failures = last.failures ?? []
  if (last.errorCode || last.error) {
    const code = last.errorCode ?? 'GOOGLE_HTTP'
    return { line: t(ERROR_KEY[code]), hint: t(ERROR_FIX_KEY[code]), details: [] }
  }
  if (!failures.length) return null
  const next = failures.map(failure => failure.nextRetryAt).sort()[0]
  const codes = [...new Set(failures.map(failure => failure.code))]
  const details = failures.slice(0, DETAIL_LIMIT).map(failure => `${failure.title || t('calendar.untitled')} · ${t(ERROR_KEY[failure.code])}`)
  if (failures.length > DETAIL_LIMIT) details.push(t('calendar.moreFailures', { count: failures.length - DETAIL_LIMIT }))
  return {
    line: t('calendar.partialFailed', { count: failures.length }),
    hint: [
      codes.length === 1 ? t(ERROR_FIX_KEY[codes[0]]) : null,
      next ? t('calendar.retryAt', { at: formatDateTime(locale, next) }) : null,
    ].filter(Boolean).join(' ') || null,
    details,
  }
}

export function calendarPanel(view: ConnectionView, locale: AppLocale = DEFAULT_LOCALE): CalendarPanelCopy {
  const t = (key: string) => translate(locale, key)
  if (view.status === 'disconnected') {
    return {
      ...empty,
      statusLabel: t('calendar.disconnected'),
      canConnect: true,
      connectLabel: t('calendar.connect'),
      intro: t('calendar.intro'),
    }
  }
  if (view.status === 'awaiting_consent') {
    return {
      ...empty,
      statusLabel: t('calendar.awaiting'),
      canConnect: true,
      connectLabel: t('calendar.reconnect'),
      hint: t('calendar.awaitingHint'),
    }
  }
  if (view.status === 'connected') {
    return {
      ...empty,
      statusLabel: t('calendar.connected'),
      accountEmail: view.accountEmail,
      hint: t('calendar.connectedHint'),
    }
  }
  if (view.status === 'ready') {
    return {
      ...empty,
      statusLabel: t('calendar.connected'),
      accountEmail: view.accountEmail,
      calendarSummary: view.calendarSummary,
      lastSync: view.lastSync,
    }
  }
  if (view.status === 'needs_reauth') {
    return {
      ...empty,
      statusLabel: t('calendar.needsReauth'),
      canConnect: true,
      connectLabel: t('calendar.reconnect'),
      accountEmail: view.accountEmail,
      calendarSummary: view.calendarSummary,
      hint: t('calendar.reauthHint'),
    }
  }
  return {
    ...empty,
    statusLabel: t('calendar.error'),
    errorText: t(ERROR_KEY[view.code]),
    hint: t(ERROR_FIX_KEY[view.code]),
  }
}
