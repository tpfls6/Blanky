import { createContext, useContext } from 'react'
import type { AppNotification, CalendarEntry, CalendarMember, ReceivedInvitation } from '@blanky/types'
import type { WorkItem } from '../types/work.ts'

export type CalendarsValue = {
  /** Empty without Supabase; every item then counts as personal and visible. */
  entries: CalendarEntry[]
  ready: boolean
  error: string
  entryOf: (calendarId: string | undefined | null) => CalendarEntry | undefined
  /** Calendars the user can save into, personal first. */
  writable: CalendarEntry[]
  canEdit: (item: Pick<WorkItem, 'calendarId'>) => boolean
  /** Items of calendars the user has not hidden, with shared calendar colors attached. */
  visible: (items: WorkItem[]) => WorkItem[]
  setHidden: (calendarId: string, hidden: boolean) => Promise<void>
  setNotify: (calendarId: string, notify: boolean) => Promise<void>
  refresh: () => Promise<void>
  members: (calendarId: string) => CalendarMember[] | undefined
  loadMembers: (calendarId: string, force?: boolean) => Promise<CalendarMember[]>
  notifications: AppNotification[]
  unread: number
  markRead: (ids: string[]) => Promise<void>
  markAllRead: () => Promise<void>
  invitations: ReceivedInvitation[]
  respond: (invitationId: string, accept: boolean) => Promise<void>
  /** Realtime connection; 'offline' while the browser or channel is down. */
  connection: 'live' | 'connecting' | 'offline'
}

export const CalendarsContext = createContext<CalendarsValue | null>(null)

export function useCalendars(): CalendarsValue {
  const value = useContext(CalendarsContext)
  if (!value) throw new Error('Calendars missing')
  return value
}

export const PENDING_INVITE_KEY = 'blanky:pending-invite'
