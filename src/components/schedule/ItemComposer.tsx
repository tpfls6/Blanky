import { useState } from 'react'
import { SidePanel } from '../common/SidePanel.tsx'
import { useWorkspace } from '../../state/useWorkspace.ts'
import type { ComposerSeed } from '../../state/usePanels.ts'
import type { Priority } from '@blanky/types'
import type { RepeatRule, WorkKind, WorkStatus } from '../../types/work.ts'
import { CategoryField, PriorityField, RepeatField, StatusField, fieldClass } from './Fields.tsx'

type ItemComposerProps = {
  seed: ComposerSeed
  onClose: () => void
}

export function ItemComposer({ seed, onClose }: ItemComposerProps) {
  const { add } = useWorkspace()
  const [kind, setKind] = useState<WorkKind>(seed.kind)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(seed.date)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [duration, setDuration] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [priority, setPriority] = useState<Priority>('medium')
  const [status, setStatus] = useState<WorkStatus>('todo')
  const [description, setDescription] = useState('')
  const [repeat, setRepeat] = useState<RepeatRule>('none')
  const [more, setMore] = useState(false)
  const task = kind === 'task'
  const canSave = title.trim().length > 0 && (task || startTime.length > 0)

  const save = () => {
    if (!canSave) return
    add({
      kind,
      title,
      description,
      date,
      startTime: startTime || null,
      endTime: endTime || null,
      duration: duration === '' ? null : Number(duration),
      dueDate: dueDate || null,
      categoryId,
      priority,
      status,
      repeat,
    })
    onClose()
  }

  return (
    <SidePanel onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            aria-pressed={task}
            onClick={() => setKind('task')}
            className={task ? 'text-neutral-900' : 'text-neutral-400'}
          >
            할 일
          </button>
          <button
            type="button"
            aria-pressed={!task}
            onClick={() => setKind('event')}
            className={task ? 'text-neutral-400' : 'text-neutral-900'}
          >
            일정
          </button>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-800">
          닫기
        </button>
      </div>
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <input
          value={title}
          aria-label="제목"
          placeholder="제목"
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          className="w-full bg-transparent text-lg font-medium text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
        />
        <label className="mt-5 block">
          <span className="text-xs text-neutral-400">날짜</span>
          <input
            type="date"
            required
            value={date}
            onChange={(event) => {
              if (event.target.value) setDate(event.target.value)
            }}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <label>
            <span className="text-xs text-neutral-400">{task ? '시작' : '시작 시간'}</span>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label>
            <span className="text-xs text-neutral-400">종료</span>
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={`${fieldClass} mt-1`}
            />
          </label>
        </div>
        <div className="mt-5">
          <CategoryField value={categoryId} onChange={setCategoryId} />
        </div>
        {task ? (
          <div className="mt-5">
            <PriorityField value={priority} onChange={setPriority} />
          </div>
        ) : (
          <div className="mt-5">
            <RepeatField value={repeat} onChange={setRepeat} />
          </div>
        )}
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((value) => !value)}
          className="mt-5 text-sm text-neutral-400 hover:text-neutral-800"
        >
          {more ? '간단히' : '자세히'}
        </button>
        {more ? (
          <div className="mt-4 space-y-5">
            {task ? (
              <label className="block">
                <span className="text-xs text-neutral-400">예상 소요시간 (분)</span>
                <input
                  type="number"
                  min={0}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  className={`${fieldClass} mt-1`}
                />
              </label>
            ) : null}
            {task ? (
              <label className="block">
                <span className="text-xs text-neutral-400">마감일</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className={`${fieldClass} mt-1`}
                />
              </label>
            ) : null}
            {task ? null : <PriorityField value={priority} onChange={setPriority} />}
            {task ? <StatusField value={status} onChange={setStatus} /> : null}
            <label className="block">
              <span className="text-xs text-neutral-400">메모</span>
              <textarea
                value={description}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
                className={`${fieldClass} mt-1 resize-none leading-relaxed`}
              />
            </label>
            {task ? <RepeatField value={repeat} onChange={setRepeat} /> : null}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={!canSave}
          className="mt-8 text-sm text-neutral-900 disabled:text-neutral-300"
        >
          추가
        </button>
      </form>
    </SidePanel>
  )
}
