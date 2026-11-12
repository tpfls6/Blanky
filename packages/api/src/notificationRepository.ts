import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import type {
  AppNotification,
  AppNotificationType,
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

const TYPES: AppNotificationType[] = [
  'invite_received', 'invite_accepted', 'invite_declined',
  'schedule_created', 'schedule_updated', 'schedule_deleted',
  'member_removed', 'role_changed', 'ownership_transferred',
]

export function mapNotificationRow(value: unknown): AppNotification | null {
  if (!isRecord(value)) return null
  const type = TYPES.find(item => item === value.type)
  const id = readString(value.id)
  const createdAt = readString(value.created_at)
  if (!type || !id || !createdAt) return null
  const data = isRecord(value.data) ? value.data : {}
  const text = (key: string) => readString(data[key]) ?? ''
  return {
    id, type, createdAt,
    calendarId: readString(value.calendar_id) ?? null,
    scheduleId: readString(value.schedule_id) ?? null,
    actorName: text('actorName'),
    title: text('title'),
    calendarName: text('calendarName'),
    calendarColor: readString(data.calendarColor) ?? null,
    role: readString(data.role) ?? null,
    invitationId: readString(data.invitationId) ?? null,
    count: typeof value.count === 'number' ? value.count : 1,
    readAt: readString(value.read_at) ?? null,
  }
}

export type NotificationRepository = {
  list: (limit?: number) => Promise<AppNotification[]>
  markRead: (ids: string[]) => Promise<void>
  markAllRead: () => Promise<void>
  remove: (id: string) => Promise<void>
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
    async list(limit = 50) {
      const { data, error } = await client.from('notifications').select('*')
        .order('created_at', { ascending: false }).limit(limit)
      if (error) throw mapDbError(error)
      return (data ?? []).flatMap(row => {
        const item = mapNotificationRow(row)
        return item ? [item] : []
      })
    },
    async markRead(ids) {
      if (!ids.length) return
      const { error } = await client.from('notifications').update({ read_at: new Date().toISOString() })
        .in('id', ids).is('read_at', null)
      if (error) throw mapDbError(error)
    },
    async markAllRead() {
      const { error } = await client.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
      if (error) throw mapDbError(error)
    },
    async remove(id) {
      const { error } = await client.from('notifications').delete().eq('id', id)
      if (error) throw mapDbError(error)
    },
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
