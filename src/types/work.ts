import type { Priority } from '@blanky/types'

export type WorkKind = 'event' | 'task'

export type WorkStatus = 'todo' | 'done'

export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly'

/** area = top folder, project = a named project, topic = a subcategory. */
export type CategoryKind = 'area' | 'project' | 'topic'

/** UI category. Parent rows have parentId null. Color and icon are record labels, not the app accent. */
export type WorkspaceCategory = {
  id: string
  name: string
  parentId: string | null
  color?: string | null
  icon?: string | null
  kind?: CategoryKind
}

export type WorkItem = {
  /** Optional only for legacy browser data; normalized when the library loads. */
  calendarId?: string
  createdByUserId?: string
  id: string
  kind: WorkKind
  title: string
  description: string
  date: string
  startTime: string | null
  endTime: string | null
  duration: number | null
  categoryId: string | null
  priority: Priority
  status: WorkStatus
  dueTime?: string | null
  dueDate: string | null
  endDate: string | null
  allDay: boolean
  repeat: RepeatRule
  repeatDays?: number[]
  /** Every N days/weeks/months, counted from `date`. Absent means 1. */
  repeatInterval?: number
  /** Last day the series may occur on. Absent or null repeats forever. */
  repeatUntil?: string | null
  /** Original row of the series this row was split from; absent for unsplit rows. */
  seriesId?: string | null
  /** Task kept off the calendar: `date` is only the day it was saved. */
  undated?: boolean
  changeSource?: 'manual' | 'ai_chat' | 'calendar_sync'
  calendarType?: 'personal' | 'shared' | 'external'
  /** Last person who changed a server row; shown on shared schedules. */
  updatedByUserId?: string | null
  /** Display only: color of the shared calendar the item belongs to. Never saved. */
  calendarColor?: string
}

export type WorkInput = {
  /** Target calendar; omitted saves to the personal calendar. */
  calendarId?: string
  kind: WorkKind
  title: string
  description?: string
  date: string
  startTime?: string | null
  endTime?: string | null
  duration?: number | null
  dueTime?: string | null
  dueDate?: string | null
  endDate?: string | null
  allDay?: boolean
  categoryId?: string | null
  priority?: Priority
  status?: WorkStatus
  repeat?: RepeatRule
  repeatDays?: number[]
  repeatInterval?: number
  repeatUntil?: string | null
  undated?: boolean
}

export type WorkPatch = Partial<
  Pick<
    WorkItem,
    | 'title'
    | 'description'
    | 'date'
    | 'startTime'
    | 'endTime'
    | 'duration'
    | 'categoryId'
    | 'priority'
    | 'status'
    | 'kind'
    | 'dueTime'
    | 'dueDate'
    | 'endDate'
    | 'allDay'
    | 'repeat'
    | 'repeatDays'
    | 'repeatInterval'
    | 'repeatUntil'
    | 'calendarId'
  >
>
