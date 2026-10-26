import type { ConnectionView } from '../../../types/src/calendarSync.ts'
import type { Connection } from './domain.ts'

export function viewFromConnection(connection: Connection | null): ConnectionView {
  if (!connection) return { status: 'disconnected' }
  if (connection.status === 'awaiting_consent') return { status: 'awaiting_consent' }
  if (connection.status === 'connected') return { status: 'connected', accountEmail: connection.accountEmail }
  if (connection.status === 'needs_reauth') {
    return {
      status: 'needs_reauth',
      accountEmail: connection.accountEmail,
      calendarSummary: connection.calendar.summary,
    }
  }
  return {
    status: 'ready',
    accountEmail: connection.accountEmail,
    calendarSummary: connection.calendar.summary,
    autoSync: connection.autoSync,
    lastSync: connection.lastSync,
  }
}
