import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createCalendarRepository } from '@blanky/api'
import type { InviteLinkPreview } from '@blanky/types'
import { ROLE_HINT, ROLE_LABEL } from '../../components/calendars/labels.ts'
import { ROUTES } from '../../constants/routes.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../../services/supabase/client.ts'
import { useCalendars } from '../../state/useCalendars.ts'

const STATE_TEXT: Record<Exclude<InviteLinkPreview['state'], 'pending'>, string> = {
  member: '이미 참여 중인 캘린더예요.',
  revoked: '취소되었거나 재발급되어 더 이상 쓸 수 없는 링크예요. 캘린더 소유자에게 새 링크를 요청해 주세요.',
  expired: '만료된 초대 링크예요. 캘린더 소유자에게 새 링크를 요청해 주세요.',
  invalid: '유효하지 않은 초대 링크예요.',
}

/** Landing page of a calendar invite link; signed-out visitors return here after login. */
export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const calendars = useCalendars()
  const [preview, setPreview] = useState<InviteLinkPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    createCalendarRepository(getSupabaseClient()).previewInviteLink(token)
      .then(result => { if (!cancelled) setPreview(result) })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : '초대를 확인하지 못했어요.') })
    return () => { cancelled = true }
  }, [token])

  const join = () => {
    setBusy(true)
    setError('')
    createCalendarRepository(getSupabaseClient()).acceptInviteLink(token)
      .then(async () => {
        await calendars.refresh()
        navigate(ROUTES.schedule, { replace: true })
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : '참여하지 못했어요.'))
      .finally(() => setBusy(false))
  }

  return <div className="mx-auto w-full max-w-md px-4 py-10" data-invite-page>
    <div className="panel">
      <h1 className="text-base font-medium">공유 캘린더 초대</h1>
      {!isSupabaseConfigured ? <p className="mt-3 text-sm text-neutral-500">서버 연결이 필요한 기능이에요.</p> : null}
      {!preview && !error && isSupabaseConfigured ? <p role="status" className="mt-3 text-sm text-neutral-500">초대를 확인하고 있어요…</p> : null}
      {preview?.calendarName ? <div className="mt-4 flex items-center gap-2">
        <span className="size-3 rounded-sm" style={{ backgroundColor: preview.calendarColor ?? undefined }} aria-hidden="true" />
        <span className="text-sm font-medium" data-invite-calendar>{preview.calendarName}</span>
      </div> : null}
      {preview?.state === 'pending' && preview.role ? <>
        <p className="mt-2 text-sm text-neutral-600">{preview.inviterName}님이 {ROLE_LABEL[preview.role]}(으)로 초대했어요. {ROLE_HINT[preview.role]}.</p>
        {preview.expiresAt ? <p className="mt-1 text-xs text-neutral-400">{new Date(preview.expiresAt).toLocaleString('ko-KR')}까지 유효</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={join} data-accept-invite>{busy ? '참여 중…' : '참여하기'}</button>
          <Link to={ROUTES.schedule} className="btn btn-ghost">나중에</Link>
        </div>
      </> : null}
      {preview && preview.state !== 'pending' ? <>
        <p className="mt-3 text-sm text-neutral-600" data-invite-state={preview.state}>{STATE_TEXT[preview.state]}</p>
        <Link to={ROUTES.schedule} className="btn btn-ghost mt-3">일정으로 이동</Link>
      </> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  </div>
}
