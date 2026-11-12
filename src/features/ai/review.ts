import type { AnalysisItem, ScheduleDraftFields } from '../../../packages/types/src/ai.ts'
import { AnalysisError, isCalendarDate } from '../../../packages/types/src/aiSchema.ts'
import type { WorkInput } from '../../types/work.ts'
import { readRecurrence } from '../../../packages/parse/src/recurrence.ts'
import { normalizeUtterance } from '../../../packages/parse/src/intents.ts'

export type RepeatRequest = Required<Pick<WorkInput, 'repeat' | 'repeatDays' | 'repeatInterval'>> & { repeatUntil: string | null; start: string | null }
const NO_REPEAT: RepeatRequest = { repeat: 'none', repeatDays: [], repeatInterval: 1, repeatUntil: null, start: null }

/**
 * The repeat rule a request asked for. With one item, the rule reader decides ("매일", "격주 화요일", "3일마다", "평일마다");
 * with several items the words could belong to any of them, so only an explicit weekly timetable repeats.
 */
export function requestedRule(text: string, item: AnalysisItem, single: boolean, today: Date = new Date()): RepeatRequest {
  if (item.id.startsWith('weekly-')) return { ...NO_REPEAT, repeat: 'weekly' }
  const rule = single ? readRecurrence(normalizeUtterance(text), today) : null
  if (rule) return { repeat: rule.repeat, repeatDays: rule.repeatDays, repeatInterval: rule.repeatInterval, repeatUntil: rule.repeatUntil, start: rule.start }
  return weeklyRequested(text, item) ? { ...NO_REPEAT, repeat: 'weekly' } : NO_REPEAT
}

/** Repeat words left in a title by a reader that kept them ("매주 팀 회의"). */
export function withoutRepeatWords(title: string): string {
  return title.replace(/^(?:매일|매주|매달|매월|격주|평일마다|주말마다|\d{1,2}\s*(?:일|주|개월)\s*마다)\s*/, '').trim() || title
}

/** Weekly repeat starts on for an explicit 매주 request or a rule-read weekday timetable (weekly-* items). */
export function weeklyRequested(text: string, item: AnalysisItem): boolean {
  return /매주|주마다|매\s*주/.test(text) || item.id.startsWith('weekly-')
}

/** Review can fill unknowns, but never substitutes today's date or a default duration. A task with no date or deadline saves undated. */
export function reviewedWorkInput(item: AnalysisItem, draft: ScheduleDraftFields, noTimeConfirmed: boolean, categoryIds: string[], repeat: WorkInput['repeat'] = 'none', repeatDays: number[] = [], inferredTimeConfirmed = false, deadlineConfirmed = false, rule: Pick<WorkInput, 'repeatInterval' | 'repeatUntil'> = {}): WorkInput {
  if (!['none', 'daily', 'weekly', 'monthly'].includes(repeat)) throw new AnalysisError('INVALID_INPUT', '반복 설정을 확인해 주세요.')
  if (item.type === 'task' && item.uncertainties.some(entry => entry.field === 'dueDate' || entry.field === 'dueTime') && !deadlineConfirmed) throw new AnalysisError('DEADLINE_CONFIRMATION_REQUIRED', '모호한 마감일·시각을 수정하거나 해제한 후 확인해 주세요.')
  if (item.uncertainties.some(entry => ['startTime','endTime'].includes(entry.field) && /추정/.test(entry.reason)) && !inferredTimeConfirmed) throw new AnalysisError('TIME_CONFIRMATION_REQUIRED', '추정한 시간 범위를 확인해 주세요.')
  draft = { ...draft, date: draft.date ?? (item.type === 'task' ? draft.dueDate : null) }
  const undated = item.type === 'task' && !draft.date && !draft.startTime && repeat === 'none'
  if (!draft.title.trim()) throw new AnalysisError('INVALID_INPUT', '제목을 입력해 주세요.')
  if (!undated && (!draft.date || !isCalendarDate(draft.date))) throw new AnalysisError('DATE_REQUIRED', '제목과 날짜를 확인해 주세요.')
  for (const day of [draft.dueDate, draft.endDate]) if (day && !isCalendarDate(day)) throw new AnalysisError('INVALID_INPUT', '날짜를 확인해 주세요.')
  for (const time of [draft.startTime, draft.endTime, draft.dueTime]) if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AnalysisError('INVALID_INPUT', '시각을 확인해 주세요.')
  if (draft.dueTime && !draft.dueDate) throw new AnalysisError('INVALID_INPUT', '마감일을 지정해 주세요.')
  if (draft.endTime && !draft.startTime) throw new AnalysisError('INVALID_INPUT', '시작 시각을 지정해 주세요.')
  if (draft.endDate && draft.date && draft.endDate < draft.date) throw new AnalysisError('INVALID_INPUT', '종료 날짜를 확인해 주세요.')
  if (draft.startTime && draft.endTime && draft.endTime <= draft.startTime && (!draft.endDate || draft.endDate === draft.date)) throw new AnalysisError('INVALID_INPUT', '종료 시각을 확인해 주세요.')
  if (item.type === 'event' && !draft.startTime && !noTimeConfirmed) throw new AnalysisError('TIME_REQUIRED', '시간 없음으로 저장할지 확인해 주세요.')
  if (draft.categoryId && !categoryIds.includes(draft.categoryId)) throw new AnalysisError('INVALID_INPUT', '카테고리를 다시 선택해 주세요.')
  return { priority:item.priorityRecommendation?.priority ?? 'medium', kind: item.type, title: draft.title, date: draft.date ?? '', ...(undated ? { undated: true } : {}), startTime: draft.startTime, endTime: draft.endTime,
    dueTime: item.type === 'task' && draft.dueDate ? draft.dueTime ?? null : null,
    dueDate: item.type === 'task' ? draft.dueDate : null, endDate: item.type === 'event' ? draft.endDate : null,
    categoryId: draft.categoryId, duration: null, allDay: item.type === 'event' && !draft.startTime,
    description: draft.description ?? '', status: 'todo', repeat, repeatDays,
    ...(repeat !== 'none' && rule.repeatInterval && rule.repeatInterval > 1 ? { repeatInterval: rule.repeatInterval } : {}),
    ...(repeat !== 'none' && rule.repeatUntil ? { repeatUntil: rule.repeatUntil } : {}) }
}
