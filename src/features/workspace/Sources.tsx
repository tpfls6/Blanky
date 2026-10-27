import { Link } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import type { BlankySource } from './model.ts'

const LABEL: Record<BlankySource, string> = {
  schedule: '일정',
  todo: '할 일',
  diary: '일기',
  memo: '메모',
  reading: '독서 기록',
  activity: '활동 기록',
}

const TO: Record<BlankySource, string> = {
  schedule: ROUTES.schedule,
  todo: ROUTES.schedule,
  diary: ROUTES.diary,
  memo: ROUTES.memo,
  reading: ROUTES.reading,
  activity: ROUTES.activity,
}

export function sourceLabel(source: BlankySource): string {
  return LABEL[source]
}

export function BlankySourceView({ source }: { source: BlankySource }) {
  const { items, diaries, memos, books, activities } = useLibrary()
  const rows =
    source === 'schedule'
      ? items.filter((item) => item.kind === 'event').slice(0, 6).map((item) => ({ id: item.id, title: item.title, meta: item.date }))
      : source === 'todo'
        ? items.filter((item) => item.kind === 'task').slice(0, 6).map((item) => ({ id: item.id, title: item.title, meta: item.status === 'done' ? '완료' : '미완료' }))
        : source === 'diary'
          ? diaries.slice(0, 6).map((item) => ({ id: item.id, title: item.title || item.body.slice(0, 40), meta: item.date }))
          : source === 'memo'
            ? memos.slice(0, 6).map((item) => ({ id: item.id, title: item.title, meta: item.updatedAt.slice(0, 10) }))
            : source === 'reading'
              ? books.slice(0, 6).map((item) => ({ id: item.id, title: item.title, meta: item.author }))
              : (activities ?? []).slice(0, 6).map((item) => ({ id: item.id, title: item.after?.title || item.before?.title || item.action, meta: item.createdAt.slice(0, 10) }))

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{LABEL[source]}</p>
        <Link to={TO[source]} className="text-xs text-neutral-400">원본 열기</Link>
      </div>
      {rows.length === 0 ? <p className="text-sm text-neutral-400">연결된 기록이 없습니다.</p> : null}
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{row.title || '제목 없음'}</span>
            <span className="shrink-0 text-xs text-neutral-400">{row.meta}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
