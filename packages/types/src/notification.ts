export type PushPlatform = 'ios' | 'android' | 'web'

/** Device token stored for a later push provider. The client never sends provider secrets. */
export type DevicePushToken = {
  id: string
  userId: string
  platform: PushPlatform
  token: string
  createdAt: string
}

export type AppNotificationType =
  | 'invite_received' | 'invite_accepted' | 'invite_declined'
  | 'schedule_created' | 'schedule_updated' | 'schedule_deleted'
  | 'member_removed' | 'role_changed' | 'ownership_transferred'

/** In-app notice. Repeated changes to one schedule share a row while unread; `count` says how many. */
export type AppNotification = {
  id: string
  type: AppNotificationType
  calendarId: string | null
  scheduleId: string | null
  actorName: string
  title: string
  calendarName: string
  calendarColor: string | null
  role: string | null
  invitationId: string | null
  count: number
  readAt: string | null
  createdAt: string
}
