import type { RepeatRule } from '../../types/work.ts'
import { isoWeekday } from '../../../packages/types/src/recurrence.ts'

export function RepeatPicker({ repeat, days = [], date, onChange }: { repeat: RepeatRule; days?: number[]; date: string; onChange: (repeat: RepeatRule, days: number[]) => void }) {
  const selected = days.length ? days : date ? [isoWeekday(date)] : [1]
  return <div className="text-xs text-neutral-500">
    <label>반복<select aria-label="반복" className="field mt-1 w-full" value={repeat} onChange={e => { const next = e.target.value as RepeatRule; onChange(next, next === 'weekly' ? selected : []) }}><option value="none">반복 없음</option><option value="daily">매일</option><option value="weekly">매주 · 요일 선택</option><option value="monthly">매월</option></select></label>
    {repeat === 'weekly' && <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="반복 요일">{['월','화','수','목','금','토','일'].map((label, index) => { const day = index + 1, active = selected.includes(day); return <button type="button" key={day} aria-label={`${label}요일 반복`} aria-pressed={active} className={active ? 'chip chip-on text-blue-600' : 'chip'} onClick={() => { const next = active ? selected.filter(value => value !== day) : [...selected, day].sort((a,b) => a-b); if (next.length) onChange('weekly', next) }}>{label}</button> })}</div>}
    {repeat !== 'none' && <p className="mt-2">시작 날짜부터 반복합니다. 수정·삭제는 반복 일정 전체에 적용됩니다.</p>}
  </div>
}
