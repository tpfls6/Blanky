import type { ScheduleAnalysis, TemporalField } from './ai.ts'

const string = { type: 'string', minLength: 1, maxLength: 1000 } as const
const nullable = { type: ['string', 'null'], minLength: 1, maxLength: 1000 } as const
const temporal = ['date', 'startTime', 'endTime', 'dueDate', 'endDate'] as const
const object = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
})
/** Shared provider JSON Schema checked again at both server and API boundaries. */
export const SCHEDULE_ANALYSIS_SCHEMA = object({
  version: { type: 'integer', enum: [1] },
  route: { type: 'string', enum: ['parser', 'ai'] },
  items: { type: 'array', minItems: 1, maxItems: 20, items: object({
    id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' },
    type: { type: 'string', enum: ['event', 'task'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    source: { type: 'string', enum: ['rule', 'personal_rule', 'ai'] },
    draft: object({ title: string, ...Object.fromEntries(temporal.map(key => [key, {
      type: ['string', 'null'], pattern: key.endsWith('Time') ? '^([01]\\d|2[0-3]):[0-5]\\d$' : '^\\d{4}-\\d{2}-\\d{2}$',
    }])), categoryId: nullable }),
    evidence: object(Object.fromEntries(temporal.map(key => [key, nullable]))),
    categoryReason: nullable,
    uncertainties: { type: 'array', maxItems: 20, items: object({
      field: { type: 'string', enum: [...temporal, 'title', 'type', 'categoryId'] }, reason: string,
    }) },
  }) },
  relations: { type: 'array', maxItems: 100, items: object({
    fromId: string, toId: string, type: { type: 'string', enum: ['before', 'depends_on'] }, reason: string,
  }) },
  warnings: { type: 'array', maxItems: 20, items: string },
})

export class AnalysisError extends Error {
  readonly code: string
  constructor(code = 'AI_RESPONSE_INVALID', message = 'AI 분석 결과가 올바르지 않아 저장하지 않았어요. 다시 입력해 주세요.') {
    super(message)
    this.name = 'AnalysisError'
    this.code = code
  }
}

type Schema = { type?: string | readonly string[]; enum?: readonly unknown[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; minItems?: number; maxItems?: number; minLength?: number; maxLength?: number; pattern?: string; minimum?: number; maximum?: number }
function invalid(): never { throw new AnalysisError() }
export function validateJsonSchema(value: unknown, schema: unknown): void { check(value, schema as Schema) }
function check(value: unknown, schema: Schema): void {
  const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  if (!types.some(type => type === kind || (type === 'integer' && Number.isInteger(value)))) invalid()
  if (schema.enum && !schema.enum.includes(value)) invalid()
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) invalid()
  if (typeof value === 'string' && (!value.trim() || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) invalid()
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) invalid()
    value.forEach(item => check(item, schema.items!))
  } else if (kind === 'object') {
    const row = value as Record<string, unknown>
    if (schema.required?.some(key => !Object.hasOwn(row, key))) invalid()
    for (const key of Object.keys(row)) {
      const child = schema.properties?.[key]
      if (!child && schema.additionalProperties === false) invalid()
      if (child) check(row[key], child)
    }
  }
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function validateScheduleAnalysis(value: unknown, options: { text?: string; categoryIds?: string[]; aiOnly?: boolean; placementPending?: boolean; maxItems?: number } = {}): ScheduleAnalysis {
  check(value,{...SCHEDULE_ANALYSIS_SCHEMA,properties:{...SCHEDULE_ANALYSIS_SCHEMA.properties,items:{...(SCHEDULE_ANALYSIS_SCHEMA.properties.items as Record<string,unknown>),maxItems:options.maxItems??20}}} as Schema)
  const result = value as ScheduleAnalysis
  const ids = new Set(result.items.map(item => item.id))
  if (ids.size !== result.items.length || (options.aiOnly && result.route !== 'ai')) invalid()
  for (const item of result.items) {
    if ((options.aiOnly && item.source !== 'ai') || (result.route === 'ai') !== (item.source === 'ai')) invalid()
    if (item.draft.categoryId && options.categoryIds && !options.categoryIds.includes(item.draft.categoryId)) invalid()
    for (const key of temporal) {
      const field = item.draft[key]
      const evidence = item.evidence[key]
      if (field && !key.endsWith('Time') && !isCalendarDate(field)) invalid()
      if (field && !evidence) invalid()
      if (!field && evidence) invalid()
      if (evidence && options.text && !options.text.includes(evidence)) invalid()
      if (field && evidence) {
        const cue = key.endsWith('Time') ? /\d{1,2}\s*(?:시|:)|정오|자정|오전|오후|저녁|밤|\d+\s*(?:시간|분)/ : /오늘|내일|모레|주말|요일|이번\s*주|다음\s*주|\d+\s*(?:월|일)|\d{4}-\d{2}-\d{2}/
        const abbreviatedWeekday = !key.endsWith('Time') && /^[월화수목금토일]$/.test(evidence) && !!options.text && new RegExp(`(?:^|[\\s,，/])${evidence}(?=[/\\s,，]|$)`).test(options.text)
        if (!cue.test(evidence) && !abbreviatedWeekday) invalid()
      }
    }
    if (item.type === 'event' && item.draft.dueDate) invalid()
    if (item.type === 'task' && item.draft.endDate) invalid()
    if (item.draft.endTime && !item.draft.startTime) invalid()
    if (item.draft.endDate && (!item.draft.date || item.draft.endDate < item.draft.date)) invalid()
    if (item.draft.startTime && item.draft.endTime && item.draft.endTime <= item.draft.startTime && (!item.draft.endDate || item.draft.endDate === item.draft.date)) invalid()
    const unknown = (key: TemporalField) => item.uncertainties.some(entry => entry.field === key)
    if (!options.placementPending && !item.draft.date && !unknown('date')) invalid()
    if (!options.placementPending && item.type === 'event' && !item.draft.startTime && !unknown('startTime')) invalid()
  }
  const edges = new Map<string, string[]>()
  const relations = new Set<string>()
  for (const relation of result.relations) {
    if (!ids.has(relation.fromId) || !ids.has(relation.toId) || relation.fromId === relation.toId) invalid()
    const key = `${relation.fromId}:${relation.toId}:${relation.type}`
    if (relations.has(key)) invalid()
    relations.add(key)
    const from = relation.type === 'before' ? relation.fromId : relation.toId
    const to = relation.type === 'before' ? relation.toId : relation.fromId
    edges.set(from, [...(edges.get(from) ?? []), to])
  }
  const visited = new Set<string>()
  const visit = (id: string, path: Set<string>) => {
    if (path.has(id)) invalid()
    if (visited.has(id)) return
    for (const next of edges.get(id) ?? []) visit(next, new Set([...path, id]))
    visited.add(id)
  }
  ids.forEach(id => visit(id, new Set()))
  return structuredClone(result)
}
