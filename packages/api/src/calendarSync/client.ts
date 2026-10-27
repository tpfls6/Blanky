import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ConnectionView,
  DisconnectDisposition,
  FirstImport,
  GoogleCalendarChoice,
  GoogleCalendarId,
  SyncReport,
} from '../../../types/src/calendarSync.ts'
import { asCalendarSyncError, isCalendarError } from './errors.ts'

export type CalendarSyncClient = {
  status(): Promise<ConnectionView>
  startConnect(): Promise<{ authUrl: string }>
  listCalendars(): Promise<readonly GoogleCalendarChoice[]>
  selectCalendar(input: {
    googleCalendarId: GoogleCalendarId
    firstImport: FirstImport
  }): Promise<ConnectionView>
  sync(): Promise<SyncReport>
  setAutoSync(enabled: boolean): Promise<ConnectionView>
  disconnect(disposition: DisconnectDisposition): Promise<ConnectionView>
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

async function functionErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  const context = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: { clone?: () => { json?: () => Promise<unknown> }; json?: () => Promise<unknown> } }).context
    : undefined
  if (!context) return null
  const reader = typeof context.clone === 'function' ? context.clone() : context
  if (typeof reader.json !== 'function') return null
  return record(await reader.json().catch(() => null))
}

function isMissingFunction(body: Record<string, unknown>, message: string): boolean {
  const code = typeof body.code === 'string' ? body.code : ''
  const text = `${code} ${typeof body.message === 'string' ? body.message : ''} ${message}`.toLowerCase()
  return code === 'NOT_FOUND' || text.includes('requested function was not found') || text.includes('function not found')
}

async function invoke(client: SupabaseClient, body: unknown): Promise<Record<string, unknown>> {
  const { data, error } = await client.functions.invoke('google-calendar', { body })
  const payload = record(data)
  if (payload.error) throw asCalendarSyncError(payload.error)
  if (error) {
    const nested = await functionErrorBody(error)
    if (nested) {
      if (nested.error && isCalendarError(nested.error)) throw asCalendarSyncError(nested.error)
      if (isMissingFunction(nested, error.message)) {
        throw asCalendarSyncError({
          code: 'GOOGLE_FN_MISSING',
          message: 'google-calendar Edge Function이 배포되지 않았습니다.',
        })
      }
      if (isCalendarError(nested)) throw asCalendarSyncError(nested)
    }
    if (isMissingFunction({}, error.message)) {
      throw asCalendarSyncError({
        code: 'GOOGLE_FN_MISSING',
        message: 'google-calendar Edge Function이 배포되지 않았습니다.',
      })
    }
    throw asCalendarSyncError({ code: 'GOOGLE_HTTP', message: error.message })
  }
  return payload
}

function asView(value: Record<string, unknown>): ConnectionView {
  if (value.status === 'disconnected' || value.status === 'awaiting_consent') return { status: value.status }
  if (value.status === 'connected' && typeof value.accountEmail === 'string') {
    return { status: 'connected', accountEmail: value.accountEmail }
  }
  if (value.status === 'needs_reauth' && typeof value.accountEmail === 'string' && typeof value.calendarSummary === 'string') {
    return { status: 'needs_reauth', accountEmail: value.accountEmail, calendarSummary: value.calendarSummary }
  }
  if (value.status === 'ready' && typeof value.accountEmail === 'string' && typeof value.calendarSummary === 'string' && typeof value.autoSync === 'boolean' && value.lastSync && typeof value.lastSync === 'object') {
    return value as ConnectionView
  }
  if (value.status === 'error' && typeof value.message === 'string' && typeof value.code === 'string') {
    return value as ConnectionView
  }
  throw asCalendarSyncError({ code: 'INVALID_COMMAND', message: '연결 상태를 읽지 못했습니다.' })
}

export function createCalendarSyncClient(client: SupabaseClient): CalendarSyncClient {
  return {
    async status() {
      return asView(await invoke(client, { type: 'status' }))
    },
    async startConnect() {
      const payload = await invoke(client, { type: 'start_connect' })
      if (typeof payload.authUrl !== 'string' || !payload.authUrl) {
        throw asCalendarSyncError({ code: 'GOOGLE_HTTP', message: 'Google 동의 주소를 받지 못했습니다.' })
      }
      return { authUrl: payload.authUrl }
    },
    async listCalendars() {
      const payload = await invoke(client, { type: 'list_calendars' })
      return Array.isArray(payload.calendars) ? payload.calendars as GoogleCalendarChoice[] : []
    },
    async selectCalendar(input) {
      return asView(await invoke(client, { type: 'select_calendar', ...input }))
    },
    async sync() {
      return await invoke(client, { type: 'sync' }) as unknown as SyncReport
    },
    async setAutoSync(enabled) {
      return asView(await invoke(client, { type: 'set_auto_sync', enabled }))
    },
    async disconnect(disposition) {
      return asView(await invoke(client, { type: 'disconnect', disposition }))
    },
  }
}
