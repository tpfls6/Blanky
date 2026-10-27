import type { PlanningAnalysis, PlanTasksRequest, PlanningRecommendation } from './planning.ts'
import { AnalysisError, isCalendarDate, SCHEDULE_ANALYSIS_SCHEMA, validateJsonSchema, validateScheduleAnalysis } from './aiSchema.ts'
const string = { type: 'string', minLength: 1, maxLength: 1000 }
const nullableString = { type: ['string', 'null'], minLength: 1, maxLength: 1000 }
const boolean = { type: 'boolean' }
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const number = { type: 'integer', minimum: 0, maximum: 1000000 }
const optionalSettings = { preferredStartTime: {type:['string','null']}, preferredEndTime: {type:['string','null']}, allowSplit: boolean, placementMode: {type:'string',enum:['earliest','focus']}, useManualHistory: boolean }
const settingsProperties = {
  timezone: string, startDate: string, endDate: string, workDays: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'integer', minimum: 1, maximum: 7 } },
  dayStartTime: string, dayEndTime: string, maxDailyMinutes: number, breakMinutes: number, minBlockMinutes: number, maxBlockMinutes: number, defaultDurationMinutes: number, repeatOnSeparateDays: boolean,
}
export function validatePlanTasksRequest(value: unknown): PlanTasksRequest {
  validateJsonSchema(value, { ...object({ text: { type: 'string', minLength: 1, maxLength: 8000 }, settings: { ...object({...settingsProperties,...optionalSettings}), required: [] } }), required: ['text'] })
  return structuredClone(value as PlanTasksRequest)
}
export const PLANNING_ANALYSIS_SCHEMA = object({
  version: { type: 'integer', enum: [1] }, intent: { type: 'string', enum: ['PLAN_TASKS'] }, analysis: SCHEDULE_ANALYSIS_SCHEMA,
  tasks: { type: 'array', minItems: 1, maxItems: 20, items: object({
    sourceTaskId: string, durationMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 10080 }, durationIsEstimate: boolean, durationEvidence: nullableString,
    occurrences: { type: 'integer', minimum: 1, maximum: 30 }, occurrencesEvidence: nullableString,
    priority: { type: 'string', enum: ['low', 'medium', 'high'] }, priorityIsEstimate: boolean,
    deadline: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, deadlineIsEstimate: boolean, deadlineEvidence: nullableString,
    splittable: boolean, preferredChunkMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 1440 }, notes: { type: 'array', maxItems: 20, items: string },
  }) },
})
export function validatePlanningAnalysis(value: unknown, text?: string, categoryIds?: string[], maxItems=20): PlanningAnalysis {
  validateJsonSchema(value,planningAnalysisSchema(maxItems))
  const result = value as PlanningAnalysis
  validateScheduleAnalysis(result.analysis, { text, categoryIds, aiOnly: true, placementPending: true, maxItems })
  const fail = () => { throw new AnalysisError('AI_RESPONSE_INVALID', '계획 작업 분석이 올바르지 않아 추천을 중단했어요.') }
  if (new Set(result.tasks.map(task => task.sourceTaskId)).size !== result.tasks.length || result.tasks.length !== result.analysis.items.length) fail()
  for (const task of result.tasks) {
    const source = result.analysis.items.find(item => item.id === task.sourceTaskId)
    if (!source || source.draft.date || source.draft.startTime || source.draft.endTime || source.draft.endDate) fail() // AI cannot propose placements
    if (task.deadline && !isCalendarDate(task.deadline)) fail()
    for (const evidence of [task.durationEvidence, task.deadlineEvidence, task.occurrencesEvidence]) if (evidence && text && !text.includes(evidence)) fail()
    if (task.durationMinutes !== null && !task.durationIsEstimate && (!task.durationEvidence || !/\d+\s*(?:시간|분|hours?|minutes?)|한\s*시간/i.test(task.durationEvidence))) fail()
    if (task.deadline && !task.deadlineIsEstimate && !task.deadlineEvidence) fail()
    if (task.occurrences > 1 && (!task.occurrencesEvidence || !/\d+\s*(?:번|회)|매일|매주/.test(task.occurrencesEvidence))) fail()
    if (source?.draft.dueDate && source.draft.dueDate !== task.deadline) fail()
    if (task.durationMinutes !== null && !task.durationIsEstimate && task.durationEvidence) {
      const hours = /(\d+(?:\.\d+)?)\s*시간(?:\s*(\d+)\s*분)?/.exec(task.durationEvidence)
      const minutes = /(\d+)\s*분/.exec(task.durationEvidence)
      const explicit = hours ? Number(hours[1]) * 60 + Number(hours[2] ?? 0) : /한\s*시간/.test(task.durationEvidence) ? 60 : minutes ? Number(minutes[1]) : null
      if (explicit !== null && explicit !== task.durationMinutes) fail()
    }
    const count = task.occurrencesEvidence && /(\d+)\s*(?:번|회)/.exec(task.occurrencesEvidence)
    if (count && Number(count[1]) !== task.occurrences) fail()
    if (task.deadline && !task.deadlineIsEstimate && !/오늘|내일|모레|요일|이번\s*주|다음\s*주|\d+\s*(?:월|일)|\d{4}-\d{2}-\d{2}/.test(task.deadlineEvidence!)) fail()
  }
  return structuredClone(result)
}

function planningAnalysisSchema(maxItems:number){
 return {...PLANNING_ANALYSIS_SCHEMA,properties:{...PLANNING_ANALYSIS_SCHEMA.properties,tasks:{...(PLANNING_ANALYSIS_SCHEMA.properties.tasks as Record<string,unknown>),maxItems},analysis:{...SCHEDULE_ANALYSIS_SCHEMA,properties:{...SCHEDULE_ANALYSIS_SCHEMA.properties,items:{...(SCHEDULE_ANALYSIS_SCHEMA.properties.items as Record<string,unknown>),maxItems}}}}}
}
const sourceItemSchema = (SCHEDULE_ANALYSIS_SCHEMA.properties.items as { items: Record<string, unknown> }).items
const taskSchema = {...object({ originGroup:string, repeatIndex:number, excludedDates:{type:'array',items:string}, notBefore:nullableString, id: string, title: string, sourceItem: { ...sourceItemSchema, type: ['object', 'null'] }, durationMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 10080 }, durationIsEstimate: boolean,
  priority: { type: 'string', enum: ['low', 'medium', 'high'] }, priorityIsEstimate: boolean, deadline: nullableString, deadlineIsEstimate: boolean,
  occurrences: { type: 'integer', minimum: 1, maximum: 30 }, dependencies: { type: 'array', items: string }, splittable: boolean,
  preferredChunkMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 1440 }, confirmationNeeded: { type: 'array', items: string } }), required:['id','title','sourceItem','durationMinutes','durationIsEstimate','priority','priorityIsEstimate','deadline','deadlineIsEstimate','occurrences','dependencies','splittable','preferredChunkMinutes','confirmationNeeded']}
export const SCHEDULING_RESULT_SCHEMA = object({ version: { type: 'integer', enum: [1] }, intent: { type: 'string', enum: ['PLAN_TASKS'] }, recommendationOnly: { type: 'boolean', enum: [true] }, settings: {...object({ ...settingsProperties, ...optionalSettings, now: string }), required:[...Object.keys(settingsProperties),'now']},
  tasks: { type: 'array', maxItems: 200, items: object({ task: taskSchema, status: { type: 'string', enum: ['scheduled', 'partial', 'unscheduled'] }, requestedMinutes: number, scheduledMinutes: number, remainingMinutes: number, completedOccurrences: number, reason: nullableString, confirmationNeeded: { type: 'array', items: string } }) },
  blocks: { type: 'array', maxItems: 5000, items: object({ id: string, sourceTaskId: string, title: string, occurrence: number, part: number, startAt: string, endAt: string, durationMinutes: number, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, reason: string, status: { type: 'string', enum: ['recommended'] }, confirmationNeeded: { type: 'array', items: string } }) }, warnings: { type: 'array', items: string },
})
export function validatePlanningRecommendation(value: unknown, text?: string): PlanningRecommendation {
  const maxItems=value&&typeof value==='object'&&'mode' in value&&['remaining','reschedule'].includes(String(value.mode))?200:20
  validateJsonSchema(value, { ...object({ analysis: planningAnalysisSchema(maxItems), result: SCHEDULING_RESULT_SCHEMA, progress:object({approved:{type:'array',maxItems:5000,items:object({id:string,title:string})},remainingCount:number}), mode:{type:'string',enum:['remaining','reschedule']}, changes:{type:'array',maxItems:200,items:object({scheduleId:string,title:string,beforeStart:string,beforeEnd:string,blockId:string,reason:string})}, approval: object({ token: { type: 'string', minLength: 1, maxLength: 1000000 }, previewId: string, expiresAt: string }) }), required: ['analysis', 'result'] })
  const result = value as PlanningRecommendation
  validatePlanningAnalysis(result.analysis, text, undefined, maxItems)
  const ids = new Set(result.result.tasks.map(outcome => outcome.task.id))
  if (ids.size !== result.result.tasks.length || result.analysis.tasks.some(task => !ids.has(task.sourceTaskId))) throw new AnalysisError()
  for (const block of result.result.blocks) {
    if (!ids.has(block.sourceTaskId) || !/[+-]\d{2}:\d{2}$|Z$/.test(block.startAt) || !/[+-]\d{2}:\d{2}$|Z$/.test(block.endAt) || !Number.isFinite(Date.parse(block.startAt)) || (Date.parse(block.endAt) - Date.parse(block.startAt)) / 60000 !== block.durationMinutes || block.durationMinutes < 1) throw new AnalysisError()
  }
  for (const outcome of result.result.tasks) {
    const minutes = result.result.blocks.filter(block => block.sourceTaskId === outcome.task.id).reduce((sum, block) => sum + block.durationMinutes, 0)
    if (minutes !== outcome.scheduledMinutes || outcome.requestedMinutes !== outcome.scheduledMinutes + outcome.remainingMinutes) throw new AnalysisError()
  }
  return structuredClone(result)
}
