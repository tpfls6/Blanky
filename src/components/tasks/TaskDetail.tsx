import { useState } from 'react'
import { parseClock } from '@blanky/utils'
import { SidePanel } from '../common/SidePanel.tsx'
import { CategoryPicker } from '../schedule/CategoryPicker.tsx'
import { PriorityField, RepeatField, fieldClass } from '../schedule/Fields.tsx'
import { useWorkspace } from '../../state/useWorkspace.ts'
import type { WorkItem, WorkPatch } from '../../types/work.ts'
import { todayISO, tomorrowISO } from '../../utils/date.ts'
import { placedTimes } from '../../utils/work.ts'
import { TaskCheckbox } from './TaskCheckbox.tsx'

type TaskDetailProps = {
  item: WorkItem
  onClose: () => void
}

export function TaskDetail({ item, onClose }: TaskDetailProps) {
  const { categories, update, toggle, remove } = useWorkspace()
  const [confirming, setConfirming] = useState(false)
  const task = item.kind === 'task'

  const change = (patch: WorkPatch) => update(item.id, patch)

  return (
    <SidePanel onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        {task ? (
          <TaskCheckbox
            checked={item.status === 'done'}
            label={`${item.title} 완료`}
            onChange={() => toggle(item.id)}
          />
        ) : (
          <span className="pt-1 text-xs text-neutral-400">일정</span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-sm text-neutral-400 hover:text-neutral-800"
        >
          닫기
        </button>
      </div>
      <input
        value={item.title}
        aria-label="제목"
        onChange={(event) => change({ title: event.target.value })}
        className="mt-2 w-full bg-transparent text-lg font-medium text-neutral-900 focus:outline-none"
      />
      <label className="mt-5 block">
        <span className="text-xs text-neutral-400">메모</span>
        <textarea
          value={item.description}
          rows={3}
          onChange={(event) => change({ description: event.target.value })}
          className={`${fieldClass} mt-1 resize-none leading-relaxed`}
        />
      </label>
      <label className="mt-5 block">
        <span className="text-xs text-neutral-400">날짜</span>
        <input
          type="date"
          value={item.date}
          onChange={(event) => {
            if (event.target.value) change({ date: event.target.value })
          }}
          className={`${fieldClass} mt-1`}
        />
      </label>
      <div className="mt-2 flex gap-4 text-sm text-neutral-500">
        <button type="button" onClick={() => change({ date: todayISO() })} className="hover:text-neutral-900">
          오늘
        </button>
        <button type="button" onClick={() => change({ date: tomorrowISO() })} className="hover:text-neutral-900">
          내일
        </button>
      </div>
      {task ? null : (
        <label className="mt-5 block">
          <span className="text-xs text-neutral-400">종료 날짜</span>
          <input
            type="date"
            value={item.endDate ?? ''}
            onChange={(event) => change({ endDate: event.target.value || null })}
            className={`${fieldClass} mt-1`}
          />
        </label>
      )}
      <div className="mt-5 grid grid-cols-2 gap-4">
        <label>
          <span className="text-xs text-neutral-400">시작</span>
          <input
            type="time"
            value={item.startTime ?? ''}
            onChange={(event) => {
              const startTime = event.target.value || null
              if (!startTime) {
                change(task ? { startTime: null, endTime: null } : { startTime: null, endTime: null, allDay: true })
                return
              }
              change({ ...placedTimes(item, startTime), allDay: false })
            }}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label>
          <span className="text-xs text-neutral-400">종료</span>
          <input
            type="time"
            value={item.endTime ?? ''}
            onChange={(event) => {
              const endTime = event.target.value || null
              if (!endTime || !item.startTime) {
                change({ endTime })
                return
              }
              const start = parseClock(item.startTime)
              const end = parseClock(endTime)
              const duration = start !== null && end !== null && end > start ? end - start : item.duration
              change({ endTime, duration })
            }}
            className={`${fieldClass} mt-1`}
          />
        </label>
      </div>
      {task && item.startTime ? (
        <button
          type="button"
          onClick={() => change({ startTime: null, endTime: null })}
          className="mt-2 text-sm text-neutral-500 hover:text-neutral-900"
        >
          시간 없음
        </button>
      ) : null}
      {!task ? (
        <button
          type="button"
          onClick={() =>
            change(
              item.allDay
                ? { allDay: false }
                : { allDay: true, startTime: null, endTime: null },
            )
          }
          className="mt-2 text-sm text-neutral-500 hover:text-neutral-900"
        >
          {item.allDay ? '시간 지정' : '종일'}
        </button>
      ) : null}
      {task ? (
        <>
          <label className="mt-5 block">
            <span className="text-xs text-neutral-400">예상 소요시간 (분)</span>
            <input
              type="number"
              min={0}
              value={item.duration ?? ''}
              onChange={(event) => {
                const raw = event.target.value
                const duration = raw === '' ? null : Number(raw)
                if (item.startTime && duration && duration > 0) {
                  change(
                    placedTimes(
                      { startTime: null, endTime: null, duration },
                      item.startTime,
                    ),
                  )
                  return
                }
                change({ duration })
              }}
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label className="mt-5 block">
            <span className="text-xs text-neutral-400">마감일</span>
            <input
              type="date"
              value={item.dueDate ?? ''}
              onChange={(event) => change({ dueDate: event.target.value || null })}
              className={`${fieldClass} mt-1`}
            />
          </label>
        </>
      ) : null}
      <div className="mt-5">
        <span className="text-xs text-neutral-400">카테고리</span>
        <div className="mt-1">
          <CategoryPicker
            categories={categories}
            value={item.categoryId}
            onChange={(categoryId) => change({ categoryId })}
          />
        </div>
      </div>
      <div className="mt-5">
        <PriorityField value={item.priority} onChange={(priority) => change({ priority })} />
      </div>
      <div className="mt-5">
        <RepeatField value={item.repeat} onChange={(repeat) => change({ repeat })} />
      </div>
      <div className="mt-10">
        {confirming ? (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-500">삭제할까요?</span>
            <button
              type="button"
              onClick={() => {
                remove(item.id)
                onClose()
              }}
              className="text-neutral-900"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-neutral-400 hover:text-neutral-800"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm text-neutral-400 hover:text-neutral-800"
          >
            삭제
          </button>
        )}
      </div>
    </SidePanel>
  )
}
