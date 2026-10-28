import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import { mapBatchError, parseScheduleBatchResult, type ScheduleBatchResult } from './scheduleBatch.ts'
import { isCalendarDate } from '../../types/src/aiSchema.ts'
import { normalizeRepeatDays } from '../../types/src/recurrence.ts'
import type {
  Priority,
  Schedule,
  ScheduleAiMetadata,
  ScheduleChange,
  ScheduleChangeAction,
  ScheduleDraft,
  ScheduleStatus,
} from '../../types/src/schedule.ts'
import {
  isRecord,
  readClock,
  readNullableString,
  readNumber,
  readString,
} from './guards.ts'

const PRIORITIES = ['low', 'medium', 'high'] as const
const STATUSES = ['todo', 'in_progress', 'done'] as const
const CHANGE_ACTIONS = ['created', 'updated', 'completed', 'deleted'] as const

function requireString(value: unknown, field: string): string {
  const text = readString(value)
  if (!text) throw new AppError('REQUEST_FAILED', '일정 응답을 읽지 못했습니다.', field)
  return text
}

function readPriority(value: unknown): Priority {
  const priority = PRIORITIES.find((item) => item === value)
  if (!priority) throw new AppError('REQUEST_FAILED', '일정 응답을 읽지 못했습니다.')
  return priority
}

function readStatus(value: unknown): ScheduleStatus {
  const status = STATUSES.find((item) => item === value)
  if (!status) throw new AppError('REQUEST_FAILED', '일정 응답을 읽지 못했습니다.')
  return status
}

function readChangeAction(value: unknown): ScheduleChangeAction {
  const action = CHANGE_ACTIONS.find((item) => item === value)
  if (!action) throw new AppError('REQUEST_FAILED', '일정 응답을 읽지 못했습니다.')
  return action
}

function readAi(row: Record<string, unknown>): ScheduleAiMetadata | null {
  const sourceText = readNullableString(row.source_text)
  const model = readNullableString(row.ai_model)
  const parsedAt = readNullableString(row.ai_parsed_at)
  const confidence = readNumber(row.ai_confidence)
  if (!sourceText && !model && !parsedAt && confidence === null) return null

  return {
    sourceText: sourceText ?? '',
    confidence,
    model,
    parsedAt,
  }
}

export function mapScheduleRow(value: unknown): Schedule {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '일정 응답을 읽지 못했습니다.')

  return {
    plannerApprovalKey: readNullableString(value.planner_approval_key),
    kind: value.kind === 'task' ? 'task' : 'event',
    dueDate: readNullableString(value.due_date),
    endDate: readNullableString(value.end_date),
    allDay: value.all_day === true,
    repeat: value.repeat_rule === 'daily' || value.repeat_rule === 'weekly' || value.repeat_rule === 'monthly' ? value.repeat_rule : 'none',
    repeatDays: normalizeRepeatDays(value.repeat_days),
    id: requireString(value.id, 'id'),
    userId: requireString(value.user_id, 'user_id'),
    calendarId: requireString(value.calendar_id, 'calendar_id'),
    createdByUserId: readNullableString(value.created_by_user_id),
    title: requireString(value.title, 'title'),
    description: readNullableString(value.description) ?? '',
    date: requireString(value.date, 'date'),
    startTime: readClock(value.start_time),
    endTime: readClock(value.end_time),
    duration: readNumber(value.duration_minutes),
    categoryId: readNullableString(value.category_id),
    priority: readPriority(value.priority),
    status: readStatus(value.status),
    sourceText: readNullableString(value.source_text),
    reminderAt: readNullableString(value.reminder_at),
    completedAt: readNullableString(value.completed_at),
    createdAt: requireString(value.created_at, 'created_at'),
    updatedAt: requireString(value.updated_at, 'updated_at'),
    ai: readAi(value),
    changeSource: value.change_source === 'ai_chat' || value.change_source === 'calendar_sync' ? value.change_source : 'manual',
  }
}

function toScheduleChange(value: unknown): ScheduleChange {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '일정 응답을 읽지 못했습니다.')

  return {
    id: requireString(value.id, 'id'),
    entityType: value.entity_type === 'task' ? 'task' : 'event',
    beforeData: isRecord(value.before_data) ? mapScheduleRow(value.before_data) : null,
    afterData: isRecord(value.after_data) ? mapScheduleRow(value.after_data) : null,
    source: value.source === 'ai_chat' ? 'ai_chat' : 'manual',
    scheduleId: requireString(value.schedule_id, 'schedule_id'),
    userId: requireString(value.user_id, 'user_id'),
    action: readChangeAction(value.action),
    createdAt: requireString(value.created_at, 'created_at'),
  }
}

function scheduleColumns(draft: ScheduleDraft) {
  if (!draft.date) throw new AppError('INVALID_INPUT', '날짜를 확인해 주세요.')
  return {
    ...(draft.calendarId !== undefined ? { calendar_id: draft.calendarId } : {}),
    kind: draft.kind ?? 'event',
    due_date: draft.dueDate ?? null,
    end_date: draft.endDate ?? null,
    all_day: draft.allDay ?? false,
    repeat_rule: draft.repeat ?? 'none',
    repeat_days: draft.repeat === 'weekly' ? normalizeRepeatDays(draft.repeatDays) : [],
    change_source: draft.changeSource ?? 'manual',
    title: draft.title,
    description: draft.description ?? '',
    date: draft.date,
    start_time: draft.startTime ?? null,
    end_time: draft.endTime ?? null,
    duration_minutes: draft.duration ?? null,
    category_id: draft.categoryId ?? null,
    priority: draft.priority ?? 'medium',
    status: draft.status ?? 'todo',
    source_text: draft.sourceText ?? draft.ai?.sourceText ?? null,
    ai_confidence: draft.ai?.confidence ?? null,
    ai_model: draft.ai?.model ?? null,
    ai_parsed_at: draft.ai?.parsedAt ?? null,
    reminder_at: draft.reminderAt ?? null,
  }
}

async function readRows(data: unknown): Promise<Schedule[]> {
  if (!Array.isArray(data)) return []
  return data.map(mapScheduleRow)
}

export type ScheduleRepository = {
  listByDate: (date: string) => Promise<Schedule[]>
  listRange: (startDate: string, endDate: string) => Promise<Schedule[]>
  listForPlanning: (startDate: string, endDate: string) => Promise<Schedule[]>
  create: (userId: string, draft: ScheduleDraft) => Promise<Schedule>
  update: (id: string, draft: ScheduleDraft) => Promise<Schedule>
  remove: (id: string) => Promise<void>
  applyBatch: (key: string, deletes: string[]) => Promise<ScheduleBatchResult>
  listChanges: (scheduleId?: string) => Promise<ScheduleChange[]>
}

export function createScheduleRepository(
  client: SupabaseClient<Database>,
): ScheduleRepository {
  return {
    async listForPlanning(startDate, endDate) {
      if (!isCalendarDate(startDate) || !isCalendarDate(endDate) || startDate > endDate) throw new AppError('INVALID_INPUT', '조회 날짜를 확인해 주세요.')
      const shift = (day: string, amount: number) => new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10)
      // Include earlier multi-day/recurring anchors, overnight carryover and timezone margins.
      const lower = shift(startDate, -2), upper = shift(endDate, 2)
      const rows: Schedule[] = []
      for (let offset = 0; offset < 10000; offset += 500) {
        const { data, error } = await client.from('schedules').select('*').lte('date', upper)
          .or(`date.gte.${lower},end_date.gte.${lower},repeat_rule.neq.none`)
          .order('date', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499)
        if (error) throw mapDbError(error)
        const page = await readRows(data)
        rows.push(...page)
        if (page.length < 500) return rows
      }
      throw new AppError('SCHEDULE_LIMIT_EXCEEDED', '일정이 너무 많아 안전한 추천을 만들 수 없어요. 조회 범위를 줄여 주세요.')
    },
    async listByDate(date) {
      const { data, error } = await client
        .from('schedules')
        .select('*')
        .eq('date', date)
        .order('start_time', { ascending: true })

      if (error) throw mapDbError(error)
      return readRows(data)
    },

    async listRange(startDate, endDate) {
      const { data, error } = await client
        .from('schedules')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })

      if (error) throw mapDbError(error)
      return readRows(data)
    },

    async create(userId, draft) {
      const { data, error } = await client
        .from('schedules')
        .insert({ ...scheduleColumns(draft), user_id: userId })
        .select('*')
        .single()

      if (error) throw mapDbError(error)
      return mapScheduleRow(data)
    },

    async update(id, draft) {
      const { data, error } = await client
        .from('schedules')
        .update({
          ...scheduleColumns(draft),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single()

      if (error) throw mapDbError(error)
      return mapScheduleRow(data)
    },

    async remove(id) {
      const { error } = await client.from('schedules').delete().eq('id', id)
      if (error) throw mapDbError(error)
    },

    async applyBatch(key, deletes) {
      const { data, error } = await client.rpc('apply_schedule_batch', { p_key: key, p_deletes: deletes })
      if (error) throw mapBatchError(error)
      return parseScheduleBatchResult(data)
    },

    async listChanges(scheduleId) {
      let query = client
        .from('schedule_changes')
        .select('*')
        .order('created_at', { ascending: false })

      if (scheduleId) query = query.eq('schedule_id', scheduleId)

      const { data, error } = await query
      if (error) throw mapDbError(error)
      if (!Array.isArray(data)) return []
      return data.map(toScheduleChange)
    },
  }
}
