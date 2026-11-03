import type { Priority } from '@blanky/types'
import './priority.css'

const priorityLabels = { high: '높음', medium: '보통', low: '낮음' }
export function PriorityBadge({ value, completed = false }: { value: Priority; completed?: boolean }) {
  return <span className="priority-tone priority-badge" data-priority={value} data-completed={completed || undefined} aria-label={`우선순위 ${priorityLabels[value]}`}>{priorityLabels[value]}</span>
}
export function PriorityField({ value, onChange }: { value: Priority; onChange: (value: Priority) => void }) {
  return <label className="block text-xs text-neutral-500">우선순위<select data-theme-slot="input" className="field priority-tone priority-select mt-1 w-full" data-priority={value} value={value} onChange={event => onChange(event.target.value as Priority)}>{(['high', 'medium', 'low'] as const).map(key => <option className="priority-tone" data-priority={key} key={key} value={key}>{priorityLabels[key]}</option>)}</select></label>
}
