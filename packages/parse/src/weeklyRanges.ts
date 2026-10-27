import type { ScheduleAnalysis } from '../../types/src/ai.ts'
import { validateScheduleAnalysis } from '../../types/src/aiSchema.ts'
import { parseKoreanDate } from './parse.ts'
import { readSpokenTimeRange } from './timeRange.ts'

/** Narrow recovery for explicit weekly weekday/range lists; never guesses overnight or AM/PM endings. */
export function parseWeeklyRanges(text: string, today: Date): ScheduleAnalysis | null {
  const tail = '(?:있는데\\s*일정(?:\\s*추가해\\s*줘)?|일정\\s*추가해\\s*줘|추가해\\s*줘)?[.!?]?$'
  const suffix = new RegExp('^(.*?)\\s*(?:주마다|매주)\\s+(.+?)' + tail).exec(text.trim())
  const match = suffix?.[1].trim() ? suffix : new RegExp('^(?:매주|주마다)\\s+(.+(?:시(?:까지)?|:\\d{2}))\\s+(.+?)' + tail).exec(text.trim())
  if (!match || !match[2].trim()) return null
  const items: ScheduleAnalysis['items'] = []
  for (const clause of match[1].split(/[,，]/)) {
    const range = /^\s*([월화수목금토일](?:요일)?(?:\s*\/\s*[월화수목금토일](?:요일)?)*)\s+(.+?)\s*$/.exec(clause)
    if (!range) return null
    const time = readSpokenTimeRange(range[2])
    if (!time || range[2].trim() !== time.range.trim()) return null
    for (const day of range[1].split(/\s*\/\s*/)) {
      const date = parseKoreanDate(day.length === 1 ? `${day}요일` : day, today)
      if (!date) return null
      items.push({ id: `weekly-${items.length + 1}`, type: 'event', source: 'rule', confidence: 1,
        draft: { title: match[2].trim(), date, startTime: time.startTime, endTime: time.endTime, dueDate: null, endDate: null, categoryId: null },
        evidence: { date: day.length === 1 ? text : day, startTime: time.evidenceStart, endTime: time.evidenceEnd, dueDate: null, endDate: null },
        categoryReason: null, uncertainties: time.estimated ? [{ field: 'endTime', reason: `${time.startTime}–${time.endTime}로 추정했어요. 오전·오후와 소요시간 ${time.durationMinutes}분을 확인해 주세요.` }] : !time.endTime ? [{ field: 'endTime', reason: '자정을 넘는지 확인하고 종료 날짜와 시각을 입력해 주세요.' }] : [],
      })
    }
  }
  if (items.length < 1 || items.length > 20) return null
  return validateScheduleAnalysis({ version: 1, route: 'parser', items, relations: [], warnings: ['명시된 요일·시간 범위를 규칙으로 읽었어요. 첫 날짜, 종료 시각과 매주 반복을 확인해 주세요.'] }, { text })
}
