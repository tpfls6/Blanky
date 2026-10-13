import type { SupabaseClient } from '@supabase/supabase-js'
import type { NaturalLanguageScheduleRequest } from '../../types/src/schedule.ts'
import type { ParsedSchedule, ScheduleKind } from '../../parse/src/model.ts'
import type { Database } from './database.generated.ts'
import { AppError } from './errors.ts'
import { routeInput, PlannerRequiredError } from '../../parse/src/intentRouter.ts'
import { isRecord, readNullableString, readNumber, readString } from './guards.ts'

export const PARSE_SCHEDULE_FUNCTION = 'parse-schedule'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

function readKind(value: unknown): ScheduleKind | null {
  return value === 'event' || value === 'task' ? value : null
}

function readDay(value: unknown): string | null {
  const text = readNullableString(value)
  return text && DAY.test(text) ? text : null
}

function readClock(value: unknown): string | null {
  const text = readNullableString(value)
  return text && CLOCK.test(text) ? text : null
}

export function mapParsedSchedule(value: unknown): ParsedSchedule {
  if (!isRecord(value)) throw new AppError('SCHEDULE_PARSE_FAILED', '일정을 분석하지 못했습니다.')
  if (isRecord(value.error)) {
    const code = readString(value.error.code) ?? 'SCHEDULE_PARSE_FAILED'
    const message = readString(value.error.message) ?? '일정을 분석하지 못했습니다.'
    throw new AppError(code, message)
  }
  const type = readKind(value.type)
  const source = value.source === 'ai' || value.source === 'personal_rule' || value.source === 'rule'
    ? value.source
    : null
  const confidence = readNumber(value.confidence)
  if (!type || !source || confidence === null || !isRecord(value.draft)) {
    throw new AppError('SCHEDULE_PARSE_FAILED', '일정을 분석하지 못했습니다.')
  }
  const title = readString(value.draft.title)
  if (!title) throw new AppError('SCHEDULE_PARSE_FAILED', '일정을 분석하지 못했습니다.')
  return {
    type,
    source,
    confidence,
    draft: {
      title,
      date: readDay(value.draft.date),
      startTime: readClock(value.draft.startTime),
      endTime: readClock(value.draft.endTime),
      dueDate: readDay(value.draft.dueDate),
      endDate: readDay(value.draft.endDate),
      categoryId: readNullableString(value.draft.categoryId),
    },
  }
}

async function errorFromInvoke(error: unknown): Promise<AppError> {
  const context = isRecord(error) && error.context instanceof Response ? error.context : null
  if (context) {
    try {
      mapParsedSchedule(await context.clone().json())
    } catch (caught) {
      if (caught instanceof AppError) return caught
    }
  }
  return new AppError('SCHEDULE_PARSE_FAILED', '일정을 분석하지 못했습니다.', error)
}

/**
 * Asks the Supabase Edge Function to structure natural language.
 * Provider API keys stay in the function environment, not on web or mobile.
 */
export async function parseScheduleFromText(
  client: SupabaseClient<Database>,
  request: NaturalLanguageScheduleRequest,
): Promise<ParsedSchedule> {
  const text = request.text.trim()
  if (text && routeInput(text).route === 'planner') {
    const error = new PlannerRequiredError()
    throw new AppError(error.code, error.message)
  }
  if (!text) throw new AppError('INVALID_INPUT', '입력 내용을 확인해주세요.')
  const { data, error } = await client.functions.invoke(PARSE_SCHEDULE_FUNCTION, {
    body: { text, timezone: request.timezone },
  })
  if (error) throw await errorFromInvoke(error)
  return mapParsedSchedule(data)
}
