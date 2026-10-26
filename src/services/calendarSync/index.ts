import { createCalendarSyncClient } from '@blanky/api'
import { getSupabaseClient } from '../supabase/client.ts'

export function getCalendarSyncClient() {
  return createCalendarSyncClient(getSupabaseClient())
}

export { isGoogleOriginWork } from './origin.ts'
