import { useMemo, useState } from 'react'
import { useWorkspace } from '../../state/useWorkspace.ts'
import type { WorkKind } from '../../types/work.ts'
import { shortDate, todayISO, tomorrowISO } from '../../utils/date.ts'
import { parseQuick, type QuickDraft } from '../../utils/parseQuick.ts'
import { CategoryPicker } from './CategoryPicker.tsx'
import { fieldClass } from './Fields.tsx'

type QuickAddProps = {
  kind: WorkKind
  date: string
  autoFocus?: boolean
}

type Overrides = Partial<
  Pick<QuickDraft, 'date' | 'endDate' | 'startTime' | 'endTime' | 'dueDate' | 'categoryId' | 'allDay' | 'kind'>
>

function whenLabel(draft: QuickDraft): string {
  const start = draft.date === todayISO() ? 'Today' : rel(draft.date)
  const end = draft.kind === 'task' ? draft.dueDate : draft.endDate
  if (end && end !== draft.date) return `${start}–${rel(end)}`
  return start
}

function rel(iso: string): string {
  if (iso === todayISO()) return 'Today'
  if (iso === tomorrowISO()) return 'Tomorrow'
  return shortDate(iso)
}

function timeLabel(draft: QuickDraft): string {
  if (draft.allDay || !draft.startTime) return draft.kind === 'event' ? '종일' : '시간 없음'
  return draft.endTime ? `${draft.startTime}–${draft.endTime}` : draft.startTime
}

export function QuickAdd({ kind: defaultKind, date, autoFocus = false }: QuickAddProps) {
  const { add, categories } = useWorkspace()
  const [text, setText] = useState('')
  const [kind, setKind] = useState<WorkKind>(defaultKind)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [editing, setEditing] = useState<'when' | 'time' | null>(null)
  const parsed = useMemo(
    () => parseQuick(text, new Date(), categories, kind, date),
    [text, categories, kind, date],
  )
  const draft: QuickDraft = { ...parsed, ...overrides, kind }
  const ready = text.trim().length > 0

  const save = () => {
    if (!ready) return
    add({
      kind: draft.kind,
      title: draft.title,
      date: draft.date,
      endDate: draft.endDate,
      startTime: draft.allDay ? null : draft.startTime,
      endTime: draft.allDay ? null : draft.endTime,
      duration: draft.duration,
      dueDate: draft.dueDate,
      categoryId: draft.categoryId,
      allDay: draft.kind === 'event' ? draft.allDay : false,
    })
    setText('')
    setOverrides({})
    setEditing(null)
    setKind(defaultKind)
  }

  const patch = (next: Overrides) => setOverrides((current) => ({ ...current, ...next }))

  return (
    <form
      className="mt-6"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <textarea
        value={text}
        rows={Math.max(1, text.split('\n').length)}
        autoFocus={autoFocus}
        aria-label={defaultKind === 'event' ? '일정 입력' : '할 일 입력'}
        placeholder="내일 오후 2시부터 4시까지 팀 회의"
        onChange={(event) => {
          setText(event.target.value)
          setOverrides({})
          setEditing(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setText('')
            setOverrides({})
            setEditing(null)
            return
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            save()
          }
        }}
        className="w-full resize-none bg-transparent text-base text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
      />
      {ready ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-neutral-500">
          <span className="text-neutral-800">{draft.title}</span>
          <span className="flex gap-2">
            <button
              type="button"
              aria-pressed={draft.kind === 'task'}
              onClick={() => setKind('task')}
              className={draft.kind === 'task' ? 'text-neutral-900' : 'text-neutral-400'}
            >
              할 일
            </button>
            <button
              type="button"
              aria-pressed={draft.kind === 'event'}
              onClick={() => setKind('event')}
              className={draft.kind === 'event' ? 'text-neutral-900' : 'text-neutral-400'}
            >
              일정
            </button>
          </span>
          <button type="button" onClick={() => setEditing(editing === 'when' ? null : 'when')} className="hover:text-neutral-900">
            {whenLabel(draft)}
          </button>
          <button type="button" onClick={() => setEditing(editing === 'time' ? null : 'time')} className="hover:text-neutral-900">
            {timeLabel(draft)}
          </button>
          <CategoryPicker
            categories={categories}
            value={draft.categoryId}
            onChange={(categoryId) => patch({ categoryId })}
          />
          <button type="submit" className="text-neutral-900">
            저장
          </button>
        </div>
      ) : null}
      {ready && editing === 'when' ? (
        <div className="mt-2 flex flex-wrap gap-3">
          <label className="text-xs text-neutral-400">
            시작
            <input
              type="date"
              value={draft.date}
              onChange={(event) => {
                if (event.target.value) patch({ date: event.target.value })
              }}
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label className="text-xs text-neutral-400">
            {draft.kind === 'task' ? '마감' : '종료'}
            <input
              type="date"
              value={(draft.kind === 'task' ? draft.dueDate : draft.endDate) ?? ''}
              onChange={(event) => {
                const value = event.target.value || null
                patch(draft.kind === 'task' ? { dueDate: value } : { endDate: value })
              }}
              className={`${fieldClass} mt-1`}
            />
          </label>
        </div>
      ) : null}
      {ready && editing === 'time' ? (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-xs text-neutral-400">
            시작
            <input
              type="time"
              value={draft.startTime ?? ''}
              onChange={(event) =>
                patch({ startTime: event.target.value || null, allDay: !event.target.value && draft.kind === 'event' })
              }
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label className="text-xs text-neutral-400">
            종료
            <input
              type="time"
              value={draft.endTime ?? ''}
              onChange={(event) => patch({ endTime: event.target.value || null, allDay: false })}
              className={`${fieldClass} mt-1`}
            />
          </label>
          {draft.kind === 'event' ? (
            <button
              type="button"
              onClick={() => patch({ allDay: !draft.allDay, startTime: null, endTime: null })}
              className="text-sm text-neutral-500 hover:text-neutral-900"
            >
              종일
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
