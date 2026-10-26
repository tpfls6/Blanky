import {
  asGoogleCalendarId,
  type DisconnectDisposition,
  type FirstImport,
  type GoogleCalendarId,
} from '../../../types/src/calendarSync.ts'
import { CalendarSyncError } from './errors.ts'

export type CalendarAction =
  | { type: 'status' }
  | { type: 'start_connect' }
  | { type: 'list_calendars' }
  | { type: 'select_calendar'; googleCalendarId: GoogleCalendarId; firstImport: FirstImport }
  | { type: 'sync' }
  | { type: 'set_auto_sync'; enabled: boolean }
  | { type: 'disconnect'; disposition: DisconnectDisposition }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function firstImport(value: unknown): FirstImport {
  const row = record(value)
  if (row?.direction === 'from_google' || row?.direction === 'from_blanky') return { direction: row.direction }
  throw new CalendarSyncError('INVALID_COMMAND', '첫 가져오기 방향을 확인해 주세요.')
}

function disposition(value: unknown): DisconnectDisposition {
  const row = record(value)
  if (row?.importedRows === 'keep' || row?.importedRows === 'delete') return { importedRows: row.importedRows }
  throw new CalendarSyncError('INVALID_COMMAND', '연결 해제 방식을 확인해 주세요.')
}

export function parseCalendarAction(body: unknown): CalendarAction {
  const row = record(body)
  if (!row || typeof row.type !== 'string') throw new CalendarSyncError('INVALID_COMMAND', 'Calendar 명령을 확인해 주세요.')
  if (row.type === 'status' || row.type === 'start_connect' || row.type === 'list_calendars' || row.type === 'sync') {
    return { type: row.type }
  }
  if (row.type === 'set_auto_sync') {
    if (typeof row.enabled !== 'boolean') throw new CalendarSyncError('INVALID_COMMAND', '자동 동기화 값을 확인해 주세요.')
    return { type: 'set_auto_sync', enabled: row.enabled }
  }
  if (row.type === 'select_calendar') {
    return {
      type: 'select_calendar',
      googleCalendarId: asGoogleCalendarId(row.googleCalendarId),
      firstImport: firstImport(row.firstImport),
    }
  }
  if (row.type === 'disconnect') return { type: 'disconnect', disposition: disposition(row.disposition) }
  throw new CalendarSyncError('INVALID_COMMAND', 'Calendar 명령을 확인해 주세요.')
}
