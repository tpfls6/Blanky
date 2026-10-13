import { formatISODate } from '../../utils/src/date.ts'
import { PARSE_CONFIG } from './config.ts'
import { routeInput, PlannerRequiredError } from './intentRouter.ts'
import type { ParseContext, ParsedSchedule } from './model.ts'
import { parseScheduleText } from './parse.ts'
import type { AIProvider } from './provider.ts'

export async function resolveParse(
  text: string,
  context: ParseContext,
  options: {
    threshold?: number
    provider?: AIProvider | null
    timezone?: string
  } = {},
): Promise<ParsedSchedule> {
  const parsed = parseScheduleText(text, context)
  const threshold = options.threshold ?? PARSE_CONFIG.aiConfidenceThreshold
  const provider = options.provider
  const intent = routeInput(text, parsed, threshold)
  if (intent.route === 'planner') throw new PlannerRequiredError()
  if (!provider || intent.route === 'parser') return parsed
  try {
    const ai = await provider.parseSchedule({
      text,
      today: formatISODate(context.today),
      timezone: options.timezone ?? 'Asia/Seoul',
      type: parsed.type,
      draft: parsed.draft,
    })
    if (!ai) return parsed
    return {
      ...ai,
      source: 'ai',
      fields: ai.fields ?? parsed.fields,
    }
  } catch {
    return parsed
  }
}
