import type { ScheduleAnalysis } from '../../../packages/types/src/ai.ts'
import type { IntentExtraction } from '../../../packages/parse/src/intents.ts'
import type { IntentPlan } from './intentPlan.ts'

export type AnalyzeOnceResult = { analysis: ScheduleAnalysis } | { plan: IntentPlan }

function codeOf(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}

/**
 * One paid AI call per message. When intent analysis already asked the AI (`intentAI`), schedule
 * analysis runs on rules only; if the rules cannot read the sentence, the AI intents are used as an
 * intent plan (always confirmed before saving, as for any AI result) instead of a second AI call.
 * Only when those intents give nothing to do is analysis asked again with AI.
 */
export async function analyzeOnce(deps: {
  intentAI: IntentExtraction | null
  analyze: (options: { ai?: false }) => Promise<ScheduleAnalysis>
  planFromIntents: (extraction: IntentExtraction) => IntentPlan
}): Promise<AnalyzeOnceResult> {
  if (!deps.intentAI) return { analysis: await deps.analyze({}) }
  try {
    return { analysis: await deps.analyze({ ai: false }) }
  } catch (error) {
    const code = codeOf(error)
    // A server deployed before `ai:false` rejects the key; it then behaves as before.
    if (code === 'INVALID_INPUT') return { analysis: await deps.analyze({}) }
    if (code !== 'AI_SKIPPED') throw error
    const plan = deps.planFromIntents(deps.intentAI)
    if (plan.actions.length) return { plan: plan.mode === 'preview' ? plan : { ...plan, mode: 'preview' } }
    return { analysis: await deps.analyze({}) }
  }
}
