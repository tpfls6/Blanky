import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DevicePushToken,
  PushPlatform,
} from '../../types/src/notification.ts'
import { isRecord, readString } from './guards.ts'

const PLATFORMS = ['ios', 'android', 'web'] as const

function readPlatform(value: unknown): PushPlatform {
  const platform = PLATFORMS.find((item) => item === value)
  if (!platform) throw new Error('Push token row has an unknown platform.')
  return platform
}

function toToken(value: unknown): DevicePushToken {
  if (!isRecord(value)) throw new Error('Push token row was not an object.')

  const id = readString(value.id)
  const userId = readString(value.user_id)
  const token = readString(value.token)
  const createdAt = readString(value.created_at)
  if (!id || !userId || !token || !createdAt) {
    throw new Error('Push token row is incomplete.')
  }

  return {
    id,
    userId,
    platform: readPlatform(value.platform),
    token,
    createdAt,
  }
}

export type NotificationRepository = {
  registerToken: (input: {
    userId: string
    platform: PushPlatform
    token: string
  }) => Promise<DevicePushToken>
}

export function createNotificationRepository(
  client: SupabaseClient,
): NotificationRepository {
  return {
    async registerToken(input) {
      const { data, error } = await client
        .from('device_push_tokens')
        .upsert(
          {
            user_id: input.userId,
            platform: input.platform,
            token: input.token,
          },
          { onConflict: 'user_id,platform,token' },
        )
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      return toToken(data)
    },
  }
}
