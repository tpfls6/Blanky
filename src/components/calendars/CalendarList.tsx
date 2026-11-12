import { Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'
import type { CalendarEntry } from '@blanky/types'
import { useCalendars } from '../../state/useCalendars.ts'
import { ROLE_LABEL } from './labels.ts'
import { SharedCalendarDialog } from './SharedCalendarDialog.tsx'

function Row({ entry, onManage }: { entry: CalendarEntry; onManage?: () => void }) {
  const { setHidden } = useCalendars()
  const [error, setError] = useState('')
  const name = entry.type === 'external' ? `Google · ${entry.name}` : entry.name
  return (
    <li data-calendar-row={entry.id} className="calendar-row">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2" title={error || name}>
        <input type="checkbox" className="calendar-check" checked={!entry.hidden} style={{ accentColor: entry.color }}
          aria-label={`${name} ${entry.hidden ? '보이기' : '숨기기'}`}
          onChange={event => { setError(''); void setHidden(entry.id, !event.target.checked).catch(() => setError('표시 설정을 저장하지 못했어요.')) }} />
        <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} aria-hidden="true" />
        <span className={entry.hidden ? 'min-w-0 truncate text-neutral-400' : 'min-w-0 truncate'}>{name}</span>
      </label>
      {entry.type === 'shared' ? <span className="calendar-role">{ROLE_LABEL[entry.role]}</span> : null}
      {onManage ? (
        <button type="button" className="calendar-row-action" aria-label={`${entry.name} 관리`} onClick={onManage}>
          <Settings2 aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </button>
      ) : null}
    </li>
  )
}

/** "My calendars / Shared calendars" with show-hide toggles and the share manager. */
export function CalendarList({ compact = false, nested = false }: { compact?: boolean; nested?: boolean }) {
  const { entries, ready, error, invitations, respond } = useCalendars()
  const [dialog, setDialog] = useState<{ id?: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [inviteError, setInviteError] = useState('')
  const mine = entries.filter(entry => entry.type !== 'shared')
  const shared = entries.filter(entry => entry.type === 'shared')
  if (!ready && !entries.length) return null
  const answer = (id: string, accept: boolean) => {
    setBusy(id)
    setInviteError('')
    void respond(id, accept).catch(cause => setInviteError(cause instanceof Error ? cause.message : '초대에 응답하지 못했어요.')).finally(() => setBusy(''))
  }
  return (
    <section data-calendar-list className={nested ? 'calendar-list calendar-list-nested' : compact ? 'calendar-list' : 'calendar-list mt-6'} aria-label="캘린더">
      {mine.length ? <>
        <p className="calendar-list-heading">내 캘린더</p>
        <ul>{mine.map(entry => <Row key={entry.id} entry={entry} />)}</ul>
      </> : null}
      <div className="calendar-list-heading mt-3 flex items-center justify-between">
        <span>공유 캘린더</span>
        <button type="button" className="calendar-row-action" aria-label="공유 캘린더 만들기" data-create-shared onClick={() => setDialog({})}>
          <Plus aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <ul>
        {shared.map(entry => <Row key={entry.id} entry={entry} onManage={() => setDialog({ id: entry.id })} />)}
        {!shared.length ? <li className="px-2 py-1 text-xs text-neutral-400">함께 쓰는 캘린더를 만들어 보세요.</li> : null}
      </ul>
      {invitations.length ? <div className="mt-3" data-received-invitations>
        <p className="calendar-list-heading">받은 초대</p>
        <ul className="space-y-1.5">
          {invitations.map(invite => (
            <li key={invite.id} className="calendar-invite" data-invitation={invite.id}>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: invite.calendarColor }} aria-hidden="true" />
                <span className="min-w-0 truncate text-sm">{invite.calendarName}</span>
              </span>
              <span className="block text-[11px] text-neutral-400">{invite.inviterName} · {ROLE_LABEL[invite.role]}</span>
              <span className="mt-1 flex gap-1">
                <button type="button" className="btn btn-primary px-2 py-0.5 text-xs" disabled={busy === invite.id} onClick={() => answer(invite.id, true)}>수락</button>
                <button type="button" className="btn btn-ghost px-2 py-0.5 text-xs" disabled={busy === invite.id} onClick={() => answer(invite.id, false)}>거절</button>
              </span>
            </li>
          ))}
        </ul>
      </div> : null}
      {error || inviteError ? <p role="alert" className="mt-2 px-2 text-xs text-red-600">{inviteError || error}</p> : null}
      {dialog ? <SharedCalendarDialog calendarId={dialog.id} onClose={() => setDialog(null)} onCreated={id => setDialog({ id })} /> : null}
    </section>
  )
}
