import { useEffect, useState } from 'react'
import { deadlineLabel, deadlineStatus, type DeadlineItem } from '../../utils/deadline.ts'

export function DeadlineBadge({ item }: { item: DeadlineItem }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!item.dueDate || item.status === 'done') return
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [item.dueDate, item.status])
  if (item.kind !== 'task' || !item.dueDate) return null
  const status = deadlineStatus(item, now)
  const label = status === 'overdue' ? '기한 초과' : status === 'today' ? '오늘 마감' : status === 'soon' ? '마감 임박' : ''
  return <span className={`mt-1 block text-xs ${status === 'overdue' ? 'text-red-600' : status ? 'text-amber-700' : 'text-neutral-500'}`}>{deadlineLabel(item)}{label ? ` · ${label}` : ''}</span>
}
