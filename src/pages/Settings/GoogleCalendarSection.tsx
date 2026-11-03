import { useEffect, useRef, useState } from 'react'
import type {
  ConnectionView,
  DisconnectDisposition,
  FirstImport,
  GoogleCalendarChoice,
  GoogleCalendarId,
} from '@blanky/types'
import { getCalendarSyncClient, synchronizeCalendars } from '../../services/calendarSync/index.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { calendarPanel, errorCode, errorLine, lastSyncLine } from './calendarPanel.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { Choice, SwitchRow } from './bits.tsx'
import { ArrowRight } from 'lucide-react'

function ImportDirection({ label }: { label: string }) {
  const [from, to] = label.split(' → ')
  return <span className="inline-flex items-center gap-1.5 align-middle" role="img" aria-label={label}><span aria-hidden="true">{from}</span><ArrowRight size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /><span aria-hidden="true">{to}</span></span>
}

function CalendarPick({
  calendars,
  busy,
  onPick,
}: {
  calendars: readonly GoogleCalendarChoice[]
  busy: boolean
  onPick: (id: GoogleCalendarId, firstImport: FirstImport) => Promise<void>
}) {
  const { t } = useI18n()
  const [choice, setChoice] = useState<GoogleCalendarId | ''>(calendars[0]?.id ?? '')
  const [direction, setDirection] = useState<FirstImport['direction']>('from_google')
  return (
    <fieldset className="mt-3 space-y-3" disabled={busy}>
      <label className="block text-sm">
        {t('calendar.pickCalendar')}
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
        <p className="text-sm">{t('calendar.firstImport')}</p>
        <p className="mt-1 text-xs text-neutral-400">{t('calendar.firstImportHint')}</p>
        <div className="mt-2 flex flex-wrap gap-1" role="radiogroup">
          <Choice value="from_google" current={direction} label={<ImportDirection label={t('calendar.fromGoogle')} />} onPick={setDirection} />
          <Choice value="from_blanky" current={direction} label={<ImportDirection label={t('calendar.fromBlanky')} />} onPick={setDirection} />
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
        {t('calendar.useCalendar')}
      </button>
    </fieldset>
  )
}

export function GoogleCalendarSection() {
  const { t, locale } = useI18n()
  const { refreshWork } = useLibrary()
  const { user } = useSession()
  const confirm = useConfirm()
  const [view, setView] = useState<ConnectionView | undefined>(() => isSupabaseConfigured ? undefined : { status: 'error', code: 'GOOGLE_ENV_MISSING', message: t('calendar.envView') })
  const [calendars, setCalendars] = useState<readonly GoogleCalendarChoice[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let stopped = false
    const sync = getCalendarSyncClient()
    const load = () => { void sync.status().then(async (next) => {
      if (stopped) return
      setView(next)
      if (next.status === 'connected') {
        const rows = await sync.listCalendars()
        if (!stopped) setCalendars(rows)
      }
    }).catch((error) => {
      if (!stopped) setView({ status: 'error', code: errorCode(error), message: errorLine(error, locale) })
    }) }
    load()
    window.addEventListener('blanky:calendar-synced', load)
    return () => { stopped = true; window.removeEventListener('blanky:calendar-synced', load) }
  }, [locale])

  if (!view) return <p className="text-sm text-neutral-500" role="status">{t('calendar.reading')}</p>

  const panel = calendarPanel(view, locale)

  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setMessage('')
    try {
      await work()
    } catch (error) {
      setMessage(errorLine(error, locale))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div>
      {panel.intro ? <p className="text-sm text-neutral-500">{panel.intro}</p> : null}
      <p className="mt-1 text-sm" role="status">{panel.statusLabel}</p>
      {panel.accountEmail ? <p className="mt-1 text-sm text-neutral-500">{t('calendar.account', { email: panel.accountEmail })}</p> : null}
      {panel.calendarSummary ? <p className="mt-1 text-sm text-neutral-500">{t('calendar.calendarName', { name: panel.calendarSummary })}</p> : null}
      {panel.lastSync ? <p className="mt-1 text-sm text-neutral-500">{lastSyncLine(panel.lastSync, locale)}</p> : null}
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
              await refreshWork()
            })
          }}
        />
      ) : null}

      {view.status === 'ready' ? (
        <>
          <div className="mt-3">
            <SwitchRow
              label={t('calendar.autoSync')}
              hint={t('calendar.autoSyncHint')}
              checked={view.autoSync}
              onChange={() => {
                if (busy) return
                void run(async () => {
                  setView(await getCalendarSyncClient().setAutoSync(!view.autoSync))
                  window.dispatchEvent(new Event('blanky:work-saved'))
                })
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-line mt-3"
            disabled={busy}
            onClick={() => void run(async () => {
              const report = await synchronizeCalendars(user!.id, refreshWork)
              setMessage(t('calendar.synced', { imported: report.imported, exported: report.exported }))
              setView(await getCalendarSyncClient().status())
            })}
          >
            {t('calendar.syncNow')}
          </button>
          <button
            type="button"
            className="btn btn-ghost mt-3"
            disabled={busy}
            onClick={() => void run(async () => {
              const leave = await confirm(t('calendar.disconnectConfirm'), {
                title: t('calendar.disconnectTitle'),
                confirmLabel: t('calendar.disconnectAction'),
              })
              if (!leave) return
              const dropImported = await confirm(t('calendar.dropImported'), {
                title: t('calendar.dropImportedTitle'),
                confirmLabel: t('delete'),
              })
              const disposition: DisconnectDisposition = {
                importedRows: dropImported ? 'delete' : 'keep',
              }
              setView(await getCalendarSyncClient().disconnect(disposition))
              await refreshWork()
            })}
          >
            {t('calendar.disconnect')}
          </button>
        </>
      ) : null}
    </div>
  )
}
