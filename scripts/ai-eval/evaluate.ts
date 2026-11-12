/**
 * Offline evaluation of the natural-language pipeline. No network, no paid API: every LLM step is
 * replaced by a recording stub, so the report says which messages the rules handle on their own and
 * which ones would be delegated to the LLM (and to which endpoint).
 *
 * The pipeline mirrors the Home input flow: routeUtterance (records, mixed records + schedule, planner) →
 * extractIntents (intents-v1 when a clause is unread) → resolveScheduleAnalysis (analysis-v1 when the router asks for AI).
 * conversationIntent (list/dedupe commands against saved items) is not simulated.
 */
import { routeUtterance } from '../../src/features/ai/routeUtterance.ts'
import { parseReading } from '../../src/utils/readingParse.ts'
import { routeInput, PlannerRequiredError } from '../../packages/parse/src/intentRouter.ts'
import { extractIntents, needsIntentAI, needsIntentPlan } from '../../packages/parse/src/intents.ts'
import { resolveScheduleAnalysis } from '../../packages/parse/src/resolve.ts'
import type { AnalysisProvider } from '../../packages/parse/src/analysisProvider.ts'
import type { ScheduleAnalysis } from '../../packages/types/src/ai.ts'

export type EvalExpect = {
  /** 'mixed': records saved and a schedule part left for the pipeline. */
  capture?: 'conversation' | 'memo' | 'diary' | 'reading' | 'mixed'
  /** Record types saved from the message (mixed or whole). */
  records?: string[]
  /** Fields read from the reading record (the reading part of a mixed message). */
  reading?: { title?: string; page?: number | null; total?: number | null; startPage?: number | null; author?: string | null; finished?: boolean }
  route?: 'parser' | 'ai' | 'planner' | 'reschedule'
  /** Sorted intent kinds the rule extractor should read. */
  kinds?: string[]
  items?: number
  types?: string[]
  date?: string | null
  startTime?: string | null
  endTime?: string | null
  dueDate?: string | null
  dueTime?: string | null
}
export type EvalCase = { id: string; text: string; today?: string; tags?: string[]; expect?: EvalExpect }

export type LLMStep = 'intents' | 'analysis' | 'planning'
export type CaseResult = {
  id: string
  tags: string[]
  stage: 'record' | 'planner' | 'reschedule' | 'intent-plan' | 'analysis' | 'error'
  /** LLM endpoints the message would reach without the dedupe (pre-P0 behaviour). */
  llmBefore: LLMStep[]
  /** LLM endpoints with the one-call-per-message rule (intents used → analysis runs on rules only). */
  llmAfter: LLMStep[]
  ruleOnly: boolean
  checked: number
  failures: string[]
  ruleMs: number
}

class Delegated extends Error {}

const stub: AnalysisProvider = { analyze: async () => { throw new Delegated('llm') } }

function day(value: string | undefined): Date {
  const [y, m, d] = (value ?? '2026-11-09').split('-').map(Number)
  return new Date(y, m - 1, d)
}

function compare(failures: string[], field: string, expected: unknown, actual: unknown): number {
  if (expected === undefined) return 0
  const same = JSON.stringify(expected) === JSON.stringify(actual)
  if (!same) failures.push(`${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  return 1
}

function checkReading(failures: string[], expect: NonNullable<EvalExpect['reading']>, text: string | undefined): number {
  const read = text ? parseReading(text) : null
  let checked = 0
  for (const field of ['title', 'page', 'total', 'startPage', 'author', 'finished'] as const) checked += compare(failures, `reading.${field}`, expect[field], read ? read[field] : undefined)
  return checked
}

function checkAnalysis(failures: string[], expect: EvalExpect, analysis: ScheduleAnalysis): number {
  const first = analysis.items[0]?.draft
  let checked = 0
  checked += compare(failures, 'items', expect.items, analysis.items.length)
  checked += compare(failures, 'types', expect.types, analysis.items.map(item => item.type))
  for (const field of ['date', 'startTime', 'endTime', 'dueDate', 'dueTime'] as const) {
    checked += compare(failures, field, expect[field], first ? first[field] ?? null : undefined)
  }
  return checked
}

export async function evaluateCase(entry: EvalCase): Promise<CaseResult> {
  const today = day(entry.today)
  const expect = entry.expect ?? {}
  const failures: string[] = []
  let checked = 0
  const started = performance.now()
  const result = (stage: CaseResult['stage'], llmBefore: LLMStep[], llmAfter: LLMStep[]): CaseResult => ({
    id: entry.id, tags: entry.tags ?? [], stage, llmBefore, llmAfter, ruleOnly: llmAfter.length === 0,
    checked, failures, ruleMs: Number((performance.now() - started).toFixed(3)),
  })
  try {
    const routed = routeUtterance(entry.text, { today })
    const records = routed.kind === 'record' ? [{ type: routed.type, text: routed.original }] : routed.kind === 'mixed' ? routed.records : []
    checked += compare(failures, 'capture', expect.capture, routed.kind === 'record' ? routed.type : routed.kind === 'mixed' ? 'mixed' : 'conversation')
    checked += compare(failures, 'records', expect.records, records.map(record => record.type))
    if (expect.reading) checked += checkReading(failures, expect.reading, records.find(record => record.type === 'reading')?.text)
    if (routed.kind === 'record') return result('record', [], [])

    const route = routed.kind === 'planner' || routed.kind === 'reschedule' ? routed.kind : routeInput(routed.text).route
    checked += compare(failures, 'route', expect.route, route)
    if (route === 'planner') return result('planner', ['planning'], ['planning'])
    if (route === 'reschedule') return result('reschedule', [], [])

    const text = routed.text
    const extraction = extractIntents(text, today)
    if (expect.kinds) checked += compare(failures, 'kinds', [...expect.kinds].sort(), extraction.intents.map(intent => intent.kind).sort())
    const intentAI = needsIntentAI(extraction)
    // The AI may turn an unread clause into a plan; offline we only know the rule outcome.
    if (needsIntentPlan(extraction)) return result('intent-plan', intentAI ? ['intents'] : [], intentAI ? ['intents'] : [])

    let delegated = false
    try {
      const analysis = await resolveScheduleAnalysis(text, { today }, { provider: stub })
      checked += checkAnalysis(failures, expect, analysis)
    } catch (error) {
      if (error instanceof PlannerRequiredError) return result('planner', ['planning'], ['planning'])
      if (!(error instanceof Delegated)) throw error
      delegated = true
    }
    const before: LLMStep[] = [...(intentAI ? ['intents' as const] : []), ...(delegated ? ['analysis' as const] : [])]
    // After P0: with intents already asked, analysis goes rules-only and falls back to the intent plan.
    const after: LLMStep[] = intentAI ? ['intents'] : delegated ? ['analysis'] : []
    return result('analysis', before, after)
  } catch (error) {
    failures.push(`error: ${error instanceof Error ? `${error.name} ${(error as { code?: string }).code ?? ''} ${error.message}`.trim() : String(error)}`)
    return result('error', [], [])
  }
}

export type EvalReport = {
  cases: number
  ruleOnlyRate: number
  llmRate: number
  llmByStep: Record<LLMStep, number>
  llmCallsPer100: { before: number; after: number }
  labeled: { cases: number; passed: number; passRate: number; ruleOnlyCases: number; ruleOnlyPassed: number; ruleOnlyPassRate: number | null }
  byTag: Record<string, { cases: number; ruleOnly: number; passed: number }>
  ruleLatencyMs: { p50: number; p95: number }
  failures: { id: string; failures: string[] }[]
  delegated: { id: string; steps: LLMStep[] }[]
}

const ratio = (part: number, whole: number) => whole ? Number((part / whole).toFixed(4)) : 0
function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

export function summarize(results: CaseResult[]): EvalReport {
  const labeled = results.filter(row => row.checked > 0)
  const passed = labeled.filter(row => !row.failures.length)
  const ruleOnlyLabeled = labeled.filter(row => row.ruleOnly)
  const llmByStep: Record<LLMStep, number> = { intents: 0, analysis: 0, planning: 0 }
  for (const row of results) for (const step of row.llmAfter) llmByStep[step] += 1
  const byTag: EvalReport['byTag'] = {}
  for (const row of results) for (const tag of row.tags.length ? row.tags : ['untagged']) {
    const bucket = byTag[tag] ??= { cases: 0, ruleOnly: 0, passed: 0 }
    bucket.cases += 1
    if (row.ruleOnly) bucket.ruleOnly += 1
    if (!row.failures.length) bucket.passed += 1
  }
  const calls = (key: 'llmBefore' | 'llmAfter') => Number((results.reduce((sum, row) => sum + row[key].length, 0) * 100 / Math.max(1, results.length)).toFixed(1))
  return {
    cases: results.length,
    ruleOnlyRate: ratio(results.filter(row => row.ruleOnly).length, results.length),
    llmRate: ratio(results.filter(row => !row.ruleOnly).length, results.length),
    llmByStep,
    llmCallsPer100: { before: calls('llmBefore'), after: calls('llmAfter') },
    labeled: {
      cases: labeled.length, passed: passed.length, passRate: ratio(passed.length, labeled.length),
      ruleOnlyCases: ruleOnlyLabeled.length, ruleOnlyPassed: ruleOnlyLabeled.filter(row => !row.failures.length).length,
      ruleOnlyPassRate: ruleOnlyLabeled.length ? ratio(ruleOnlyLabeled.filter(row => !row.failures.length).length, ruleOnlyLabeled.length) : null,
    },
    byTag,
    ruleLatencyMs: { p50: percentile(results.map(row => row.ruleMs), 50), p95: percentile(results.map(row => row.ruleMs), 95) },
    failures: results.filter(row => row.failures.length).map(row => ({ id: row.id, failures: row.failures })),
    delegated: results.filter(row => !row.ruleOnly).map(row => ({ id: row.id, steps: row.llmAfter })),
  }
}

export function parseDataset(text: string): EvalCase[] {
  const seen = new Set<string>()
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('//')).map((line, index) => {
    const row = JSON.parse(line) as EvalCase
    if (typeof row.id !== 'string' || typeof row.text !== 'string' || !row.text.trim()) throw new Error(`line ${index + 1}: id and text are required`)
    if (seen.has(row.id)) throw new Error(`duplicate id ${row.id}`)
    seen.add(row.id)
    return row
  })
}
