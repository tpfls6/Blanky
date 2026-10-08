import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DiaryEntry } from '../../types/records.ts'
import { todayISO } from '../../utils/date.ts'

const iso = (date: Date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
export function DiaryCalendar({ month, selectedDate, entries, weekStartsOn, onMonth, onSelect, disabled }: {
  month: string; selectedDate: string | null; entries: DiaryEntry[]; weekStartsOn: 0 | 1
  onMonth: (month: string) => void; onSelect: (date: string | null) => void; disabled: boolean
}) {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year, monthNumber - 1, 1, 12)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  const weeks = Math.ceil((offset + new Date(year, monthNumber, 0).getDate()) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(year, monthNumber - 1, i - offset + 1, 12))
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1)
  const shift = (amount: number) => onMonth(iso(new Date(year, monthNumber - 1 + amount, 1, 12)).slice(0, 7))
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return <div className="diary-calendar" aria-label="기록 달력">
    <div className="diary-calendar-heading">
      <button type="button" className="icon-btn" aria-label="이전 달" onClick={() => shift(-1)} disabled={disabled}><ChevronLeft size={16} /></button>
      <h2 aria-live="polite">{year}년 {monthNumber}월</h2>
      <button type="button" className="icon-btn" aria-label="다음 달" onClick={() => shift(1)} disabled={disabled}><ChevronRight size={16} /></button>
    </div>
    <div className="diary-calendar-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => weekdays[(i + weekStartsOn) % 7]).map(day => <span key={day}>{day}</span>)}</div>
    <div className="diary-calendar-days">{days.map(day => {
      const date = iso(day), count = counts.get(date) ?? 0
      return <button key={date} type="button" data-date={date} className={'diary-calendar-day' + (!date.startsWith(month) ? ' diary-calendar-outside' : '')}
        aria-label={date + ', 기록 ' + count + '개'} aria-pressed={selectedDate === date} aria-current={date === todayISO() ? 'date' : undefined}
        disabled={disabled} onClick={() => { if (!date.startsWith(month)) onMonth(date.slice(0, 7)); onSelect(selectedDate === date ? null : date) }}>
        <span>{day.getDate()}</span><span className="diary-calendar-marker" aria-hidden="true">{count > 0 ? <i /> : null}</span>
      </button>
    })}</div>
    <div className="diary-calendar-footer"><button type="button" disabled={disabled} onClick={() => { onMonth(todayISO().slice(0, 7)); onSelect(todayISO()) }}>오늘</button><button type="button" disabled={disabled} aria-pressed={!selectedDate} onClick={() => onSelect(null)}>이 달 전체</button></div>
  </div>
}
