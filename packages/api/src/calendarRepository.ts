import type { SupabaseClient } from '@supabase/supabase-js'
import type { Calendar, PersonalCalendarInput } from '../../types/src/calendar.ts'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import { isRecord } from './guards.ts'

export function mapCalendarRow(value: unknown): Calendar {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '캘린더 응답을 읽지 못했습니다.')
  const text = (key: string): string => {
    if (typeof value[key] !== 'string') throw new AppError('REQUEST_FAILED', '캘린더 응답을 읽지 못했습니다.', key)
    return value[key]
  }
  const type = text('type')
  if (!['personal', 'shared', 'external'].includes(type) || typeof value.is_default_personal !== 'boolean') {
    throw new AppError('REQUEST_FAILED', '캘린더 응답을 읽지 못했습니다.')
  }
  return {
    id: text('id'), ownerUserId: text('owner_user_id'), name: text('name'),
    description: text('description'), color: text('color'), icon: text('icon'),
    type: type as Calendar['type'], isDefaultPersonal: value.is_default_personal,
    timezone: text('timezone'), createdAt: text('created_at'), updatedAt: text('updated_at'),
  }
}

function columns(input: Partial<PersonalCalendarInput>) {
  if (input.name !== undefined && !input.name.trim()) throw new AppError('INVALID_INPUT', '캘린더 이름을 입력해 주세요.')
  if (input.timezone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }) }
    catch { throw new AppError('INVALID_INPUT', '시간대를 확인해 주세요.') }
  }
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  }
}

export function createCalendarRepository(client: SupabaseClient<Database>) {
  return {
    async getCalendars(): Promise<Calendar[]> {
      const { data, error } = await client.from('calendars').select('*').order('created_at')
      if (error) throw mapDbError(error)
      return (data ?? []).map(mapCalendarRow)
    },
    async getCalendar(id: string): Promise<Calendar> {
      const { data, error } = await client.from('calendars').select('*').eq('id', id).single()
      if (error) throw mapDbError(error)
      return mapCalendarRow(data)
    },
    async getDefaultPersonalCalendar(): Promise<Calendar> {
      const { data, error } = await client.from('calendars').select('*').eq('is_default_personal', true).single()
      if (error) throw mapDbError(error)
      return mapCalendarRow(data)
    },
    async createCalendar(input: PersonalCalendarInput): Promise<Calendar> {
      const { data: auth, error: authError } = await client.auth.getUser()
      if (authError || !auth.user) throw new AppError('UNAUTHORIZED', '로그인이 필요합니다.')
      const { data, error } = await client.from('calendars').insert({
        ...columns(input), owner_user_id: auth.user.id, type: 'personal',
      }).select('*').single()
      if (error) throw mapDbError(error)
      return mapCalendarRow(data)
    },
    async updateCalendar(id: string, input: Partial<PersonalCalendarInput>): Promise<Calendar> {
      const { data, error } = await client.from('calendars').update(columns(input)).eq('id', id).select('*').single()
      if (error) throw mapDbError(error)
      return mapCalendarRow(data)
    },
    /** Default personal calendars and nonempty calendars cannot be deleted. */
    async deleteCalendar(id: string): Promise<void> {
      const { error } = await client.from('calendars').delete().eq('id', id).select('id').single()
      if (error) throw mapDbError(error)
    },
  }
}

export type CalendarRepository = ReturnType<typeof createCalendarRepository>
