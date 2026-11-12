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

/** Shared calendars are created with this; members are added through invitations. */
export type SharedCalendarInput = {
  name: string
  description?: string
  color?: string
}

/** A readable calendar with the signed-in user's membership. Personal calendars report role 'owner'. */
export type CalendarEntry = Calendar & {
  role: CalendarRole
  hidden: boolean
  notify: boolean
}

export type CalendarMember = {
  userId: string
  role: CalendarRole
  displayName: string
  email: string
  joinedAt: string
  isMe: boolean
}

export type InviteRole = Exclude<CalendarRole, 'owner'>

/** Pending invitations as the calendar owner sees them. */
export type CalendarInvitation = {
  id: string
  calendarId: string
  kind: 'email' | 'link'
  email: string | null
  role: InviteRole
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  expiresAt: string
  createdAt: string
}

/** An email invitation addressed to the signed-in user. */
export type ReceivedInvitation = {
  id: string
  calendarId: string
  calendarName: string
  calendarColor: string
  role: InviteRole
  inviterName: string
  expiresAt: string
}

export type InviteLink = { id: string; token: string; role: InviteRole; expiresAt: string }

export type InviteLinkPreview = {
  state: 'pending' | 'member' | 'revoked' | 'expired' | 'invalid'
  calendarId: string | null
  calendarName: string | null
  calendarColor: string | null
  role: InviteRole | null
  inviterName: string | null
  expiresAt: string | null
}
