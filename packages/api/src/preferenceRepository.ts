import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserPreference } from '../../types/src/preference.ts'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import { asJson, asRecord } from './json.ts'
import {
  isRecord,
  readBoolean,
  readNumber,
  readString,
} from './guards.ts'

export function mapPreferenceRow(value: unknown): UserPreference {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '설정 응답을 읽지 못했습니다.')

  const userId = readString(value.user_id)
  const timezone = readString(value.timezone)
  const dayStartTime = readString(value.day_start_time)
  const dayEndTime = readString(value.day_end_time)
  const defaultDuration = readNumber(value.default_duration_minutes)
  const locale = readString(value.locale)
  const notificationsEnabled = readBoolean(value.notifications_enabled)
  const updatedAt = readString(value.updated_at)
  const week = readNumber(value.week_starts_on)

  if (
    !userId ||
    !timezone ||
    !dayStartTime ||
    !dayEndTime ||
    defaultDuration === null ||
    !locale ||
    notificationsEnabled === null ||
    !updatedAt
  ) {
    throw new AppError('REQUEST_FAILED', '설정 응답을 읽지 못했습니다.')
  }

  return {
    userId,
    timezone,
    dayStartTime: dayStartTime.slice(0, 5),
    dayEndTime: dayEndTime.slice(0, 5),
    defaultDuration,
    locale,
    notificationsEnabled,
    theme: readString(value.theme) ?? 'light',
    accentColor: readString(value.accent) ?? 'blue',
    scheduleDefaultView: readString(value.schedule_default_view) ?? 'all',
    weekStartsOn: week === 1 ? 1 : 0,
    autoClassification: readBoolean(value.auto_classification) ?? true,
    autoSaveAfterClassification: readBoolean(value.auto_save_after_classification) ?? false,
    settings: asRecord(value.settings),
    updatedAt,
  }
}

export type PreferenceRepository = {
  get: (userId: string) => Promise<UserPreference | null>
  save: (preference: UserPreference) => Promise<UserPreference>
}

export function createPreferenceRepository(
  client: SupabaseClient<Database>,
): PreferenceRepository {
  return {
    async get(userId) {
      const { data, error } = await client
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw mapDbError(error)
      if (!data) return null
      return mapPreferenceRow(data)
    },

    async save(preference) {
      const { data, error } = await client
        .from('user_preferences')
        .upsert({
          user_id: preference.userId,
          timezone: preference.timezone,
          day_start_time: preference.dayStartTime,
          day_end_time: preference.dayEndTime,
          default_duration_minutes: preference.defaultDuration,
          locale: preference.locale,
          notifications_enabled: preference.notificationsEnabled,
          theme: preference.theme,
          accent: preference.accentColor,
          schedule_default_view: preference.scheduleDefaultView,
          week_starts_on: preference.weekStartsOn,
          auto_classification: preference.autoClassification,
          auto_save_after_classification: preference.autoSaveAfterClassification,
          settings: asJson(preference.settings),
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single()

      if (error) throw mapDbError(error)
      return mapPreferenceRow(data)
    },
  }
}
