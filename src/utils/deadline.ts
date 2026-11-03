export type DeadlineItem = { kind?: string; status?: string; dueDate?: string | null; dueTime?: string | null }
export function deadlineStatus(item: DeadlineItem, now = new Date()): 'overdue' | 'today' | 'soon' | null {
  if (item.kind !== 'task' || item.status === 'done' || !item.dueDate) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (key: string) => parts.find(part => part.type === key)!.value
  const today = `${get('year')}-${get('month')}-${get('day')}`
  if (item.dueDate < today || (item.dueTime && now.valueOf() > Date.parse(`${item.dueDate}T${item.dueTime}:00+09:00`))) return 'overdue'
  if (item.dueDate === today) return 'today'
  const days = (Date.parse(`${item.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  return days <= 3 ? 'soon' : null
}
export function deadlineLabel(item: DeadlineItem): string {
  return item.kind === 'task' && item.dueDate ? `마감 ${item.dueDate}${item.dueTime ? ` ${item.dueTime}` : ''}` : ''
}
