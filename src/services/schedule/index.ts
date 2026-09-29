import { createScheduleRepository, type ScheduleRepository } from '@blanky/api'
import { getSupabaseClient } from '../supabase/client.ts'

export function getScheduleRepository(): ScheduleRepository {
  return createScheduleRepository(getSupabaseClient())
}
