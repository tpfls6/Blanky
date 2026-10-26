export type Priority = 'low' | 'medium' | 'high'

export type ScheduleStatus = 'todo' | 'in_progress' | 'done'

/** Alias of ScheduleStatus so earlier web imports keep compiling. */
export type Status = ScheduleStatus

/** Result stored after natural language is parsed on the server. */
export type ScheduleAiMetadata = {
  sourceText: string
  confidence: number | null
  model: string | null
  parsedAt: string | null
}

export type ScheduleChangeAction = 'created' | 'updated' | 'completed' | 'deleted'

/**
 * One saved schedule. Field names stay stable for web and mobile.
 * Times are local clock values (HH:mm). Dates are YYYY-MM-DD.
 */
export type Schedule = {
  kind?: 'event' | 'task'
  dueDate?: string | null
  endDate?: string | null
  allDay?: boolean
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly'
  changeSource?: 'manual' | 'ai_chat' | 'calendar_sync'

  id: string
  userId: string
  calendarId: string
  createdByUserId: string | null
  title: string
  description: string
  date: string
  startTime: string | null
  endTime: string | null
  /** Expected length in minutes. */
  duration: number | null
  categoryId: string | null
  priority: Priority
  status: ScheduleStatus
  sourceText: string | null
  /** When a reminder or push should fire. ISO 8601. */
  reminderAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  ai: ScheduleAiMetadata | null
}

/** Partial schedule returned by the AI parser before it is saved. */
export type ScheduleDraft = {
  kind?: 'event' | 'task'
  dueDate?: string | null
  endDate?: string | null
  allDay?: boolean
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly'
  changeSource?: 'manual' | 'ai_chat' | 'calendar_sync'

  calendarId?: string
  title: string
  description?: string
  date?: string
  startTime?: string | null
  endTime?: string | null
  duration?: number | null
  categoryId?: string | null
  priority?: Priority
  status?: ScheduleStatus
  sourceText?: string | null
  reminderAt?: string | null
  ai?: ScheduleAiMetadata | null
}

export type ScheduleChange = {
  entityType: 'event' | 'task'
  beforeData: Schedule | null
  afterData: Schedule | null
  source: 'manual' | 'ai_chat'
  id: string
  scheduleId: string
  userId: string
  action: ScheduleChangeAction
  createdAt: string
}

export type NaturalLanguageScheduleRequest = {
  text: string
  timezone: string
}
