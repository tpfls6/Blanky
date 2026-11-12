import type { WorkItem } from '../types/work.ts'
import { shiftISO } from './date.ts'
import type { ScheduleDraft } from './scheduleDraft.ts'
import { createWorkItem } from './work.ts'

/** Calendar marks and the edit form's draft round trip, shared by the schedule page and home. */
export function eventDates(items: WorkItem[]): Set<string> {
  const dates = new Set<string>()
  for (const item of items) {
    if (item.kind !== 'event') continue
    if (item.repeat && item.repeat !== 'none') continue // Calendar computes actual recurring occurrences per cell.
    let date = item.date
    const end = item.endDate && item.endDate >= item.date ? item.endDate : item.date
    dates.add(date)
    while (date < end) {
      date = shiftISO(date, 1)
      dates.add(date)
    }
  }
  return dates
}

export function taskDates(items: WorkItem[]): Set<string> {
  const dates = new Set<string>()
  for (const item of items) {
    if (item.kind !== 'task') continue
    if ((!item.repeat || item.repeat === 'none') && !item.undated) dates.add(item.date)
    if (item.dueDate) dates.add(item.dueDate)
  }
  return dates
}

export function draftFromItem(item: WorkItem): ScheduleDraft {
  return {
    priority: item.priority,
    id: item.id,
    ...(item.calendarId ? { calendarId: item.calendarId } : {}),
    kind: item.kind,
    title: item.title,
    date: item.undated ? '' : item.date,
    ...(item.undated ? { undatedDay: item.date } : {}),
    endDate: item.endDate ?? '',
    startTime: item.startTime ?? '',
    endTime: item.endTime ?? '',
    duration: item.duration ? String(item.duration) : '',
    dueDate: item.dueDate ?? '',
    dueTime: item.dueTime ?? '',
    categoryId: item.categoryId,
    description: item.description,
    status: item.status,
    repeat: item.repeat,
    repeatDays: item.repeatDays,
    repeatInterval: item.repeatInterval ?? 1,
    repeatUntil: item.repeatUntil ?? '',
  }
}

export function saveDraft(draft: ScheduleDraft): Omit<WorkItem, 'id'> | null {
  const created = createWorkItem({
    ...(draft.calendarId ? { calendarId: draft.calendarId } : {}),
    priority: draft.priority ?? 'medium',
    kind: draft.kind,
    title: draft.title,
    description: draft.description,
    date: draft.date || (draft.kind === 'task' ? draft.undatedDay ?? '' : ''),
    endDate: draft.kind === 'event' ? draft.endDate || null : null,
    startTime: draft.startTime || null,
    endTime: draft.endTime || null,
    duration: Number(draft.duration) || null,
    dueDate: draft.kind === 'task' ? draft.dueDate || null : null,
    dueTime: draft.kind === 'task' && draft.dueDate ? draft.dueTime || null : null,
    categoryId: draft.categoryId,
    allDay: draft.kind === 'event' && !draft.startTime,
    status: draft.kind === 'task' ? draft.status : 'todo',
    repeat: draft.repeat ?? 'none',
    repeatDays: draft.repeatDays,
    ...(draft.repeatInterval !== undefined ? { repeatInterval: draft.repeatInterval } : {}),
    ...(draft.repeatUntil !== undefined ? { repeatUntil: draft.repeatUntil || null } : {}),
    // An empty date on a task saves it undated; a date typed in clears an item that was undated.
    ...(draft.undatedDay !== undefined || (draft.kind === 'task' && !draft.date) ? { undated: !draft.date } : {}),
  })
  if (!created) return null
  return {priority:created.priority,kind:created.kind,title:created.title,description:created.description,date:created.date,startTime:created.startTime,endTime:created.endTime,duration:created.duration,categoryId:created.categoryId,status:created.status,dueDate:created.dueDate,dueTime:created.dueTime,endDate:created.endDate,allDay:created.allDay,...(created.calendarId ? {calendarId:created.calendarId} : {}),createdByUserId:created.createdByUserId,repeat:created.repeat,repeatDays:created.repeatDays,...(created.repeatInterval !== undefined ? {repeatInterval:created.repeatInterval} : {}),...(created.repeatUntil !== undefined ? {repeatUntil:created.repeatUntil} : {}),...(created.undated !== undefined ? {undated:created.undated} : {})}
}
