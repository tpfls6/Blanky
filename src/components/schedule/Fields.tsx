import { CATEGORIES } from '../../data/mockWorkspace.ts'
import type { Priority } from '@blanky/types'
import type { RepeatRule, WorkStatus } from '../../types/work.ts'
import { PRIORITY_LABEL, REPEAT_LABEL } from '../../utils/work.ts'

export const fieldClass = 'w-full bg-transparent text-sm text-neutral-900 focus:outline-none'

export function CategoryField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null) => void
}) {
  const parents = CATEGORIES.filter((category) => category.parentId === null)

  return (
    <label className="block">
      <span className="text-xs text-neutral-400">카테고리</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className={`${fieldClass} mt-1`}
      >
        <option value="">없음</option>
        {parents.map((parent) => (
          <optgroup key={parent.id} label={parent.name}>
            <option value={parent.id}>{parent.name}</option>
            {CATEGORIES.filter((category) => category.parentId === parent.id).map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

export function RepeatField({
  value,
  onChange,
}: {
  value: RepeatRule
  onChange: (repeat: RepeatRule) => void
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-400">반복</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as RepeatRule)}
        className={`${fieldClass} mt-1`}
      >
        {(Object.keys(REPEAT_LABEL) as RepeatRule[]).map((repeat) => (
          <option key={repeat} value={repeat}>
            {REPEAT_LABEL[repeat]}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PriorityField({
  value,
  onChange,
}: {
  value: Priority
  onChange: (priority: Priority) => void
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-400">우선순위</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Priority)}
        className={`${fieldClass} mt-1`}
      >
        {(Object.keys(PRIORITY_LABEL) as Priority[]).map((priority) => (
          <option key={priority} value={priority}>
            {PRIORITY_LABEL[priority]}
          </option>
        ))}
      </select>
    </label>
  )
}

export function StatusField({
  value,
  onChange,
}: {
  value: WorkStatus
  onChange: (status: WorkStatus) => void
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-400">상태</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as WorkStatus)}
        className={`${fieldClass} mt-1`}
      >
        <option value="todo">할 일</option>
        <option value="done">완료</option>
      </select>
    </label>
  )
}
