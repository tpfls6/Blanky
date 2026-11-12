import { Bell } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppNotification } from '@blanky/types'
import { ROUTES } from '../../constants/routes.ts'
import { useCalendars } from '../../state/useCalendars.ts'
import { notificationText, relativeTime, ROLE_LABEL } from './labels.ts'

/** Invitations and shared-calendar changes. Opening the panel does not mark items read; clicking one does. */
export function NotificationBell({ align = 'left' }: { align?: 'left' | 'right' }) {
  const { notifications, unread, markRead, markAllRead, invitations, respond, connection } = useCalendars()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const count = unread + invitations.filter(invite => !notifications.some(row => row.invitationId === invite.id && !row.readAt)).length

  // The sidebar clips overflow, so the panel is fixed to the viewport next to the button instead of absolute inside it.
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const rect = root.current?.getBoundingClientRect()
      if (!rect) return
      const gutter = 16
      const width = Math.min(352, window.innerWidth - gutter * 2)
      const wanted = align === 'right' ? rect.right - width : rect.left
      setPlace({ top: rect.bottom + 4, left: Math.max(gutter, Math.min(wanted, window.innerWidth - width - gutter)), width })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const pick = (item: AppNotification) => {
    void markRead([item.id]).catch(() => undefined)
    if (item.type.startsWith('schedule_') && item.type !== 'schedule_deleted') {
      setOpen(false)
      navigate(ROUTES.schedule)
    }
  }
  const answer = (id: string, accept: boolean) => {
    setBusy(id)
    setError('')
    void respond(id, accept).catch(cause => setError(cause instanceof Error ? cause.message : '초대에 응답하지 못했어요.')).finally(() => setBusy(''))
  }

  return <div ref={root} className="relative" data-notification-bell>
    <button type="button" className="icon-btn relative" aria-label={count ? `알림 ${count}개` : '알림'} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Bell aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {count ? <span className="notification-count" data-unread={count}>{count > 99 ? '99+' : count}</span> : null}
    </button>
    {open && place ? <div role="dialog" aria-label="알림" className="notification-panel" style={{ top: place.top, left: place.left, width: place.width }}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-sm font-medium">알림</span>
        <span className="flex items-center gap-2">
          {connection === 'offline' ? <span className="text-[11px] text-amber-600">오프라인 · 다시 연결되면 동기화해요</span> : null}
          {unread ? <button type="button" className="text-xs text-accent-text" onClick={() => void markAllRead().catch(() => undefined)}>모두 읽음</button> : null}
        </span>
      </div>
      <ul className="max-h-[min(24rem,calc(100dvh-9rem))] overflow-y-auto">
        {invitations.map(invite => (
          <li key={invite.id} className="notification-item notification-unread" data-invitation={invite.id}>
            <span className="size-2 shrink-0 translate-y-1.5 rounded-full" style={{ backgroundColor: invite.calendarColor }} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{invite.inviterName}님이 '{invite.calendarName}' 캘린더에 {ROLE_LABEL[invite.role]}(으)로 초대했어요</span>
              <span className="mt-1 flex gap-1">
                <button type="button" className="btn btn-primary px-2 py-0.5 text-xs" disabled={busy === invite.id} onClick={() => answer(invite.id, true)}>수락</button>
                <button type="button" className="btn btn-ghost px-2 py-0.5 text-xs" disabled={busy === invite.id} onClick={() => answer(invite.id, false)}>거절</button>
              </span>
            </span>
          </li>
        ))}
        {notifications.filter(item => item.type !== 'invite_received' || !invitations.some(invite => invite.id === item.invitationId)).map(item => (
          <li key={item.id}>
            <button type="button" className={`notification-item w-full text-left ${item.readAt ? '' : 'notification-unread'}`} onClick={() => pick(item)} data-notification={item.type}>
              <span className="size-2 shrink-0 translate-y-1.5 rounded-full" style={{ backgroundColor: item.readAt ? 'transparent' : item.calendarColor ?? 'var(--accent-color)' }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{notificationText(item)}</span>
                <span className="block text-[11px] text-neutral-400">{relativeTime(item.createdAt)}</span>
              </span>
            </button>
          </li>
        ))}
        {!notifications.length && !invitations.length ? <li className="px-3 py-6 text-center text-sm text-neutral-400">새 알림이 없어요.</li> : null}
      </ul>
      {error ? <p role="alert" className="px-3 py-2 text-xs text-red-600">{error}</p> : null}
    </div> : null}
  </div>
}
