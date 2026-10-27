import type { AnalysisItem, ScheduleDraftFields } from '../../../packages/types/src/ai.ts'
import { AnalysisError, isCalendarDate } from '../../../packages/types/src/aiSchema.ts'
import type { WorkInput } from '../../types/work.ts'

/** Review can fill unknowns, but never substitutes today's date or a default duration. */
export function reviewedWorkInput(item: AnalysisItem, draft: ScheduleDraftFields, noTimeConfirmed: boolean, categoryIds: string[], repeat: WorkInput['repeat'] = 'none', repeatDays: number[] = [], inferredTimeConfirmed = false): WorkInput {
  if (!['none', 'daily', 'weekly', 'monthly'].includes(repeat)) throw new AnalysisError('INVALID_INPUT', '반복 설정을 확인해 주세요.')
  if (item.uncertainties.some(entry => ['startTime','endTime'].includes(entry.field) && /추정/.test(entry.reason)) && !inferredTimeConfirmed) throw new AnalysisError('TIME_CONFIRMATION_REQUIRED', '추정한 시간 범위를 확인해 주세요.')
  if (!draft.title.trim() || !draft.date || !isCalendarDate(draft.date)) throw new AnalysisError('DATE_REQUIRED', '제목과 날짜를 확인해 주세요.')
  for (const day of [draft.dueDate, draft.endDate]) if (day && !isCalendarDate(day)) throw new AnalysisError('INVALID_INPUT', '날짜를 확인해 주세요.')
  for (const time of [draft.startTime, draft.endTime]) if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AnalysisError('INVALID_INPUT', '시각을 확인해 주세요.')
  if (draft.endTime && !draft.startTime) throw new AnalysisError('INVALID_INPUT', '시작 시각을 지정해 주세요.')
  if (draft.endDate && draft.endDate < draft.date) throw new AnalysisError('INVALID_INPUT', '종료 날짜를 확인해 주세요.')
  if (draft.startTime && draft.endTime && draft.endTime <= draft.startTime && (!draft.endDate || draft.endDate === draft.date)) throw new AnalysisError('INVALID_INPUT', '종료 시각을 확인해 주세요.')
  if (item.type === 'event' && !draft.startTime && !noTimeConfirmed) throw new AnalysisError('TIME_REQUIRED', '시간 없음으로 저장할지 확인해 주세요.')
  if (draft.categoryId && !categoryIds.includes(draft.categoryId)) throw new AnalysisError('INVALID_INPUT', '카테고리를 다시 선택해 주세요.')
  return { kind: item.type, title: draft.title, date: draft.date, startTime: draft.startTime, endTime: draft.endTime,
    dueDate: item.type === 'task' ? draft.dueDate : null, endDate: item.type === 'event' ? draft.endDate : null,
    categoryId: draft.categoryId, duration: null, allDay: item.type === 'event' && !draft.startTime,
    description: '', status: 'todo', repeat, repeatDays }
}
