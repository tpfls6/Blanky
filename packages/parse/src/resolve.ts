import { formatISODate } from '../../utils/src/date.ts'
import { PARSE_CONFIG } from './config.ts'
import { routeInput, PlannerRequiredError } from './intentRouter.ts'
import type { ParseContext, ParsedSchedule } from './model.ts'
import { parseScheduleText } from './parse.ts'
import type { AIProvider } from './provider.ts'
import type { AnalysisProvider } from './analysisProvider.ts'
import type { ScheduleAnalysis, TemporalField } from '../../types/src/ai.ts'
import { AnalysisError, validateScheduleAnalysis } from '../../types/src/aiSchema.ts'
import { parseKoreanDate, parseDueDate } from './parse.ts'
import { parseWeeklyRanges } from './weeklyRanges.ts'
import { readSpokenTimeRange } from './timeRange.ts'

/** Validated multi-item path. AI failures never collapse complex input into one draft. */
export async function resolveScheduleAnalysis(
  text: string,
  context: ParseContext,
  options: { provider?: AnalysisProvider; timezone?: string; threshold?: number } = {},
): Promise<ScheduleAnalysis> {
  if (!text.trim() || text.length > 8000) throw new AnalysisError('INVALID_INPUT', '1~8000자 이내로 입력해 주세요.')
  const parsed = parseScheduleText(text, context)
  const intent = routeInput(text, parsed, options.threshold)
  if(intent.route==='reschedule')throw new PlannerRequiredError()
  if (intent.route === 'planner') throw new PlannerRequiredError()
  const explicitWeekly = parseWeeklyRanges(text, context.today)
  if (explicitWeekly?.items.length === 1) return explicitWeekly
  if (intent.route === 'ai') {
    if (!options.provider) throw new AnalysisError('AI_NOT_CONFIGURED', 'AI 분석이 아직 설정되지 않았어요.')
    try {
      const result = await options.provider.analyze({ text, today: formatISODate(context.today), timezone: options.timezone ?? 'Asia/Seoul', categories: context.categories ?? [] })
      const weekly = parseWeeklyRanges(text, context.today)
      if (weekly) return weekly
      return validateScheduleAnalysis(result, { text, categoryIds: context.categories?.map(category => category.id) ?? [], aiOnly: true })
    } catch (error) {
      if (error instanceof AnalysisError && error.code === 'AI_RESPONSE_INVALID') {
        const recovered = parseWeeklyRanges(text, context.today)
        if (recovered) return recovered
      }
      throw error
    }
  }
  // The legacy parser's fallback date is a UI convenience, not evidence in the input.
  const weekly = parseWeeklyRanges(text, context.today)
  if (weekly) return weekly
  if (!parseKoreanDate(text, context.today) && !parseDueDate(text, context.today)) parsed.draft.date = null
  if (parsed.type === 'task' && parsed.draft.dueDate && !parseKoreanDate(text.replace(/.*?까지/, ''), context.today)) parsed.draft.date = null
  const fields: TemporalField[] = ['date', 'startTime', 'endTime', 'dueDate', 'endDate']
  const timeRange = readSpokenTimeRange(text)
  if (timeRange) { parsed.draft.startTime = timeRange.startTime; parsed.draft.endTime = timeRange.endTime }
  const uncertainties = [
    ...(timeRange?.estimated ? [{ field: 'endTime' as const, reason: `${timeRange.startTime}–${timeRange.endTime}로 추정했어요. 소요시간 ${timeRange.durationMinutes}분을 확인해 주세요.` }] : []),
    ...(!parsed.draft.date ? [{ field: 'date' as const, reason: '날짜를 지정해 주세요.' }] : []),
    ...(!parsed.draft.startTime && parsed.type === 'event' ? [{ field: 'startTime' as const, reason: '시각이 없어요. 종일 일정인지 확인해 주세요.' }] : []),
  ]
  return validateScheduleAnalysis({ version: 1, route: 'parser', items: [{
    id: 'item-1', type: parsed.type, confidence: parsed.confidence, source: parsed.source, draft: parsed.draft,
    evidence: Object.fromEntries(fields.map(field => [field, parsed.draft[field] ? text : null])),
    categoryReason: parsed.draft.categoryId ? '기존 카테고리 및 개인 규칙과 일치해요.' : null,
    uncertainties,
  }], relations: [], warnings: [] }, { text, categoryIds: context.categories?.map(category => category.id) ?? [] })
}

/** Legacy single-draft compatibility only. Web/Edge analysis uses resolveScheduleAnalysis. */
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
  if(intent.route==='reschedule')throw new PlannerRequiredError()
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
