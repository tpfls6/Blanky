import { CalendarDays, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n.ts'
import { useCalendars } from '../../state/useCalendars.ts'
import { CalendarList } from './CalendarList.tsx'

/** Opens the calendar list as a sheet from the mobile schedule header. */
export function MobileCalendarBar() {
  const { t } = useI18n()
  const { entries, invitations } = useCalendars()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])
  const label = t('schedule.mobile.calendar')
  const hidden = entries.filter(entry => entry.hidden).length
  const triggerLabel = [
    label,
    hidden ? t('schedule.mobile.hiddenCalendarCount', { count: hidden }) : '',
    invitations.length ? t('schedule.mobile.calendarInvitationCount', { count: invitations.length }) : '',
  ].filter(Boolean).join(' · ')
  return <div data-mobile-calendar-bar>
    <button type="button" className="mcal-ib" aria-label={triggerLabel} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)} data-open-calendars>
      <CalendarDays aria-hidden="true" className="size-5.5" strokeWidth={1.8} />
    </button>
    <dialog ref={ref} data-theme-slot="modal" aria-label={label}
      className="calendar-sheet m-0 mt-auto max-h-[80dvh] w-full max-w-none overflow-y-auto rounded-t-xl border border-line bg-surface p-4 text-neutral-900 backdrop:bg-black/40"
      onCancel={event => { event.preventDefault(); setOpen(false) }}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">{label}</h2>
        <button type="button" className="icon-btn" aria-label={t('close')} onClick={() => setOpen(false)}><X aria-hidden="true" className="size-4" /></button>
      </div>
      {open ? <CalendarList compact /> : null}
    </dialog>
  </div>
}
