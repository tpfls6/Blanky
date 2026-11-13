import { createCalendarSyncClient } from '@blanky/api'
import { getSupabaseClient } from '../supabase/client.ts'
import type { SyncReport } from '@blanky/types'

const pending = new Map<string, Promise<SyncReport>>()

export function synchronizeCalendars(
  userId: string,
  refresh: () => Promise<void>,
  options: { force?: boolean } = {},
): Promise<SyncReport> {
  const existing = pending.get(userId)
  if (existing) return existing
  const operation = (async () => {
    const report = await getCalendarSyncClient().sync(options)
    // A failed local reload is not a Google Calendar failure; the next reload picks the rows up.
    await refresh().catch((error: unknown) => console.warn('Blanky reload after calendar sync failed', error))
    window.dispatchEvent(new Event('blanky:calendar-synced'))
    return report
  })().finally(() => pending.delete(userId))
  pending.set(userId, operation)
  return operation
}

export function getCalendarSyncClient() {
  return createCalendarSyncClient(getSupabaseClient())
}

export { isGoogleOriginWork } from './origin.ts'
