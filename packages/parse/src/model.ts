export type ScheduleKind = 'event' | 'task'

export type ParseSource = 'rule' | 'personal_rule' | 'ai'

export type ScheduleDraftFields = {
  title: string
  date: string | null
  startTime: string | null
  endTime: string | null
  dueDate: string | null
  endDate: string | null
  categoryId: string | null
}

export type ParsedSchedule = {
  type: ScheduleKind
  confidence: number
  source: ParseSource
  draft: ScheduleDraftFields
  fields?: Record<string, string | number> | null
}

export type CategoryRef = {
  id: string
  name: string
  parentId: string | null
}

export type LearnedRule = {
  pattern: string
  targetType: ScheduleKind | null
  categoryId: string | null
  weight: number
}

export type RecordFieldHint = {
  fieldKey?: string
  label?: string
  type?: string
  children?: RecordFieldHint[]
}

export type RecordSchema = {
  blocks?: RecordFieldHint[]
}

export type ParseContext = {
  today: Date
  fallbackDate?: string
  categories?: CategoryRef[]
  rules?: LearnedRule[]
  recordSchema?: RecordSchema | null
}
