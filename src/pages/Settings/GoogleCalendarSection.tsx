import { useEffect, useRef, useState } from 'react'
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
import { calendarPanel, errorLine, lastSyncLine } from './calendarPanel.ts'
import { Choice, SwitchRow } from './bits.tsx'

function CalendarPick({
  calendars,
  busy,
  onPick,
}: {
  calendars: readonly GoogleCalendarChoice[]
  busy: boolean
  onPick: (id: GoogleCalendarId, firstImport: FirstImport) => Promise<void>
}) {
  const [choice, setChoice] = useState<GoogleCalendarId | ''>(calendars[0]?.id ?? '')
  const [direction, setDirection] = useState<FirstImport['direction']>('from_google')
  return (
    <fieldset className="mt-3 space-y-3" disabled={busy}>
      <label className="block text-sm">
        동기화할 Google 캘린더
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
        <p className="mt-1 text-xs text-neutral-400">한 번만 적용됩니다. 이후 동기화는 양방향입니다.</p>
        <div className="mt-2 flex flex-wrap gap-1" role="radiogroup">
          <Choice value="from_google" current={direction} label="Google → Blanky" onPick={setDirection} />
          <Choice value="from_blanky" current={direction} label="Blanky → Google" onPick={setDirection} />
        </div>
      </div>
      <button
        type="button"
        className="btn btn-line"
        disabled={busy || !choice}
        onClick={() => {
          if (!choice) return
          void onPick(choice, { direction })
        }}
      >
        이 캘린더 사용
      </button>
    </fieldset>
  )
}

export function GoogleCalendarSection() {
  const confirm = useConfirm()
  const [view, setView] = useState<ConnectionView>()
  const [calendars, setCalendars] = useState<readonly GoogleCalendarChoice[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

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
    if (!isSupabaseConfigured || view?.status !== 'ready' || !view.autoSync || inFlight.current) return
    const staleMs = Date.now() - Date.parse(view.lastSync.at)
    if (Number.isFinite(staleMs) && staleMs < 5 * 60 * 1000) return
    const sync = getCalendarSyncClient()
    inFlight.current = true
    setBusy(true)
    void sync.sync().then((report) => {
      setMessage(`동기화 ${report.imported} 가져옴, ${report.exported} 보냄`)
      return sync.status()
    }).then(setView).catch((error) => setMessage(errorLine(error))).finally(() => {
      inFlight.current = false
      setBusy(false)
    })
  }, [view?.status, view?.status === 'ready' ? view.autoSync : false, view?.status === 'ready' ? view.lastSync.at : ''])

  if (!view) return <p className="text-sm text-neutral-500" role="status">Google Calendar 상태를 읽는 중…</p>

  const panel = calendarPanel(view)

  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setMessage('')
    try {
      await work()
    } catch (error) {
      setMessage(errorLine(error))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div>
      {panel.intro ? <p className="text-sm text-neutral-500">{panel.intro}</p> : null}
      <p className="mt-1 text-sm" role="status">{panel.statusLabel}</p>
      {panel.accountEmail ? <p className="mt-1 text-sm text-neutral-500">계정 {panel.accountEmail}</p> : null}
      {panel.calendarSummary ? <p className="mt-1 text-sm text-neutral-500">캘린더 {panel.calendarSummary}</p> : null}
      {panel.lastSync ? <p className="mt-1 text-sm text-neutral-500">{lastSyncLine(panel.lastSync)}</p> : null}
      {panel.errorText ? <p className="mt-1 text-sm text-neutral-500">{panel.errorText}</p> : null}
      {panel.hint ? <p className="mt-1 text-sm text-neutral-500">{panel.hint}</p> : null}
      {message ? <p className="mt-1 text-sm text-neutral-500" role="status">{message}</p> : null}

      {panel.canConnect ? (
        <button
          type="button"
          className="btn btn-line mt-3"
          disabled={busy}
          onClick={() => void run(async () => {
            const { authUrl } = await getCalendarSyncClient().startConnect()
            window.location.assign(authUrl)
          })}
        >
          {panel.connectLabel}
        </button>
      ) : null}

      {view.status === 'connected' ? (
        <CalendarPick
          calendars={calendars}
          busy={busy}
          onPick={async (googleCalendarId, firstImport) => {
            await run(async () => {
              setView(await getCalendarSyncClient().selectCalendar({ googleCalendarId, firstImport }))
            })
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
              onChange={() => {
                if (busy) return
                void run(async () => {
                  setView(await getCalendarSyncClient().setAutoSync(!view.autoSync))
                })
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-line mt-3"
            disabled={busy}
            onClick={() => void run(async () => {
              const report = await getCalendarSyncClient().sync()
              setMessage(`동기화 ${report.imported} 가져옴, ${report.exported} 보냄`)
              setView(await getCalendarSyncClient().status())
            })}
          >
            지금 동기화
          </button>
          <button
            type="button"
            className="btn btn-ghost mt-3"
            disabled={busy}
            onClick={() => void run(async () => {
              const leave = await confirm('Google Calendar 연결을 해제할까요? Google에 있는 일정은 삭제하지 않습니다.', {
                title: '연결 해제',
                confirmLabel: '해제',
              })
              if (!leave) return
              const dropImported = await confirm('Blanky로 가져온 일정을 삭제할까요? Google 일정은 그대로 둡니다.', {
                title: '가져온 일정',
                confirmLabel: '삭제',
              })
              const disposition: DisconnectDisposition = {
                importedRows: dropImported ? 'delete' : 'keep',
              }
              setView(await getCalendarSyncClient().disconnect(disposition))
            })}
          >
            연결 해제
          </button>
        </>
      ) : null}
    </div>
  )
}
