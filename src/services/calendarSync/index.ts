import { createCalendarSyncClient } from '@blanky/api'
import { getSupabaseClient } from '../supabase/client.ts'
import type { SyncReport } from '@blanky/types'

const pending = new Map<string, Promise<SyncReport>>()

export function synchronizeCalendars(userId: string, refresh: () => Promise<void>): Promise<SyncReport> {
  const existing = pending.get(userId)
  if (existing) return existing
  const operation = (async () => {
    const report = await getCalendarSyncClient().sync()
    await refresh()
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
