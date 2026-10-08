import { createCalendarRepository, type CalendarRepository } from '@blanky/api'
import { getSupabaseClient } from '../supabase/client.ts'

export function getCalendarRepository(): CalendarRepository {
  return createCalendarRepository(getSupabaseClient())
}
