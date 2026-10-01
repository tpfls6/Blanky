import type { Priority } from '@blanky/types'

export type WorkKind = 'event' | 'task'

export type WorkStatus = 'todo' | 'done'

export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly'

/** UI category. Parent rows have parentId null. Maps to Category later. */
export type WorkspaceCategory = {
  id: string
  name: string
  parentId: string | null
}

export type WorkItem = {
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
  dueDate: string | null
  endDate: string | null
  allDay: boolean
  repeat: RepeatRule
}

export type WorkInput = {
  kind: WorkKind
  title: string
  description?: string
  date: string
  startTime?: string | null
  endTime?: string | null
  duration?: number | null
  dueDate?: string | null
  endDate?: string | null
  allDay?: boolean
  categoryId?: string | null
  priority?: Priority
  status?: WorkStatus
  repeat?: RepeatRule
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
    | 'dueDate'
    | 'endDate'
    | 'allDay'
    | 'repeat'
  >
>
