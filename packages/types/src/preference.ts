/**
 * Per-user settings shared by web and mobile.
 * dayStartTime and dayEndTime bound gap-time suggestions.
 * `settings` holds the rest of the web UI blob (nav, density, saved accents).
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
  theme: string
  accentColor: string
  scheduleDefaultView: string
  weekStartsOn: 0 | 1
  autoClassification: boolean
  autoSaveAfterClassification: boolean
  settings: Record<string, unknown>
  updatedAt: string
}
