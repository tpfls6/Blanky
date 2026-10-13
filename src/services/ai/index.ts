import { parseScheduleFromText as parseOnServer } from '@blanky/api'
import type { NaturalLanguageScheduleRequest } from '@blanky/types'
import type { ParsedSchedule } from '@blanky/parse'
import { getSupabaseClient } from '../supabase/client.ts'

export type { NaturalLanguageScheduleRequest } from '@blanky/types'
export type { ParsedSchedule } from '@blanky/parse'
export type { InputRoute } from '@blanky/types'
export { routeInput, PlannerRequiredError } from '@blanky/parse'

export async function parseScheduleFromText(
  request: NaturalLanguageScheduleRequest,
): Promise<ParsedSchedule> {
  return parseOnServer(getSupabaseClient(), request)
}
