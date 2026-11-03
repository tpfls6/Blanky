import { CalendarDays, Clock } from 'lucide-react'
import { useI18n } from '../../i18n/useI18n.ts'
import { formatDisplayDate } from '../../i18n/format.ts'

export function DateTimeInfo({ date, endDate, startTime, endTime, allDay = false }: {
  date?: string | null; endDate?: string | null; startTime?: string | null; endTime?: string | null; allDay?: boolean
}) {
  const { locale } = useI18n()
  if (!date && !startTime && !endTime && !allDay) return null
  return <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-relaxed text-neutral-500">
    {date ? <span className="inline-flex flex-wrap items-center gap-1"><CalendarDays className="size-3 shrink-0" aria-hidden="true" /><time dateTime={date}>{formatDisplayDate(locale, date)}</time>{endDate && endDate !== date ? <>{" – "}<time dateTime={endDate}>{formatDisplayDate(locale, endDate)}</time></> : null}</span> : null}
    {allDay ? <span>{locale === 'ko' ? '종일' : 'All day'}</span> : startTime || endTime ? <span className="inline-flex items-center gap-1 tabular-nums"><Clock className="size-3 shrink-0" aria-hidden="true" />{startTime ? <time>{startTime}</time> : null}{startTime && endTime ? <span>{"–"}</span> : null}{endTime ? <time>{endTime}</time> : null}</span> : null}
  </span>
}
