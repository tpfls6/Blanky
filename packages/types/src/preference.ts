/**
 * Per-user settings shared by web and mobile.
 * dayStartTime and dayEndTime bound gap-time suggestions.
 */
export type UserPreference = {
  userId: string
  timezone: string
  dayStartTime: string
  dayEndTime: string
  /** Default expected length in minutes. */
  defaultDuration: number
  locale: string
  notificationsEnabled: boolean
  updatedAt: string
}
