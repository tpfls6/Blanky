import type { FieldCorrection } from '../../types/src/feedback.ts'
import type { LearnedRule, ParsedSchedule, ScheduleKind } from './model.ts'

const SKIP = new Set([
  '오늘',
  '내일',
  '모레',
  '오전',
  '오후',
  '저녁',
  '밤',
  '이번',
  '다음',
  '월요일',
  '화요일',
  '수요일',
  '목요일',
  '금요일',
  '토요일',
  '일요일',
  '까지',
  '부터',
  '시간',
  '카테고리',
])

export const RULE_MIN_HITS = 3

export type FeedbackSample = {
  inputText: string
  correctedType: string | null
  correctedCategoryId: string | null
}

export type SavedSchedule = {
  type: ScheduleKind
  title: string
  date: string | null
  startTime: string | null
  endTime: string | null
  dueDate: string | null
  categoryId: string | null
}

export type FeedbackDraft = {
  inputText: string
  predictedType: ScheduleKind
  correctedType: ScheduleKind
  predictedCategoryId: string | null
  correctedCategoryId: string | null
  fieldCorrections: Record<string, FieldCorrection>
}

function blank(value: string | null | undefined): string | null {
  return value ? value : null
}

export function buildFeedback(input: {
  text: string
  predicted: ParsedSchedule
  saved: SavedSchedule
}): FeedbackDraft | null {
  const corrections: Record<string, FieldCorrection> = {}
  const pairs: Array<[string, string | null, string | null]> = [
    ['title', input.predicted.draft.title, input.saved.title],
    ['date', input.predicted.draft.date, input.saved.date],
    ['startTime', input.predicted.draft.startTime, input.saved.startTime],
    ['endTime', input.predicted.draft.endTime, input.saved.endTime],
    ['dueDate', input.predicted.draft.dueDate, input.saved.dueDate],
  ]
  for (const [field, predicted, corrected] of pairs) {
    const before = blank(predicted)
    const after = blank(corrected)
    if (before !== after) corrections[field] = { predicted: before, corrected: after }
  }
  const typeChanged = input.predicted.type !== input.saved.type
  const categoryChanged = blank(input.predicted.draft.categoryId) !== blank(input.saved.categoryId)
  if (!typeChanged && !categoryChanged && Object.keys(corrections).length === 0) return null
  return {
    inputText: input.text,
    predictedType: input.predicted.type,
    correctedType: input.saved.type,
    predictedCategoryId: input.predicted.draft.categoryId,
    correctedCategoryId: input.saved.categoryId,
    fieldCorrections: corrections,
  }
}

function tokens(text: string): string[] {
  const found = text.match(/[\p{L}\p{N}]+/gu) ?? []
  return [...new Set(found.filter((token) => token.length >= 2 && !SKIP.has(token) && !/^\d+$/.test(token)))]
}

/** Promote a personal rule after the same correction shows up enough times. */
export function rulesFromFeedback(rows: FeedbackSample[]): LearnedRule[] {
  const counts = new Map<string, { pattern: string; targetType: ScheduleKind | null; categoryId: string | null; hits: number }>()
  for (const row of rows) {
    const targetType = row.correctedType === 'event' || row.correctedType === 'task' ? row.correctedType : null
    for (const pattern of tokens(row.inputText)) {
      const key = `${pattern}\0${targetType ?? ''}\0${row.correctedCategoryId ?? ''}`
      const current = counts.get(key)
      if (current) current.hits += 1
      else counts.set(key, { pattern, targetType, categoryId: row.correctedCategoryId, hits: 1 })
    }
  }

  const grouped = new Map<string, Array<{ pattern: string; targetType: ScheduleKind | null; categoryId: string | null; hits: number }>>()
  for (const item of counts.values()) {
    const list = grouped.get(item.pattern) ?? []
    list.push(item)
    grouped.set(item.pattern, list)
  }

  const rules: LearnedRule[] = []
  for (const list of grouped.values()) {
    list.sort((a, b) => b.hits - a.hits)
    const top = list[0]
    if (!top || top.hits < RULE_MIN_HITS) continue
    if (list[1] && list[1].hits === top.hits) continue
    rules.push({
      pattern: top.pattern,
      targetType: top.targetType,
      categoryId: top.categoryId,
      weight: Math.min(5, top.hits),
    })
  }
  return rules
}
