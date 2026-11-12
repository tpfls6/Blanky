import { Copy, Link2, Mail, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createCalendarRepository } from '@blanky/api'
import type { CalendarInvitation, CalendarMember, CalendarRole, InviteLink, InviteRole } from '@blanky/types'
import { SWATCHES } from '../../constants/swatches.ts'
import { getSupabaseClient } from '../../services/supabase/client.ts'
import { useCalendars } from '../../state/useCalendars.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useSession } from '../../state/useSession.ts'
import { inviteUrl, ROLE_HINT, ROLE_LABEL } from './labels.ts'

type Tab = 'info' | 'members' | 'invite'

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

const DAYS = [1, 3, 7, 14, 30]

/** Creates a shared calendar, or manages one: details, members and roles, invitations. */
export function SharedCalendarDialog({ calendarId, onClose, onCreated }: {
  calendarId?: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const calendars = useCalendars()
  const confirm = useConfirm()
  const { user } = useSession()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const entry = calendars.entryOf(calendarId)
  const owner = entry?.role === 'owner'
  const [tab, setTab] = useState<Tab>('info')
  const [name, setName] = useState(entry?.name ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [color, setColor] = useState(entry?.color ?? SWATCHES[1].hex)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [members, setMembers] = useState<CalendarMember[]>([])
  const [invites, setInvites] = useState<CalendarInvitation[]>([])
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('editor')
  const [days, setDays] = useState(7)
  const [link, setLink] = useState<InviteLink | null>(null)
  const [mailto, setMailto] = useState('')
  const repo = useRef(createCalendarRepository(getSupabaseClient())).current

  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  // The calendar vanished (deleted or membership revoked elsewhere): close instead of editing a ghost.
  const gone = Boolean(calendarId) && calendars.ready && !entry
  useEffect(() => { if (gone) onClose() }, [gone, onClose])

  const { loadMembers } = calendars
  const fetchAll = useCallback(() => calendarId
    ? Promise.all([loadMembers(calendarId, true), owner ? repo.listInvitations(calendarId) : Promise.resolve([])])
    : Promise.resolve(null), [calendarId, owner, repo, loadMembers])
  const reload = useCallback(async () => {
    const result = await fetchAll().catch((cause: unknown) => { setError(errorText(cause, '멤버를 불러오지 못했어요.')); return null })
    if (result) { setMembers(result[0]); setInvites(result[1]) }
  }, [fetchAll])
  useEffect(() => {
    let cancelled = false
    fetchAll().then(result => {
      if (!cancelled && result) { setMembers(result[0]); setInvites(result[1]) }
    }, (cause: unknown) => { if (!cancelled) setError(errorText(cause, '멤버를 불러오지 못했어요.')) })
    return () => { cancelled = true }
  }, [fetchAll])

  const run = async (work: () => Promise<unknown>, done?: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
      if (done) setNotice(done)
    } catch (cause) {
      setError(errorText(cause, '요청을 처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  const saveInfo = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('캘린더 이름을 입력해 주세요.')
    void run(async () => {
      if (!calendarId) {
        const created = await repo.createSharedCalendar({ name, description, color })
        await calendars.refresh()
        onCreated(created.id)
        setTab('invite')
        return
      }
      await repo.updateSharedCalendar(calendarId, { name, description, color })
      await calendars.refresh()
    }, calendarId ? '저장했어요.' : '공유 캘린더를 만들었어요. 멤버를 초대해 보세요.')
  }

  const remove = async () => {
    if (!calendarId || !entry) return
    if (!await confirm(`'${entry.name}' 캘린더와 모든 공유 일정을 삭제할까요? 모든 멤버에게서 사라지며 되돌릴 수 없어요.`)) return
    void run(async () => {
      await repo.deleteSharedCalendar(calendarId)
      await calendars.refresh()
      onClose()
    })
  }

  const leave = async () => {
    if (!calendarId || !entry || !user) return
    if (!await confirm(`'${entry.name}' 캘린더에서 나갈까요? 공유 일정이 더 이상 보이지 않아요.`)) return
    void run(async () => {
      await repo.removeMember(calendarId, user.id)
      await calendars.refresh()
      onClose()
    })
  }

  const changeRole = (member: CalendarMember, next: CalendarRole) => void run(async () => {
    await repo.setMemberRole(calendarId!, member.userId, next)
    await reload()
    if (member.isMe) await calendars.refresh()
  }, `${member.displayName}님의 권한을 ${ROLE_LABEL[next]}(으)로 바꿨어요.`)

  const kick = async (member: CalendarMember) => {
    if (!await confirm(`${member.displayName}님을 캘린더에서 내보낼까요? 즉시 공유 일정에 접근할 수 없게 돼요.`)) return
    void run(async () => { await repo.removeMember(calendarId!, member.userId); await reload() }, '멤버를 내보냈어요.')
  }

  const transfer = async (member: CalendarMember) => {
    if (!await confirm(`${member.displayName}님에게 소유권을 넘길까요? 나는 편집자가 돼요.`)) return
    void run(async () => { await repo.transferOwnership(calendarId!, member.userId); await reload(); await calendars.refresh() }, '소유권을 넘겼어요.')
  }

  const invite = (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!address) return setError('초대할 이메일을 입력해 주세요.')
    void run(async () => {
      await repo.inviteByEmail(calendarId!, address, inviteRole, days)
      setEmail('')
      // Blanky has no mail server: the inviter's mail app sends the notice; sign-in links the invitation.
      const body = `Blanky의 '${entry?.name ?? ''}' 공유 캘린더에 초대했어요.\n${window.location.origin}/schedule 에서 ${address} 계정으로 로그인하면 초대를 확인할 수 있어요.`
      setMailto(`mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent('Blanky 공유 캘린더 초대')}&body=${encodeURIComponent(body)}`)
      await reload()
    }, `${address}에 초대를 보냈어요. 가입된 계정이면 바로 알림이 가고, 아니면 해당 이메일로 로그인할 때 연결돼요.`)
  }

  const issueLink = () => void run(async () => {
    setLink(await repo.createInviteLink(calendarId!, inviteRole, days))
    await reload()
  }, '새 초대 링크를 만들었어요. 이전 링크는 더 이상 쓸 수 없어요.')

  const revoke = (id: string) => void run(async () => {
    await repo.revokeInvitation(id)
    if (link?.id === id) setLink(null)
    await reload()
  }, '초대를 취소했어요.')

  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => setNotice('링크를 복사했어요.'), () => setNotice('복사하지 못했어요. 링크를 직접 선택해 주세요.'))

  const activeLink = invites.find(item => item.kind === 'link')
  const emailInvites = invites.filter(item => item.kind === 'email')
  const tabs: [Tab, string][] = calendarId ? [['info', '정보'], ['members', `멤버 ${members.length || ''}`.trim()], ...(owner ? [['invite', '초대'] as [Tab, string]] : [])] : []

  return <dialog data-theme-slot="modal" ref={ref} aria-labelledby={titleId} data-shared-calendar-dialog={calendarId ?? 'new'}
    className="m-auto max-h-[90dvh] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-surface p-4 text-neutral-900 backdrop:bg-black/40"
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="flex items-center justify-between gap-2">
      <h2 id={titleId} className="flex min-w-0 items-center gap-2 text-base font-medium">
        {entry ? <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} aria-hidden="true" /> : null}
        <span className="truncate">{entry ? entry.name : '공유 캘린더 만들기'}</span>
        {entry ? <span className="calendar-role">{ROLE_LABEL[entry.role]}</span> : null}
      </h2>
      <button data-theme-slot="button" type="button" className="icon-btn" aria-label="닫기" disabled={busy} onClick={onClose}><X aria-hidden="true" className="size-4" /></button>
    </div>
    {tabs.length ? <div className="mt-3 flex gap-1" role="tablist">
      {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'chip chip-on' : 'chip'} onClick={() => { setTab(id); setError(''); setNotice('') }}>{label}</button>)}
    </div> : null}

    {tab === 'info' ? <form onSubmit={saveInfo} className="mt-4 grid gap-3">
      <fieldset disabled={busy || Boolean(calendarId && !owner)} className="grid gap-3">
        <label className="text-xs text-neutral-500">이름
          <input data-theme-slot="input" className="field mt-1 w-full" value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="예: 우리 가족, 프로젝트 팀" autoFocus={!calendarId} />
        </label>
        <label className="text-xs text-neutral-500">설명
          <textarea data-theme-slot="input" className="field mt-1 min-h-16 w-full resize-y" value={description} maxLength={500} onChange={event => setDescription(event.target.value)} />
        </label>
        <div className="text-xs text-neutral-500">색상
          <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="캘린더 색상">
            {SWATCHES.map(swatch => <button key={swatch.hex} type="button" role="radio" aria-checked={color === swatch.hex} aria-label={swatch.name}
              className="calendar-swatch" style={{ backgroundColor: swatch.hex, outlineColor: color === swatch.hex ? swatch.hex : 'transparent' }} onClick={() => setColor(swatch.hex)} />)}
          </div>
        </div>
      </fieldset>
      {entry ? <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={entry.notify} disabled={busy} onChange={event => void calendars.setNotify(entry.id, event.target.checked).catch(() => setError('알림 설정을 저장하지 못했어요.'))} />
        이 캘린더의 일정 변경 알림 받기
      </label> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {owner ? <button type="button" className="btn btn-ghost text-red-600" disabled={busy} onClick={() => void remove()}>캘린더 삭제</button> : null}
          {entry ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void leave()}>캘린더 나가기</button> : null}
        </div>
        {!calendarId || owner ? <button data-theme-slot="button-primary" type="submit" className="btn btn-primary" disabled={busy}>{calendarId ? '저장' : '만들기'}</button> : null}
      </div>
    </form> : null}

    {tab === 'members' ? <div className="mt-4">
      <ul className="divide-y divide-line" data-member-list>
        {members.map(member => (
          <li key={member.userId} className="flex flex-wrap items-center gap-2 py-2" data-member={member.email}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{member.displayName}{member.isMe ? ' (나)' : ''}</span>
              <span className="block truncate text-xs text-neutral-400">{member.email}</span>
            </span>
            {owner && !member.isMe ? <>
              <select className="field py-1 text-xs" aria-label={`${member.displayName} 권한`} value={member.role} disabled={busy}
                onChange={event => changeRole(member, event.target.value as CalendarRole)}>
                {(['owner', 'editor', 'viewer'] as const).map(role => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
              </select>
              {member.role !== 'owner' ? <button type="button" className="btn btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => void transfer(member)}>소유권 이전</button> : null}
              <button type="button" className="btn btn-ghost px-2 py-1 text-xs text-red-600" disabled={busy} onClick={() => void kick(member)}>내보내기</button>
            </> : <span className="calendar-role" title={ROLE_HINT[member.role]}>{ROLE_LABEL[member.role]}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-400">{ROLE_LABEL.owner}: {ROLE_HINT.owner} · {ROLE_LABEL.editor}: {ROLE_HINT.editor} · {ROLE_LABEL.viewer}: {ROLE_HINT.viewer}</p>
    </div> : null}

    {tab === 'invite' && owner ? <div className="mt-4 grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500">권한
          <select className="field mt-1 w-full" value={inviteRole} onChange={event => setInviteRole(event.target.value as InviteRole)} data-invite-role>
            <option value="editor">편집자 — 일정 추가·수정·삭제</option>
            <option value="viewer">조회자 — 보기만</option>
          </select>
        </label>
        <label className="text-xs text-neutral-500">유효 기간
          <select className="field mt-1 w-full" value={days} onChange={event => setDays(Number(event.target.value))}>
            {DAYS.map(day => <option key={day} value={day}>{day}일</option>)}
          </select>
        </label>
      </div>
      <form onSubmit={invite} className="grid gap-2">
        <label className="text-xs text-neutral-500">이메일로 초대
          <span className="mt-1 flex gap-2">
            <input data-theme-slot="input" type="email" className="field min-w-0 flex-1" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" data-invite-email />
            <button type="submit" className="btn btn-primary shrink-0" disabled={busy}><Mail aria-hidden="true" className="size-3.5" /> 초대</button>
          </span>
        </label>
        {mailto ? <a className="text-xs text-accent-text underline" href={mailto}>메일 앱으로 초대 안내 보내기</a> : null}
      </form>
      <div className="rounded-md border border-line p-3">
        <p className="flex items-center gap-1.5 text-sm"><Link2 aria-hidden="true" className="size-4" /> 초대 링크</p>
        {link ? <div className="mt-2 flex gap-2">
          <input readOnly className="field min-w-0 flex-1 text-xs" value={inviteUrl(link.token)} data-invite-link onFocus={event => event.currentTarget.select()} />
          <button type="button" className="btn btn-ghost shrink-0" aria-label="링크 복사" onClick={() => copy(inviteUrl(link.token))}><Copy aria-hidden="true" className="size-3.5" /></button>
        </div> : null}
        <p className="mt-2 text-xs text-neutral-400">
          {activeLink ? `${ROLE_LABEL[activeLink.role]} 링크 · ${new Date(activeLink.expiresAt).toLocaleString('ko-KR')}까지 유효${link ? '' : ' · 보안을 위해 링크는 만든 직후에만 볼 수 있어요.'}` : '활성 링크가 없어요.'}
        </p>
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={issueLink} data-issue-link>{activeLink ? '링크 재발급' : '링크 만들기'}</button>
          {activeLink ? <button type="button" className="btn btn-ghost text-red-600" disabled={busy} onClick={() => revoke(activeLink.id)}>링크 취소</button> : null}
        </div>
      </div>
      <div>
        <p className="text-xs text-neutral-500">대기 중인 초대</p>
        <ul className="mt-1 divide-y divide-line">
          {emailInvites.map(item => (
            <li key={item.id} className="flex items-center gap-2 py-1.5 text-sm" data-pending-invite={item.email ?? ''}>
              <span className="min-w-0 flex-1 truncate">{item.email}</span>
              <span className="calendar-role">{ROLE_LABEL[item.role]}</span>
              <span className="text-xs text-neutral-400">{new Date(item.expiresAt) < new Date() ? '만료' : `~${new Date(item.expiresAt).toLocaleDateString('ko-KR')}`}</span>
              <button type="button" className="btn btn-ghost px-2 py-0.5 text-xs" disabled={busy} onClick={() => revoke(item.id)}>취소</button>
            </li>
          ))}
          {!emailInvites.length ? <li className="py-1.5 text-xs text-neutral-400">없음</li> : null}
        </ul>
      </div>
    </div> : null}

    {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
    {notice && !error ? <p role="status" className="mt-3 text-sm text-neutral-500">{notice}</p> : null}
  </dialog>
}
