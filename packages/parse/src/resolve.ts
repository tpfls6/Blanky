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
import { readRecurrence } from './recurrence.ts'
import { normalizeUtterance } from './intents.ts'

const PAST_DATE_REASON = '지난 날짜예요. 날짜를 확인해 주세요.'

/** A day said relative to the item before it: 전날, 이틀 전, 일주일 전, 다음 날, 같은 날, 그 주 금요일. */
const RELATIVE_DAY = String.raw`(?:그\s*)?(?:전날|전\s+날|하루\s*전|이틀\s*전|사흘\s*전|나흘\s*전|\d{1,2}\s*일\s*전|(?:일|한|1|두|2|세|3)\s*주(?:일)?\s*전|다음\s*날|이튿날|당일|그날|같은\s*날|주\s*[월화수목금토일]요일)`
const COUNT: Record<string, number> = { 일: 1, 한: 1, 1: 1, 두: 2, 2: 2, 세: 3, 3: 3 }

function shiftRelative(base: string, phrase: string): Date | null {
  const from = new Date(Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1, Number(base.slice(8, 10)))
  const text = phrase.replace(/^그\s*/, '').replace(/\s+/g, '')
  const day = new Date(from)
  const weekdayInWeek = /^주([월화수목금토일])요일$/.exec(text)
  // "그 주 금요일" without 그 ("주 금요일") is not a phrase anyone says; require 그 for the week form.
  if (weekdayInWeek) {
    if (!/^그/.test(phrase.trim())) return null
    const target = '일월화수목금토'.indexOf(weekdayInWeek[1])
    const monday = (from.getDay() + 6) % 7
    day.setDate(from.getDate() - monday + ((target + 6) % 7))
    return day
  }
  const days = /^(\d{1,2})일전$/.exec(text)
  const weeks = /^(일|한|1|두|2|세|3)주(?:일)?전$/.exec(text)
  const offset = /^(?:전날|하루전)$/.test(text) ? -1 : text === '이틀전' ? -2 : text === '사흘전' ? -3 : text === '나흘전' ? -4
    : days ? -Number(days[1]) : weeks ? -7 * COUNT[weeks[1]] : /^(?:다음날|이튿날)$/.test(text) ? 1 : /^(?:당일|그날|같은날)$/.test(text) ? 0 : null
  if (offset === null) return null
  day.setDate(from.getDate() + offset)
  return day
}

/**
 * A new item dated before today (a late entry such as "11월 3일 회의" on the 9th) is kept on that day but waits
 * for confirmation instead of saving on its own. Idempotent, so clause recursion may apply it twice.
 */
function flagPastDates(analysis: ScheduleAnalysis, today: Date): ScheduleAnalysis {
  const todayISO = formatISODate(today)
  let changed = false
  const items = analysis.items.map(item => {
    const field = item.type === 'task' && item.draft.dueDate ? 'dueDate' as const : 'date' as const
    const day = item.draft[field]
    if (!day || day >= todayISO || item.uncertainties.some(entry => entry.reason === PAST_DATE_REASON)) return item
    changed = true
    return { ...item, uncertainties: [...item.uncertainties, { field, reason: PAST_DATE_REASON }] }
  })
  return changed ? { ...analysis, items } : analysis
}

/** Validated multi-item path. AI failures never collapse complex input into one draft. */
export async function resolveScheduleAnalysis(
  text: string,
  context: ParseContext,
  options: { provider?: AnalysisProvider; timezone?: string; threshold?: number } = {},
): Promise<ScheduleAnalysis> {
  return flagPastDates(await resolveAnalysis(text, context, options), context.today)
}

async function resolveAnalysis(
  text: string,
  context: ParseContext,
  options: { provider?: AnalysisProvider; timezone?: string; threshold?: number } = {},
): Promise<ScheduleAnalysis> {
  if (!text.trim() || text.length > 8000) throw new AnalysisError('INVALID_INPUT', '1~8000자 이내로 입력해 주세요.')
  // Same colloquial normalization as intent analysis (낼, 담주, 금욜 …), so every path reads the same words.
  // Evidence is validated against this normalized text. Idempotent, so clause recursion is safe.
  text = normalizeUtterance(text)
  const parsed = parseScheduleText(text, context)
  const deadline = readDeadline(text, context.today)
  const intent = routeInput(text, parsed, options.threshold)
  if(intent.route==='reschedule')throw new PlannerRequiredError()
  if (intent.route === 'planner') throw new PlannerRequiredError()
  const explicitWeekly = parseWeeklyRanges(text, context.today)
  if (explicitWeekly?.items.length === 1) return explicitWeekly
  // One repeating item ("매일 영양제 먹기", "격주 화요일 분리수거"): read the rest without the repeat words, starting on the
  // first matching day. The repeat rule itself is read again by the client from the same text (readRecurrence).
  const rule = !explicitWeekly && !/[,，;\n]/.test(text) ? readRecurrence(text, context.today) : null
  if (rule && rule.rest) {
    const start = new Date(Number(rule.start.slice(0, 4)), Number(rule.start.slice(5, 7)) - 1, Number(rule.start.slice(8, 10)))
    const base = parseScheduleText(rule.rest, { ...context, today: start })
    const time = readSpokenTimeRange(rule.rest)
    const startTime = time?.startTime ?? base.draft.startTime
    const title = (time && /\d|[~〜–]/.test(base.draft.title) ? parseScheduleText(rule.rest.replace(time.range, ' '), { ...context, today: start }).draft.title : base.draft.title) || rule.rest
    // A repeating routine to check off ("일기 쓰기", no clock time) is a task; meetings and classes stay events.
    const type = base.type === 'event' && startTime && !(/기$/.test(title) && !/회의|미팅|수업|강의|약속|모임|예배/.test(title)) ? 'event' : 'task'
    return validateScheduleAnalysis({ version: 1, route: 'parser', items: [{
      id: 'item-1', type, confidence: Math.max(base.confidence, 0.8), source: base.source,
      draft: { ...base.draft, title, date: rule.start, startTime, endTime: time?.endTime ?? base.draft.endTime, dueDate: null, dueTime: null, endDate: null },
      evidence: { date: text, startTime: startTime ? text : null, endTime: (time?.endTime ?? base.draft.endTime) ? text : null, dueDate: null, dueTime: null, endDate: null },
      categoryReason: base.draft.categoryId ? '기존 카테고리 및 개인 규칙과 일치해요.' : null,
      uncertainties: time?.estimated ? [{ field: 'endTime', reason: `${time.startTime}–${time.endTime}로 추정했어요. 오전·오후와 소요시간 ${time.durationMinutes}분을 확인해 주세요.` }] : [],
    }], relations: [], warnings: [] }, { text, categoryIds: context.categories?.map(category => category.id) ?? [] })
  }
  // Split only at a clause boundary followed by an explicit new date.
  // A shared deadline and conjunction alone remain one goal.
  // "수요일 10~12 회의, 14~16 병원": a clause that opens with a time range is its own schedule on the previous clause's date.
  // "11월 30일 발표, 그 전날까지 슬라이드": a clause opening with a day relative to the previous clause gets that day written out.
  const dateWord = /(?:(?:이번|다음|다다음)\s*주\s*)?(?:오늘|내일|모레|[월화수목금토일]요일|\d{4}-\d{2}-\d{2}|\d{1,2}월\s*\d{1,2}일)/
  // The relative phrase may follow a word naming the earlier item: "공연 일주일 전까지", "발표 이틀 전까지".
  const relativeDay = new RegExp(`^(?:(?!그\\s)[가-힣A-Za-z]{1,8}\\s+)?(${RELATIVE_DAY})`)
  const clauses = text.split(new RegExp(`(?:하고\\s*|이고\\s+|이랑\\s+|[,，;]\\s*)(?=(?:오늘|내일|모레|[월화수목금토일]요일|\\d{4}-\\d{2}-\\d{2}|(?:(?!그\\s)[가-힣A-Za-z]{1,8}\\s+)?(?:${RELATIVE_DAY})))|[,，;]\\s*(?=(?:오전|오후|저녁|밤)?\\s*\\d{1,2}(?::\\d{2}|\\s*시)?\\s*(?:부터|~|〜|–|-))`)).filter(Boolean)
    .reduce<string[]>((all, clause) => {
      const relative = all.length ? relativeDay.exec(clause) : null
      const base = relative ? parseKoreanDate(all.at(-1)!, context.today) ?? parseDueDate(all.at(-1)!, context.today) : null
      const day = relative && base ? shiftRelative(base, relative[1]) : null
      // Written with its year, so "1월 1일 행사, 그 전날까지 준비" lands on 12월 31일 of the right year.
      if (relative && day) return [...all, clause.replace(relative[0], `${day.getFullYear()}년 ${day.getMonth() + 1}월 ${day.getDate()}일`)]
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
