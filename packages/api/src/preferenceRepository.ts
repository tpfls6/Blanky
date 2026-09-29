import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserPreference } from '../../types/src/preference.ts'
import {
  isRecord,
  readBoolean,
  readNumber,
  readString,
} from './guards.ts'

function toPreference(value: unknown): UserPreference {
  if (!isRecord(value)) throw new Error('Preference row was not an object.')

  const userId = readString(value.user_id)
  const timezone = readString(value.timezone)
  const dayStartTime = readString(value.day_start_time)
  const dayEndTime = readString(value.day_end_time)
  const defaultDuration = readNumber(value.default_duration_minutes)
  const locale = readString(value.locale)
  const notificationsEnabled = readBoolean(value.notifications_enabled)
  const updatedAt = readString(value.updated_at)

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
    throw new Error('Preference row is incomplete.')
  }

  return {
    userId,
    timezone,
    dayStartTime: dayStartTime.slice(0, 5),
    dayEndTime: dayEndTime.slice(0, 5),
    defaultDuration,
    locale,
    notificationsEnabled,
    updatedAt,
  }
}

export type PreferenceRepository = {
  get: (userId: string) => Promise<UserPreference | null>
  save: (preference: UserPreference) => Promise<UserPreference>
}

export function createPreferenceRepository(
  client: SupabaseClient,
): PreferenceRepository {
  return {
    async get(userId) {
      const { data, error } = await client
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) return null
      return toPreference(data)
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
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      return toPreference(data)
    },
  }
}
