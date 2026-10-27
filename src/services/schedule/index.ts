import { createScheduleRepository, type ScheduleRepository } from '@blanky/api'
import { buildFeedback, resolveScheduleAnalysis, type ParsedSchedule } from '@blanky/parse'
import { AnalysisError, type ScheduleAnalysis } from '@blanky/types'
import type { WorkspaceCategory } from '../../types/work.ts'
import type { ScheduleDraft } from '../../utils/scheduleDraft.ts'
import { analyzeScheduleFromText } from '../ai/index.ts'
import { saveClassificationFeedback } from '../feedback/index.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'

export function getScheduleRepository(): ScheduleRepository {
  return createScheduleRepository(getSupabaseClient())
}

function minutesBetween(start: string | null, end: string | null): string {
  if (!start || !end) return ''
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  const diff = (endHour ?? 0) * 60 + (endMinute ?? 0) - ((startHour ?? 0) * 60 + (startMinute ?? 0))
  return diff > 0 ? String(diff) : ''
}

export function draftFromParsed(
  parsed: ParsedSchedule,
  sourceText: string,
  fallbackDate: string,
  categories: WorkspaceCategory[],
): ScheduleDraft {
  const categoryId = categories.some((item) => item.id === parsed.draft.categoryId)
    ? parsed.draft.categoryId
    : null
  return {
    id: null,
    kind: parsed.type,
    title: parsed.draft.title,
    date: parsed.draft.date || fallbackDate,
    endDate: parsed.draft.endDate ?? '',
    startTime: parsed.draft.startTime ?? '',
    endTime: parsed.draft.endTime ?? '',
    duration: minutesBetween(parsed.draft.startTime, parsed.draft.endTime),
    dueDate: parsed.draft.dueDate ?? '',
    categoryId,
    description: '',
    status: 'todo',
    sourceText,
    parsed: {
      type: parsed.type,
      confidence: parsed.confidence,
      source: parsed.source,
      title: parsed.draft.title,
      date: parsed.draft.date,
      startTime: parsed.draft.startTime,
      endTime: parsed.draft.endTime,
      dueDate: parsed.draft.dueDate,
      categoryId: parsed.draft.categoryId,
    },
  }
}

/** Rule parser first. The edge function adds personal rules and AI only when needed. */
export async function classifySchedule(
  text: string,
  selected: string,
  categories: WorkspaceCategory[],
  today: Date,
): Promise<ScheduleDraft> {
  const result = await analyzeSchedules(text, categories, today)
  if (result.items.length !== 1) throw new AnalysisError('MULTIPLE_ITEMS', '여러 항목이 분석되었어요. 항목별 확인 화면을 사용해 주세요.')
  if (!result.items[0].draft.date) throw new AnalysisError('DATE_REQUIRED', '날짜를 확인한 후 저장해 주세요.')
  return draftFromParsed(result.items[0], text, selected, categories)
}

export async function analyzeSchedules(text: string, categories: WorkspaceCategory[], today: Date): Promise<ScheduleAnalysis> {
  if (!isSupabaseConfigured) return resolveScheduleAnalysis(text, { today, categories })
  return analyzeScheduleFromText({ text, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul' })
}

export async function recordScheduleFeedback(draft: ScheduleDraft): Promise<void> {
  if (!draft.parsed || !draft.sourceText) return
  const feedback = buildFeedback({
    text: draft.sourceText,
    predicted: {
      type: draft.parsed.type,
      confidence: draft.parsed.confidence,
      source: draft.parsed.source,
      draft: {
        title: draft.parsed.title,
        date: draft.parsed.date,
        startTime: draft.parsed.startTime,
        endTime: draft.parsed.endTime,
        dueDate: draft.parsed.dueDate,
        endDate: null,
        categoryId: draft.parsed.categoryId,
      },
    },
    saved: {
      type: draft.kind,
      title: draft.title,
      date: draft.date || null,
      startTime: draft.startTime || null,
      endTime: draft.endTime || null,
      dueDate: draft.dueDate || null,
      categoryId: draft.categoryId,
    },
  })
  if (!feedback) return
  await saveClassificationFeedback({
    inputText: feedback.inputText,
    predictedType: feedback.predictedType,
    correctedType: feedback.correctedType,
    predictedCategoryId: feedback.predictedCategoryId,
    correctedCategoryId: feedback.correctedCategoryId,
    fieldCorrections: feedback.fieldCorrections,
  })
}
