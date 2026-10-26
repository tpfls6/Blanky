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

async function invoke(client: SupabaseClient, body: unknown): Promise<Record<string, unknown>> {
  const { data, error } = await client.functions.invoke('google-calendar', { body })
  const payload = record(data)
  if (payload.error) throw asCalendarSyncError(payload.error)
  if (error) {
    const context = error as { context?: Response }
    if (context.context && typeof context.context.json === 'function') {
      const nested = record(await context.context.json().catch(() => null))
      if (nested.error && isCalendarError(nested.error)) throw asCalendarSyncError(nested.error)
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
