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
  return code in ERROR_KEY ? code as CalendarErrorCode : 'GOOGLE_HTTP'
}

export function errorLine(error: unknown, locale: AppLocale = DEFAULT_LOCALE): string {
  return translate(locale, ERROR_KEY[errorCode(error)])
}

export function lastSyncLine(last: LastSync, locale: AppLocale = DEFAULT_LOCALE): string {
  if (last.error) return last.error
  return [
    translate(locale, 'calendar.lastSync', { at: formatDateTime(locale, last.at) }),
    translate(locale, 'calendar.imported', { count: last.imported }),
    translate(locale, 'calendar.exported', { count: last.exported }),
    translate(locale, 'calendar.deleted', { count: last.deletedLocal + last.deletedGoogle }),
  ].join(' · ')
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
