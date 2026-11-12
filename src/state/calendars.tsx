import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createCalendarRepository, createNotificationRepository } from '@blanky/api'
import type { AppNotification, CalendarEntry, CalendarMember, ReceivedInvitation } from '@blanky/types'
import { ROUTES } from '../constants/routes.ts'
import { setReadOnlyCalendars } from '../services/calendar/access.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../services/supabase/client.ts'
import type { WorkItem } from '../types/work.ts'
import { CalendarsContext, PENDING_INVITE_KEY, type CalendarsValue } from './useCalendars.ts'
import { useLibrary } from './useLibrary.ts'
import { useSession } from './useSession.ts'

const ORDER = { personal: 0, external: 1, shared: 2 } as const
const REFRESH_DELAY = 400
const AUTH_PATHS: string[] = [ROUTES.login, ROUTES.signup, ROUTES.forgot, ROUTES.welcome]

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Calendars the user can read, their membership, notifications and invitations.
 * One Realtime channel keeps them and the library's schedules current; RLS decides which
 * rows each subscriber receives. A reconnect or returning tab reloads everything, so
 * changes missed while offline are recovered rather than replayed.
 */
export function CalendarsProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const library = useLibrary()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const userId = user?.id ?? null
  const remote = isSupabaseConfigured && Boolean(userId)
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [ready, setReady] = useState(!isSupabaseConfigured)
  const [error, setError] = useState('')
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [invitations, setInvitations] = useState<ReceivedInvitation[]>([])
  const [memberCache, setMemberCache] = useState<Record<string, CalendarMember[]>>({})
  const [connection, setConnection] = useState<CalendarsValue['connection']>('connecting')
  const refreshWork = useRef(library.refreshWork)
  useEffect(() => { refreshWork.current = library.refreshWork }, [library.refreshWork])
  const activeUser = useRef(userId)
  useEffect(() => { activeUser.current = userId }, [userId])

  const repos = useMemo(() => remote ? {
    calendars: createCalendarRepository(getSupabaseClient()),
    notifications: createNotificationRepository(getSupabaseClient()),
  } : null, [remote])

  const loadEntries = useCallback(async () => {
    if (!repos || !userId) return
    try {
      const rows = await repos.calendars.listCalendarEntries(userId)
      if (activeUser.current !== userId) return
      rows.sort((a, b) => ORDER[a.type] - ORDER[b.type] || Number(b.isDefaultPersonal) - Number(a.isDefaultPersonal) || a.createdAt.localeCompare(b.createdAt))
      setEntries(rows)
      setReadOnlyCalendars(rows.filter(row => row.role === 'viewer').map(row => row.id))
      setError('')
    } catch (cause) {
      if (activeUser.current === userId) setError(message(cause, '캘린더를 불러오지 못했어요.'))
    } finally {
      if (activeUser.current === userId) setReady(true)
    }
  }, [repos, userId])

  const loadNotifications = useCallback(async () => {
    if (!repos || !userId) return
    try {
      const [rows, received] = await Promise.all([repos.notifications.list(), repos.calendars.listReceivedInvitations()])
      if (activeUser.current !== userId) return
      setNotifications(rows)
      setInvitations(received)
    } catch {
      // Notifications are secondary; the next event or reconnect retries.
    }
  }, [repos, userId])

  const resync = useCallback(async () => {
    await Promise.all([loadEntries(), loadNotifications(), refreshWork.current().catch(() => undefined)])
  }, [loadEntries, loadNotifications])

  // A different account starts from nothing; stale rows must never show under the new user.
  const [shownFor, setShownFor] = useState(userId)
  if (shownFor !== userId) {
    setShownFor(userId)
    setEntries([])
    setNotifications([])
    setInvitations([])
    setMemberCache({})
    setReady(!remote)
  }

  // Sign-in: link email invitations to this account, then load everything.
  useEffect(() => {
    setReadOnlyCalendars([])
    if (!repos) return
    let cancelled = false
    void repos.calendars.claimInvitations().catch(() => 0).finally(() => {
      if (!cancelled) void Promise.all([loadEntries(), loadNotifications()])
    })
    return () => { cancelled = true }
  }, [repos, remote, loadEntries, loadNotifications])

  // An invite link opened while signed out resumes here after login, once the auth pages have
  // finished their own redirect (otherwise their navigation to home would override this one).
  const onAuthPage = AUTH_PATHS.includes(pathname)
  useEffect(() => {
    if (!userId || onAuthPage) return
    let token: string | null = null
    try { token = localStorage.getItem(PENDING_INVITE_KEY) } catch { /* storage blocked */ }
    if (!token) return
    try { localStorage.removeItem(PENDING_INVITE_KEY) } catch { /* storage blocked */ }
    navigate(`/invite/${encodeURIComponent(token)}`, { replace: true })
  }, [userId, onAuthPage, navigate])

  // Realtime: schedule events refresh the library; membership events also reload calendars.
  useEffect(() => {
    if (!remote || !userId) return
    const client = getSupabaseClient()
    const timers: Record<string, ReturnType<typeof setTimeout> | undefined> = {}
    const later = (key: string, run: () => unknown) => {
      clearTimeout(timers[key])
      timers[key] = setTimeout(() => { void run() }, REFRESH_DELAY)
    }
    let dropped = false
    const channel = client.channel(`blanky-calendars:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => later('work', () => refreshWork.current().catch(() => undefined)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendars' }, () => {
        later('entries', loadEntries)
        later('work', () => refreshWork.current().catch(() => undefined))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_members' }, () => {
        // Losing a membership must drop that calendar's rows at once; member lists are fetched again on demand.
        setMemberCache({})
        later('entries', loadEntries)
        later('work', () => refreshWork.current().catch(() => undefined))
        later('notifications', loadNotifications)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_invitations' }, () => later('notifications', loadNotifications))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => later('notifications', loadNotifications))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('live')
          if (dropped) void resync()
          dropped = false
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          dropped = true
          setConnection('offline')
        }
      })
    const back = () => {
      if (document.visibilityState === 'visible') void resync()
    }
    const offline = () => setConnection('offline')
    window.addEventListener('online', resync)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', back)
    return () => {
      Object.values(timers).forEach(clearTimeout)
      window.removeEventListener('online', resync)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', back)
      void client.removeChannel(channel)
    }
  }, [remote, userId, loadEntries, loadNotifications, resync])

  const byId = useMemo(() => new Map(entries.map(entry => [entry.id, entry])), [entries])
  const entryOf = useCallback((id: string | undefined | null) => id ? byId.get(id) : undefined, [byId])
  const canEdit = useCallback((item: Pick<WorkItem, 'calendarId'>) => entryOf(item.calendarId)?.role !== 'viewer', [entryOf])
  const writable = useMemo(() => entries.filter(entry => entry.role !== 'viewer' && entry.type !== 'external'), [entries])
  const visible = useCallback((items: WorkItem[]) => {
    if (!byId.size) return items
    return items.flatMap(item => {
      const entry = item.calendarId ? byId.get(item.calendarId) : undefined
      if (entry?.hidden) return []
      return entry?.type === 'shared' ? [{ ...item, calendarType: 'shared' as const, calendarColor: entry.color }] : [item]
    })
  }, [byId])

  const setDisplay = useCallback(async (calendarId: string, patch: { hidden?: boolean; notify?: boolean }) => {
    if (!repos || !userId) return
    const previous = entries
    setEntries(rows => rows.map(row => row.id === calendarId ? { ...row, ...patch } : row))
    try {
      await repos.calendars.setCalendarDisplay(calendarId, userId, patch)
    } catch (cause) {
      setEntries(previous)
      throw cause
    }
  }, [repos, userId, entries])

  const loadMembers = useCallback(async (calendarId: string, force = false) => {
    if (!repos) return []
    if (!force && memberCache[calendarId]) return memberCache[calendarId]
    const rows = await repos.calendars.listMembers(calendarId)
    setMemberCache(cache => ({ ...cache, [calendarId]: rows }))
    return rows
  }, [repos, memberCache])

  const markRead = useCallback(async (ids: string[]) => {
    if (!repos || !ids.length) return
    const at = new Date().toISOString()
    setNotifications(rows => rows.map(row => ids.includes(row.id) && !row.readAt ? { ...row, readAt: at } : row))
    await repos.notifications.markRead(ids)
  }, [repos])
  const markAllRead = useCallback(async () => {
    if (!repos) return
    const at = new Date().toISOString()
    setNotifications(rows => rows.map(row => row.readAt ? row : { ...row, readAt: at }))
    await repos.notifications.markAllRead()
  }, [repos])

  const respond = useCallback(async (invitationId: string, accept: boolean) => {
    if (!repos) return
    await repos.calendars.respondInvitation(invitationId, accept)
    setInvitations(rows => rows.filter(row => row.id !== invitationId))
    await resync()
  }, [repos, resync])

  const value = useMemo<CalendarsValue>(() => ({
    entries, ready, error, entryOf, writable, canEdit, visible,
    setHidden: (calendarId, hidden) => setDisplay(calendarId, { hidden }),
    setNotify: (calendarId, notify) => setDisplay(calendarId, { notify }),
    refresh: resync,
    members: calendarId => memberCache[calendarId],
    loadMembers,
    notifications,
    unread: notifications.filter(row => !row.readAt).length,
    markRead, markAllRead, invitations, respond,
    connection: remote ? connection : 'live',
  }), [entries, ready, error, entryOf, writable, canEdit, visible, setDisplay, resync, memberCache, loadMembers,
    notifications, markRead, markAllRead, invitations, respond, remote, connection])

  return <CalendarsContext.Provider value={value}>{children}</CalendarsContext.Provider>
}
