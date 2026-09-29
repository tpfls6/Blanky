import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  NaturalLanguageScheduleRequest,
  Priority,
  ScheduleDraft,
  ScheduleStatus,
} from '../../types/src/schedule.ts'
import { isRecord, readNullableString, readNumber, readString } from './guards.ts'

export const PARSE_SCHEDULE_FUNCTION = 'parse-schedule'

const PRIORITIES = ['low', 'medium', 'high'] as const
const STATUSES = ['todo', 'in_progress', 'done'] as const

function readPriority(value: unknown): Priority | undefined {
  return PRIORITIES.find((priority) => priority === value)
}

function readStatus(value: unknown): ScheduleStatus | undefined {
  return STATUSES.find((status) => status === value)
}

function readScheduleDraft(value: unknown): ScheduleDraft {
  if (!isRecord(value) || !isRecord(value.draft)) {
    throw new Error('AI response did not include a schedule draft.')
  }

  const draft = value.draft
  const title = readString(draft.title)
  if (!title) {
    throw new Error('AI response did not include a schedule title.')
  }

  const result: ScheduleDraft = { title }
  const description = readString(draft.description)
  const date = readString(draft.date)
  const sourceText = readString(draft.sourceText)
  const priority = readPriority(draft.priority)
  const status = readStatus(draft.status)
  const duration = readNumber(draft.duration)

  if (description) result.description = description
  if (date) result.date = date
  if (sourceText) result.sourceText = sourceText
  if (priority) result.priority = priority
  if (status) result.status = status
  if (duration !== null) result.duration = duration

  if ('startTime' in draft) result.startTime = readNullableString(draft.startTime)
  if ('endTime' in draft) result.endTime = readNullableString(draft.endTime)
  if ('categoryId' in draft) result.categoryId = readNullableString(draft.categoryId)
  if ('reminderAt' in draft) result.reminderAt = readNullableString(draft.reminderAt)

  return result
}

/**
 * Asks the Supabase Edge Function to structure natural language.
 * Provider API keys stay in the function environment, not on web or mobile.
 */
export async function parseScheduleFromText(
  client: SupabaseClient,
  request: NaturalLanguageScheduleRequest,
): Promise<ScheduleDraft> {
  const { data, error } = await client.functions.invoke(PARSE_SCHEDULE_FUNCTION, {
    body: request,
  })

  if (error) throw new Error(error.message)
  return readScheduleDraft(data)
}
