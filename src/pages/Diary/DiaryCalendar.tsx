import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DiaryEntry } from '../../types/records.ts'
import { formatMonthTitle } from '../../i18n/format.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { todayISO } from '../../utils/date.ts'
import { MOODS, choiceOf } from './diaryChoices.ts'

const iso = (date: Date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
/** Month grid: a day with entries shows that day's mood emoji (a dot when no mood), today is a filled circle. */
export function DiaryCalendar({ month, selectedDate, entries, weekStartsOn, onMonth, onSelect, disabled }: {
  month: string; selectedDate: string | null; entries: DiaryEntry[]; weekStartsOn: 0 | 1
  onMonth: (month: string) => void; onSelect: (date: string | null) => void; disabled: boolean
}) {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year, monthNumber - 1, 1, 12)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  const weeks = Math.ceil((offset + new Date(year, monthNumber, 0).getDate()) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(year, monthNumber - 1, i - offset + 1, 12))
  // Entries arrive newest first, so the first mood seen for a day is its latest one.
  const counts = new Map<string, number>(), moods = new Map<string, string>()
  for (const entry of entries) {
    counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1)
    const mood = choiceOf(MOODS, entry.mood)
    if (mood && !moods.has(entry.date)) moods.set(entry.date, mood[1])
  }
  const { t, locale } = useI18n()
  const today = todayISO()
  const shift = (amount: number) => onMonth(iso(new Date(year, monthNumber - 1 + amount, 1, 12)).slice(0, 7))
  const weekdays = locale === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['일', '월', '화', '수', '목', '금', '토']
  return <div className="diary-calendar diary-cal" aria-label={t('diary.title')}>
    <div className="diary-calendar-heading">
      <h2 aria-live="polite">{formatMonthTitle(locale, first)}</h2>
      <div>
        <button type="button" className="diary-cal-today" disabled={disabled} onClick={() => { onMonth(today.slice(0, 7)); onSelect(today) }}>{t('today')}</button>
        <button type="button" className="diary-cal-nav" aria-label={t('diary.prevMonth')} onClick={() => shift(-1)} disabled={disabled}><ChevronLeft size={18} strokeWidth={1.7} /></button>
        <button type="button" className="diary-cal-nav" aria-label={t('diary.nextMonth')} onClick={() => shift(1)} disabled={disabled}><ChevronRight size={18} strokeWidth={1.7} /></button>
      </div>
    </div>
    <div className="diary-calendar-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7).map(day => <span key={day} className={day === 0 ? 'cal-holiday' : undefined}>{weekdays[day]}</span>)}</div>
    <div className="diary-calendar-days">{days.map(day => {
      const date = iso(day), count = counts.get(date) ?? 0, mood = moods.get(date)
      return <button key={date} type="button" data-date={date} className={'diary-calendar-day' + (!date.startsWith(month) ? ' diary-calendar-outside' : '')}
        aria-label={t('diary.dayLabel', { date, count })} aria-pressed={selectedDate === date} aria-current={date === today ? 'date' : undefined}
        disabled={disabled} onClick={() => { if (!date.startsWith(month)) onMonth(date.slice(0, 7)); onSelect(selectedDate === date ? null : date) }}>
        <span>{day.getDate()}</span>{count > 0 ? <i className={mood ? 'diary-cal-mood' : 'diary-cal-dot'} aria-hidden="true">{mood}</i> : null}
      </button>
    })}</div>
  </div>
}
