/** Input routing only; Planner execution belongs to a later phase. */
export type InputRoute =
  | { route: 'parser'; reason: 'simple_schedule' }
  | { route: 'ai'; reason: 'complex_sentence' | 'low_confidence' }
  | { route: 'planner'; intent: 'PLAN_TASKS'; reason: 'planning_request' }
  | { route: 'reschedule'; intent: 'RESCHEDULE'; reason: 'rescheduling_request' }

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
export type TemporalField = 'date' | 'startTime' | 'endTime' | 'dueDate' | 'endDate'
export type AnalysisItem = ParsedSchedule & {
  id: string
  evidence: Record<TemporalField, string | null>
  categoryReason: string | null
  uncertainties: { field: TemporalField | 'title' | 'type' | 'categoryId'; reason: string }[]
}
export type ScheduleAnalysis = {
  version: 1
  route: 'parser' | 'ai'
  items: AnalysisItem[]
  relations: { fromId: string; toId: string; type: 'before' | 'depends_on'; reason: string }[]
  warnings: string[]
}
