export type PushPlatform = 'ios' | 'android' | 'web'

/** Device token stored for a later push provider. The client never sends provider secrets. */
export type DevicePushToken = {
  id: string
  userId: string
  platform: PushPlatform
  token: string
  createdAt: string
}
