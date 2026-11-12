import { CalendarDays, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCalendars } from '../../state/useCalendars.ts'
import { CalendarList } from './CalendarList.tsx'

/** Phones have no sidebar: the calendar list opens as a sheet. The bell lives in the mobile top bar. */
export function MobileCalendarBar() {
  const { entries, invitations } = useCalendars()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])
  const hidden = entries.filter(entry => entry.hidden).length
  return <div className="flex items-center justify-end gap-1" data-mobile-calendar-bar>
    <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(true)} data-open-calendars>
      <CalendarDays aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      캘린더{hidden ? ` · ${hidden}개 숨김` : ''}{invitations.length ? ` · 초대 ${invitations.length}` : ''}
    </button>
    <dialog ref={ref} data-theme-slot="modal" aria-label="캘린더"
      className="calendar-sheet m-0 mt-auto max-h-[80dvh] w-full max-w-none overflow-y-auto rounded-t-xl border border-line bg-surface p-4 text-neutral-900 backdrop:bg-black/40"
      onCancel={event => { event.preventDefault(); setOpen(false) }}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">캘린더</h2>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={() => setOpen(false)}><X aria-hidden="true" className="size-4" /></button>
      </div>
      {open ? <CalendarList compact /> : null}
    </dialog>
  </div>
}
