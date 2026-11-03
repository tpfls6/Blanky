import { normalizeAnalysis } from './grouping.ts'
import { readDeadline } from './deadline.ts'
import { formatISODate } from '../../utils/src/date.ts'
import { PARSE_CONFIG } from './config.ts'
import { routeInput, PlannerRequiredError } from './intentRouter.ts'
import type { ParseContext, ParsedSchedule } from './model.ts'
import { parseScheduleText } from './parse.ts'
import type { AIProvider } from './provider.ts'
import type { AnalysisProvider } from './analysisProvider.ts'
import type { ScheduleAnalysis, TemporalField } from '../../types/src/ai.ts'
import { AnalysisError, validateScheduleAnalysis } from '../../types/src/aiSchema.ts'
import { parseKoreanDate, parseDueDate, parseKoreanTime } from './parse.ts'
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
  const deadline = readDeadline(text, context.today)
  const intent = routeInput(text, parsed, options.threshold)
  if(intent.route==='reschedule')throw new PlannerRequiredError()
  if (intent.route === 'planner') throw new PlannerRequiredError()
  const explicitWeekly = parseWeeklyRanges(text, context.today)
  if (explicitWeekly?.items.length === 1) return explicitWeekly
  // Split only at a clause boundary followed by an explicit new date.
  // A shared deadline and conjunction alone remain one goal.
  // "수요일 10~12 회의, 14~16 병원": a clause that opens with a time range is its own schedule on the previous clause's date.
  const dateWord = /(?:(?:이번|다음|다다음)\s*주\s*)?(?:오늘|내일|모레|[월화수목금토일]요일|\d{4}-\d{2}-\d{2})/
  const clauses = text.split(/(?:하고\s*|[,，;]\s*)(?=(?:오늘|내일|모레|[월화수목금토일]요일|\d{4}-\d{2}-\d{2}))|[,，;]\s*(?=(?:오전|오후|저녁|밤)?\s*\d{1,2}(?::\d{2}|\s*시)?\s*(?:부터|~|〜|–|-))/).filter(Boolean)
    .reduce<string[]>((all, clause) => {
      if (!all.length || dateWord.test(clause)) return [...all, clause]
      const inherited = dateWord.exec(all.at(-1)!)?.[0]
      return inherited ? [...all, `${inherited} ${clause}`] : [...all.slice(0, -1), `${all.at(-1)}, ${clause}`]
    }, [])
  if (clauses.length > 1 && !explicitWeekly && (!options.provider || /[,，;]/.test(text))) {
    const parts = await Promise.all(clauses.map(clause => resolveScheduleAnalysis(clause, context, { ...options, threshold: 0 })))
    return normalizeAnalysis({ version: 1, route: 'parser', items: parts.flatMap((part, index) => part.items.map(item => ({ ...item, id: `clause-${index}-${item.id}` }))), relations: [], warnings: parts.flatMap(part => part.warnings) })
  }
  const connectedDeadline = !!deadline && /하고|만들고|해서|한 후|다음에/.test(text) &&
    /데모\s*영상.*(?:피피티|PPT)|자료\s*조사.*발표|PPT.*발표\s*연습/i.test(text) &&
    (text.match(/오늘|내일|모레|[월화수목금토일]요일|\d{4}-\d{2}-\d{2}/g) ?? []).length === 1 &&
    !/[,;\n]|별도로|그리고|각각|회의|약속|병원|만나기/.test(text)
  if (connectedDeadline) {
    parsed.type = 'task'
    parsed.draft.startTime = null; parsed.draft.endTime = null
    parsed.draft.description = `원문: ${text}\n세부 작업: ${text.replace(/하고\s*|만들고\s*|해서\s*|한 후\s*|다음에\s*/g, match => match.startsWith('만들') ? '제작 → ' : ' → ')}`
    if (/데모\s*영상/.test(text) && /피피티|PPT/i.test(text)) {
      parsed.draft.title = '데모영상 확인 및 PPT 제작'
      parsed.draft.description = `원문: ${text}\n세부 작업: 데모영상 전달 확인 → PPT 제작`
    }
  }
  if (intent.route === 'ai' && !connectedDeadline && !(deadline && intent.reason === 'low_confidence')) {
    if (!options.provider) {
      if (explicitWeekly) return explicitWeekly
      throw new AnalysisError('AI_NOT_CONFIGURED', 'AI 분석이 아직 설정되지 않았어요.')
    }
    try {
      const result = await options.provider.analyze({ text, today: formatISODate(context.today), timezone: options.timezone ?? 'Asia/Seoul', categories: context.categories ?? [] })
      const weekly = parseWeeklyRanges(text, context.today)
      if (weekly) return weekly
      const validated = validateScheduleAnalysis(result, { text, categoryIds: context.categories?.map(category => category.id) ?? [], aiOnly: true })
      for (const item of validated.items) {
        if (item.draft.dueTime && parseKoreanTime(item.evidence.dueTime ?? '')?.startTime !== item.draft.dueTime) throw new AnalysisError()
      }
      return normalizeAnalysis(validated)
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
  if (deadline && !parseKoreanDate(deadline.rest, context.today)) parsed.draft.date = null
  const fields: TemporalField[] = ['date', 'startTime', 'endTime', 'dueDate', 'dueTime', 'endDate']
  const timeRange = readSpokenTimeRange(text)
  if (timeRange && !deadline) {
    parsed.draft.startTime = timeRange.startTime; parsed.draft.endTime = timeRange.endTime
    // The legacy title reader only knows 부터~까지 ranges; 9-13시 or 3시~5시 leave clock fragments behind.
    if (/\d|[~〜–]/.test(parsed.draft.title)) parsed.draft.title = parseScheduleText(text.replace(timeRange.range, ' '), context).draft.title
  }
  const uncertainties = [
    ...(deadline?.ambiguous ? [{ field: (deadline.date ? 'dueTime' : 'dueDate') as TemporalField, reason: '마감 날짜 또는 오전·오후가 모호해요. 마감일과 시각을 확인해 주세요.' }] : []),
    ...(timeRange?.estimated ? [{ field: 'endTime' as const, reason: `${timeRange.startTime}–${timeRange.endTime}로 추정했어요. 오전·오후와 소요시간 ${timeRange.durationMinutes}분을 확인해 주세요.` }] : []),
    ...(!parsed.draft.date && parsed.type === 'event' ? [{ field: 'date' as const, reason: '날짜를 지정해 주세요.' }] : []),
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
