import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import type {
  DevicePushToken,
  PushPlatform,
} from '../../types/src/notification.ts'
import { isRecord, readString } from './guards.ts'

const PLATFORMS = ['ios', 'android', 'web'] as const

function readPlatform(value: unknown): PushPlatform {
  const platform = PLATFORMS.find((item) => item === value)
  if (!platform) throw new AppError('REQUEST_FAILED', '알림 토큰 응답을 읽지 못했습니다.')
  return platform
}

function toToken(value: unknown): DevicePushToken {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '알림 토큰 응답을 읽지 못했습니다.')

  const id = readString(value.id)
  const userId = readString(value.user_id)
  const token = readString(value.token)
  const createdAt = readString(value.created_at)
  if (!id || !userId || !token || !createdAt) {
    throw new AppError('REQUEST_FAILED', '알림 토큰 응답을 읽지 못했습니다.')
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
  client: SupabaseClient<Database>,
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

      if (error) throw mapDbError(error)
      return toToken(data)
    },
  }
}
