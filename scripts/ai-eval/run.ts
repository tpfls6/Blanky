/**
 * npm run eval:ai [-- --dataset path.jsonl] [--json report.json] [--verbose]
 * Offline only: rule layer measured, LLM steps counted through stubs (no network, no API key).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { evaluateCase, parseDataset, summarize, type CaseResult, type LLMStep } from './evaluate.ts'
import { SCHEDULE_ANALYSIS_INSTRUCTIONS } from '../../packages/parse/src/analysisProvider.ts'
import { INTENT_ANALYSIS_INSTRUCTIONS, INTENT_ANALYSIS_SCHEMA } from '../../packages/parse/src/intentAnalysis.ts'
import { SCHEDULE_ANALYSIS_SCHEMA } from '../../packages/types/src/aiSchema.ts'
import { estimateCostUsd } from '../../packages/parse/src/aiMeter.ts'

const args = process.argv.slice(2)
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
const datasetPath = option('--dataset') ?? 'tests/fixtures/ai-eval/seed.jsonl'
const cases = parseDataset(readFileSync(datasetPath, 'utf8'))
const results: CaseResult[] = []
for (const entry of cases) results.push(await evaluateCase(entry))
const report = summarize(results)

// Token/cost per delegated call is an ESTIMATE: prompt+schema characters / 3.5, plus an assumed output size.
const promptTokens = (instructions: string, schema: unknown) => Math.round((instructions.length + JSON.stringify(schema).length) / 3.5) + 60
const assumed: Record<LLMStep, { model: string; input: number; output: number }> = {
  intents: { model: 'gpt-4o-mini', input: promptTokens(INTENT_ANALYSIS_INSTRUCTIONS, INTENT_ANALYSIS_SCHEMA), output: 350 },
  analysis: { model: 'gpt-4o-mini', input: promptTokens(SCHEDULE_ANALYSIS_INSTRUCTIONS, SCHEDULE_ANALYSIS_SCHEMA), output: 500 },
  planning: { model: 'gpt-4.1-mini', input: 3500, output: 1200 },
}
const costPer1000 = (key: 'llmBefore' | 'llmAfter') => {
  let total = 0
  for (const row of results) for (const step of row[key]) total += estimateCostUsd(assumed[step].model, assumed[step].input, assumed[step].output) ?? 0
  return Number((total * 1000 / Math.max(1, results.length)).toFixed(4))
}
const estimate = { note: 'ESTIMATE (not measured): token counts from prompt size, assumed output, list prices', perCall: assumed, usdPer1000Messages: { before: costPer1000('llmBefore'), after: costPer1000('llmAfter') } }

const pct = (value: number | null) => value === null ? '-' : `${(value * 100).toFixed(1)}%`
console.log(`AI offline eval — ${datasetPath} (${report.cases} cases)`)
console.log('[measured, offline simulation]')
console.log(`  rule-only handled      ${pct(report.ruleOnlyRate)}`)
console.log(`  LLM delegation         ${pct(report.llmRate)}  (intents ${report.llmByStep.intents}, analysis ${report.llmByStep.analysis}, planning ${report.llmByStep.planning})`)
console.log(`  LLM calls / 100 msgs   before dedupe ${report.llmCallsPer100.before} → after ${report.llmCallsPer100.after}`)
console.log(`  labeled pass           ${report.labeled.passed}/${report.labeled.cases} (${pct(report.labeled.passRate)}); rule-only labeled ${report.labeled.ruleOnlyPassed}/${report.labeled.ruleOnlyCases} (${pct(report.labeled.ruleOnlyPassRate)})`)
console.log(`  rule latency           p50 ${report.ruleLatencyMs.p50}ms, p95 ${report.ruleLatencyMs.p95}ms`)
console.log('[estimate]')
console.log(`  LLM cost / 1000 msgs   before $${estimate.usdPer1000Messages.before} → after $${estimate.usdPer1000Messages.after}`)
console.log('by tag (cases / rule-only / passed):')
for (const [tag, row] of Object.entries(report.byTag).sort()) console.log(`  ${tag.padEnd(14)} ${row.cases} / ${row.ruleOnly} / ${row.passed}`)
if (report.failures.length) {
  console.log('label mismatches:')
  for (const row of report.failures) console.log(`  ${row.id}: ${row.failures.join('; ')}`)
}
if (args.includes('--verbose')) for (const row of report.delegated) console.log(`  delegated ${row.id}: ${row.steps.join('+')}`)
const out = option('--json')
if (out) writeFileSync(out, JSON.stringify({ report, estimate, results }, null, 2))
