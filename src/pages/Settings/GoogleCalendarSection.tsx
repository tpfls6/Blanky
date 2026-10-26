import { useEffect, useState } from 'react'
import type {
  ConnectionView,
  DisconnectDisposition,
  FirstImport,
  GoogleCalendarChoice,
  GoogleCalendarId,
} from '@blanky/types'
import { getCalendarSyncClient } from '../../services/calendarSync/index.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { Choice, SwitchRow } from './bits.tsx'

function errorLine(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : ''
  if (code === 'GOOGLE_ENV_MISSING') return 'Google Calendar 비밀값이 Edge Function에 없습니다.'
  if (code === 'UNAUTHENTICATED') return '로그인이 필요합니다.'
  if (code === 'GOOGLE_DENIED') return 'Google Calendar 권한이 거부되었습니다.'
  if (code === 'NOT_CONNECTED') return 'Google Calendar에 먼저 연결해 주세요.'
  if (code === 'NEEDS_CALENDAR') return '캘린더를 선택해 주세요.'
  if (code === 'GOOGLE_HTTP') return 'Google Calendar에 연결하지 못했습니다.'
  if (code === 'INVALID_COMMAND') return '요청을 확인하지 못했습니다.'
  return error instanceof Error ? error.message : 'Google Calendar 요청을 처리하지 못했습니다.'
}

function statusLine(view: ConnectionView, extra: string) {
  if (view.status === 'disconnected') return '연결되지 않음'
  if (view.status === 'awaiting_consent') return 'Google 권한 확인 후 이 화면으로 돌아옵니다.'
  if (view.status === 'connected') return `${view.accountEmail} · 캘린더를 고르세요`
  if (view.status === 'needs_reauth') return `${view.accountEmail} · 다시 연결해야 합니다`
  if (view.status === 'error') return view.message
  const last = view.lastSync.error ? view.lastSync.error : `${view.calendarSummary} · 마지막 동기화 ${view.lastSync.at}`
  return extra || last
}

function CalendarPick({
  calendars,
  onPick,
}: {
  calendars: readonly GoogleCalendarChoice[]
  onPick: (id: GoogleCalendarId, firstImport: FirstImport) => Promise<void>
}) {
  const [choice, setChoice] = useState<GoogleCalendarId | ''>(calendars[0]?.id ?? '')
  const [direction, setDirection] = useState<FirstImport['direction']>('from_google')
  return (
    <div className="mt-3 space-y-3">
      <label className="block text-sm">
        캘린더
        <select
          className="field select mt-1 block"
          value={choice}
          onChange={(event) => setChoice(event.target.value as GoogleCalendarId)}
        >
          {calendars.map((calendar) => (
            <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
          ))}
        </select>
      </label>
      <div>
        <p className="text-sm">첫 가져오기</p>
        <div className="mt-2 flex flex-wrap gap-1" role="radiogroup">
          <Choice value="from_google" current={direction} label="Google → Blanky" onPick={setDirection} />
          <Choice value="from_blanky" current={direction} label="Blanky → Google" onPick={setDirection} />
        </div>
      </div>
      <button
        type="button"
        className="btn btn-line"
        disabled={!choice}
        onClick={() => {
          if (!choice) return
          void onPick(choice, { direction })
        }}
      >
        이 캘린더 사용
      </button>
    </div>
  )
}

export function GoogleCalendarSection() {
  const confirm = useConfirm()
  const [view, setView] = useState<ConnectionView>()
  const [calendars, setCalendars] = useState<readonly GoogleCalendarChoice[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setView({ status: 'error', code: 'GOOGLE_ENV_MISSING', message: '서버에 연결되면 Google Calendar를 연결할 수 있습니다.' })
      return
    }
    const sync = getCalendarSyncClient()
    void sync.status().then(async (next) => {
      setView(next)
      if (next.status === 'connected') setCalendars(await sync.listCalendars())
    }).catch((error) => {
      setView({ status: 'error', code: 'GOOGLE_HTTP', message: errorLine(error) })
    })
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || view?.status !== 'ready' || !view.autoSync) return
    const staleMs = Date.now() - Date.parse(view.lastSync.at)
    if (Number.isFinite(staleMs) && staleMs < 5 * 60 * 1000) return
    const sync = getCalendarSyncClient()
    void sync.sync().then((report) => {
      setMessage(`동기화 ${report.imported} 가져옴, ${report.exported} 보냄`)
      return sync.status()
    }).then(setView).catch((error) => setMessage(errorLine(error)))
  }, [view?.status, view?.status === 'ready' ? view.autoSync : false, view?.status === 'ready' ? view.lastSync.at : ''])

  if (!view) return <p className="text-sm text-neutral-500" role="status">Google Calendar 상태를 읽는 중…</p>

  return (
    <div>
      <p className="text-sm">Google Calendar</p>
      <p className="mt-1 text-sm text-neutral-500" role="status">{statusLine(view, message)}</p>

      {view.status === 'disconnected' || view.status === 'needs_reauth' ? (
        <button
          type="button"
          className="btn btn-line mt-3"
          onClick={async () => {
            try {
              const { authUrl } = await getCalendarSyncClient().startConnect()
              window.location.assign(authUrl)
            } catch (error) {
              setMessage(errorLine(error))
            }
          }}
        >
          Google Calendar 연결
        </button>
      ) : null}

      {view.status === 'connected' ? (
        <CalendarPick
          calendars={calendars}
          onPick={async (googleCalendarId, firstImport) => {
            try {
              setView(await getCalendarSyncClient().selectCalendar({ googleCalendarId, firstImport }))
            } catch (error) {
              setMessage(errorLine(error))
            }
          }}
        />
      ) : null}

      {view.status === 'ready' ? (
        <>
          <div className="mt-3">
            <SwitchRow
              label="자동 동기화"
              hint="이 화면을 열면 5분이 지난 연결을 다시 맞춥니다. 일정 저장은 Google에 바로 쓰지 않습니다."
              checked={view.autoSync}
              onChange={() => void getCalendarSyncClient().setAutoSync(!view.autoSync).then(setView).catch((error) => setMessage(errorLine(error)))}
            />
          </div>
          <button type="button" className="btn btn-line mt-3" onClick={async () => {
            try {
              const report = await getCalendarSyncClient().sync()
              setMessage(`동기화 ${report.imported} 가져옴, ${report.exported} 보냄`)
              setView(await getCalendarSyncClient().status())
            } catch (error) {
              setMessage(errorLine(error))
            }
          }}>
            지금 동기화
          </button>
          <button
            type="button"
            className="btn btn-ghost mt-3"
            onClick={async () => {
              const leave = await confirm('Google Calendar 연결을 해제할까요?', {
                title: '연결 해제',
                confirmLabel: '해제',
              })
              if (!leave) return
              const dropImported = await confirm('Google에서 가져온 일정을 Blanky에서도 삭제할까요?', {
                title: '가져온 일정',
                confirmLabel: '삭제',
              })
              const disposition: DisconnectDisposition = {
                importedRows: dropImported ? 'delete' : 'keep',
              }
              try {
                setView(await getCalendarSyncClient().disconnect(disposition))
              } catch (error) {
                setMessage(errorLine(error))
              }
            }}
          >
            연결 해제
          </button>
        </>
      ) : null}
    </div>
  )
}
