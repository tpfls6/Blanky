import type { RepeatRule } from '../../types/work.ts'
import { isoWeekday } from '../../../packages/types/src/recurrence.ts'

const UNITS: { rule: Exclude<RepeatRule, 'none'>; label: string }[] = [{ rule: 'daily', label: '일' }, { rule: 'weekly', label: '주' }, { rule: 'monthly', label: '개월' }]
const WEEKDAYS = [1, 2, 3, 4, 5]

/**
 * Repeat rule editor. "사용자 지정" is the same rule with an interval above 1 (every N days, weeks or months).
 * Interval and end date show only when their handlers are given, so older callers keep the plain picker.
 */
export function RepeatPicker({ repeat, days = [], date, onChange, allowNone = true, hint = '시작 날짜부터 반복합니다.', interval = 1, onIntervalChange, until, onUntilChange }: {
  repeat: RepeatRule
  days?: number[]
  date: string
  onChange: (repeat: RepeatRule, days: number[]) => void
  allowNone?: boolean
  hint?: string | null
  interval?: number
  onIntervalChange?: (interval: number) => void
  /** '' repeats with no end. */
  until?: string
  onUntilChange?: (until: string) => void
}) {
  const selected = days.length ? days : date ? [isoWeekday(date)] : [1]
  const custom = repeat !== 'none' && interval > 1
  const pick = (value: string) => {
    if (value === 'custom') {
      const rule = repeat === 'none' ? 'daily' : repeat
      onChange(rule, rule === 'weekly' ? selected : [])
      onIntervalChange?.(Math.max(2, interval))
      return
    }
    const next = value as RepeatRule
    onChange(next, next === 'weekly' ? selected : [])
    onIntervalChange?.(1)
  }
  return <div className="text-xs text-neutral-500" data-repeat-picker>
    <label>반복<select aria-label="반복" className="field mt-1 w-full" value={custom ? 'custom' : repeat} onChange={e => pick(e.target.value)}>
      {allowNone && <option value="none">반복 없음</option>}
      <option value="daily">매일</option>
      <option value="weekly">매주 · 요일 선택</option>
      <option value="monthly">매월</option>
      {onIntervalChange && <option value="custom">사용자 지정</option>}
    </select></label>
    {custom && onIntervalChange && <div className="mt-2 flex items-center gap-2" role="group" aria-label="반복 간격">
      <input data-theme-slot="input" type="number" inputMode="numeric" min={2} max={99} aria-label="반복 간격" className="field w-16" value={interval}
        onChange={e => { const value = Math.round(Number(e.target.value)); if (value >= 1 && value <= 99) onIntervalChange(value) }} />
      <select aria-label="반복 단위" className="field" value={repeat} onChange={e => { const rule = e.target.value as Exclude<RepeatRule, 'none'>; onChange(rule, rule === 'weekly' ? selected : []) }}>
        {UNITS.map(unit => <option key={unit.rule} value={unit.rule}>{unit.label}</option>)}
      </select>
      <span>마다</span>
    </div>}
    {repeat === 'weekly' && <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="반복 요일">
      {['월','화','수','목','금','토','일'].map((label, index) => { const day = index + 1, active = selected.includes(day); return <button type="button" key={day} aria-label={`${label}요일 반복`} aria-pressed={active} className={active ? 'chip chip-on text-blue-600' : 'chip'} onClick={() => { const next = active ? selected.filter(value => value !== day) : [...selected, day].sort((a,b) => a-b); if (next.length) onChange('weekly', next) }}>{label}</button> })}
      <button type="button" className="chip" aria-label="평일 반복" onClick={() => onChange('weekly', WEEKDAYS)}>평일</button>
    </div>}
    {repeat !== 'none' && onUntilChange && <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2" role="group" aria-label="반복 종료">
      <label className="flex items-center gap-1"><input type="checkbox" checked={!until} onChange={e => onUntilChange(e.target.checked ? '' : date || '')} />종료 없음</label>
      <input data-theme-slot="input" type="date" aria-label="반복 종료일" className="field min-w-0" value={until ?? ''} min={date || undefined} disabled={!until} onChange={e => onUntilChange(e.target.value)} />
    </div>}
    {repeat !== 'none' && hint && <p className="mt-2">{hint}</p>}
  </div>
}
