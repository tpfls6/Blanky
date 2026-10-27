import type { ScheduleKind } from '../../types/src/ai.ts'
export type { ScheduleKind, ParseSource, ScheduleDraftFields, ParsedSchedule } from '../../types/src/ai.ts'

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
