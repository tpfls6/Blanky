export type CalendarType = 'personal' | 'shared' | 'external'
export type CalendarRole = 'owner' | 'editor' | 'viewer'

export type Calendar = {
  id: string
  ownerUserId: string
  name: string
  description: string
  color: string
  icon: string
  type: CalendarType
  isDefaultPersonal: boolean
  timezone: string
  createdAt: string
  updatedAt: string
}

/** Phase 1 allows personal calendars; shared/external are enabled in later phases. */
export type PersonalCalendarInput = {
  name: string
  description?: string
  color?: string
  icon?: string
  timezone?: string
}
