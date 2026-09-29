import { parseScheduleFromText as parseOnServer } from '@blanky/api'
import type { NaturalLanguageScheduleRequest, ScheduleDraft } from '@blanky/types'
import { getSupabaseClient } from '../supabase/client.ts'

export type { NaturalLanguageScheduleRequest } from '@blanky/types'

export async function parseScheduleFromText(
  request: NaturalLanguageScheduleRequest,
): Promise<ScheduleDraft> {
  return parseOnServer(getSupabaseClient(), request)
}
