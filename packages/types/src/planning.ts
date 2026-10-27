import type { AnalysisItem, ScheduleAnalysis } from './ai.ts'
import type { Priority } from './schedule.ts'

export const PLAN_TASKS = 'PLAN_TASKS' as const
export type SchedulingSettings = {
  preferredStartTime?: string | null
  preferredEndTime?: string | null
  allowSplit?: boolean
  placementMode?: 'earliest' | 'focus'
  useManualHistory?: boolean
  timezone: string
  startDate: string
  endDate: string
  /** ISO weekdays: 1=Monday ... 7=Sunday. */
  workDays: number[]
  dayStartTime: string
  dayEndTime: string
  maxDailyMinutes: number
  breakMinutes: number
  minBlockMinutes: number
  maxBlockMinutes: number
  defaultDurationMinutes: number
  repeatOnSeparateDays: boolean
  /** Fixed instant: never read the clock inside the deterministic engine. */
  now: string
}
export type PlanningTask = {
  originGroup?: string
  repeatIndex?: number
  excludedDates?: string[]
  notBefore?: string | null
  id: string
  title: string
  sourceItem: AnalysisItem | null
  durationMinutes: number | null
  durationIsEstimate: boolean
  priority: Priority
  priorityIsEstimate: boolean
  deadline: string | null
  deadlineIsEstimate: boolean
  occurrences: number
  dependencies: string[]
  splittable: boolean
  preferredChunkMinutes: number | null
  confirmationNeeded: string[]
}
export type PlanningAnalysis = {
  version: 1
  intent: typeof PLAN_TASKS
  analysis: ScheduleAnalysis
  tasks: {
    sourceTaskId: string
    durationMinutes: number | null
    durationIsEstimate: boolean
    durationEvidence: string | null
    occurrences: number
    occurrencesEvidence: string | null
    priority: Priority
    priorityIsEstimate: boolean
    deadline: string | null
    deadlineIsEstimate: boolean
    deadlineEvidence: string | null
    splittable: boolean
    preferredChunkMinutes: number | null
    notes: string[]
  }[]
}
export type SchedulingResult = {
  version: 1
  intent: typeof PLAN_TASKS
  recommendationOnly: true
  settings: SchedulingSettings
  tasks: {
    task: PlanningTask
    status: 'scheduled' | 'partial' | 'unscheduled'
    requestedMinutes: number
    scheduledMinutes: number
    remainingMinutes: number
    completedOccurrences: number
    reason: string | null
    confirmationNeeded: string[]
  }[]
  blocks: {
    id: string
    sourceTaskId: string
    title: string
    occurrence: number
    part: number
    startAt: string
    endAt: string
    durationMinutes: number
    priority: Priority
    reason: string
    status: 'recommended'
    confirmationNeeded: string[]
  }[]
  warnings: string[]
}
export type PlanTasksRequest = {
  text: string
  /** User-supplied constraints; authenticated saved settings provide defaults. */
  settings?: Partial<Omit<SchedulingSettings, 'now'>>
}
export type PlanningRecommendation = { progress?: { approved: { id:string; title:string }[]; remainingCount:number }; changes?: { scheduleId: string; title: string; beforeStart: string; beforeEnd: string; blockId: string; reason: string }[]; mode?: 'remaining' | 'reschedule'; analysis: PlanningAnalysis; result: SchedulingResult; approval?: { token: string; previewId: string; expiresAt: string } }
export type PlannerEdit = { id: string; title: string; date: string; startTime: string; endTime: string; durationMinutes: number; priority: Priority; included: boolean; confirmed: boolean }
export type PlannerApprovalRequest = { token: string; blocks: PlannerEdit[] }
