import { Users } from 'lucide-react'
import { useEffect } from 'react'
import { useCalendars } from '../../state/useCalendars.ts'
import type { WorkItem } from '../../types/work.ts'
import { ROLE_LABEL } from './labels.ts'

/** Calendar to save into. Changing it on an existing item moves the item on save. */
export function CalendarField({ value, onChange }: { value: string | undefined; onChange: (calendarId: string) => void }) {
  const { writable, entryOf } = useCalendars()
  const personal = writable.find(entry => entry.isDefaultPersonal) ?? writable[0]
  const current = entryOf(value) ?? personal
  if (!current || writable.length < 2) return null
  return <label className="text-xs text-neutral-500" data-calendar-field>
    캘린더
    <span className="mt-1 flex items-center gap-2">
      <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: current.color }} aria-hidden="true" />
      <select className="field min-w-0 flex-1" value={current.id} onChange={event => onChange(event.target.value)} aria-label="저장할 캘린더">
        {writable.map(entry => <option key={entry.id} value={entry.id}>{entry.type === 'shared' ? `${entry.name} (공유)` : entry.name}</option>)}
      </select>
    </span>
  </label>
}

/** Owning calendar, author and last editor of a shared item, plus who can see it. */
export function CalendarInfo({ item }: { item: Pick<WorkItem, 'calendarId' | 'createdByUserId' | 'updatedByUserId'> }) {
  const { entryOf, members, loadMembers } = useCalendars()
  const entry = entryOf(item.calendarId)
  const shared = entry?.type === 'shared'
  const list = entry ? members(entry.id) : undefined
  useEffect(() => {
    if (shared && entry && !list) void loadMembers(entry.id).catch(() => undefined)
  }, [shared, entry, list, loadMembers])
  if (!entry || !shared) return null
  const name = (id: string | null | undefined) => !list ? '…' : (id && list.find(member => member.userId === id)?.displayName) || (id ? '이전 멤버' : '알 수 없음')
  return <div className="mt-3 rounded-md border border-line px-3 py-2 text-xs text-neutral-500" data-calendar-info={entry.id}>
    <p className="flex items-center gap-2 text-sm text-neutral-800">
      <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} aria-hidden="true" />
      <span className="min-w-0 truncate">{entry.name}</span>
      <span className="calendar-role">{ROLE_LABEL[entry.role]}</span>
    </p>
    <p className="mt-1" data-created-by>만든 사람 {name(item.createdByUserId)} · 마지막 수정 {name(item.updatedByUserId ?? item.createdByUserId)}</p>
    {list ? <p className="mt-1 flex items-center gap-1"><Users aria-hidden="true" className="size-3" /> {list.map(member => `${member.displayName}(${ROLE_LABEL[member.role]})`).join(', ')}</p> : null}
    {entry.role === 'viewer' ? <p className="mt-1 text-amber-700">조회 권한이라 이 일정을 바꿀 수 없어요.</p> : null}
  </div>
}
