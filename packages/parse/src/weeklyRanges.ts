import type { ScheduleAnalysis } from '../../types/src/ai.ts'
import { validateScheduleAnalysis } from '../../types/src/aiSchema.ts'
import { parseKoreanDate } from './parse.ts'
import { readSpokenTimeRange } from './timeRange.ts'

const DAY = '[월화수목금토일](?:요일)?'
const DAYS = `${DAY}(?:\\s*[/·・,，、]?\\s*${DAY})*`
const TIMETABLE = /(?:수업|강의|실습|레슨|근로|알바|아르바이트)$/

/** Narrow recovery for explicit weekly weekday/range lists; never guesses overnight or AM/PM endings.
 * A list of two or more weekdays (목/금, 화·목·금, 월수금, 화요일 …, 목 …) reads as a weekly timetable even without 매주. */
export function parseWeeklyRanges(text: string, today: Date): ScheduleAnalysis | null {
  const tail = /\s*(?:있는데\s*일정(?:\s*(?:추가|등록)해\s*줘)?|일정\s*(?:추가|등록)해\s*줘|(?:추가|등록)해\s*줘|넣어\s*줘)?[.!?]?$/
  const body = text.trim().replace(tail, '')
  const marker = /매\s*주|주마다|(?<=[월화수목금토일]|요일)마다/
  const weeklyMarker = marker.test(body)
  // One-off date words mean a dated plan, not a timetable.
  if (!weeklyMarker && /오늘|내일|모레|이번\s*주|다음\s*주|\d+\s*(?:월(?!요일)|일(?!정))|\d{4}-\d{2}-\d{2}/.test(body)) return null
  const clauses = body.replace(new RegExp(marker.source, 'g'), ' ').split(/[,，]/).map(clause => clause.trim()).filter(Boolean)
  // "화, 목 9-18" lists days across a comma; carry a day-only clause into the next one.
  const merged: string[] = []
  for (const clause of clauses) {
    const previous = merged.at(-1)
    if (previous && new RegExp(`^${DAYS}$`).test(previous)) merged[merged.length - 1] = `${previous}/${clause}`
    else merged.push(clause)
  }
  const ranges: { days: string; inherited: boolean; time: NonNullable<ReturnType<typeof readSpokenTimeRange>>; lead: string; trail: string }[] = []
  for (const clause of merged) {
    const dated = new RegExp(`^(.*?)(?<![가-힣\\d])(${DAYS})(?:\\s*에)?\\s*(?=\\d|오전|오후|저녁|밤)(.+)$`).exec(clause)
    // "수요일 10~12 컴보안, 14~16 졸작": a clause that starts at a time keeps the previous clause's weekdays.
    const range = dated ?? (ranges.length ? /^(.*?)(?<![가-힣\d])()(?=(?:오전|오후|저녁|밤)?\s*\d)(.+)$/.exec(clause) : null)
    if (!range) return null
    const time = readSpokenTimeRange(range[3], { bare: true })
    if (!time || !range[3].startsWith(time.range)) return null
    const trail = range[3].slice(time.range.length).replace(/^\s*(?:에|동안)?\s*/, '').trim()
    ranges.push({ days: dated ? range[2] : ranges.at(-1)!.days, inherited: !dated, time, lead: range[1].trim(), trail })
  }
  const titles = ranges.map(range => range.lead || range.trail)
  if (titles.some(title => /\d|요일|[,，]/.test(title))) return null
  // A shared title sits before the first weekday or after the last range; anything in between is a different schedule.
  const shared = titles.filter(Boolean).length === 1 && ranges.every((range, index) => (!range.lead || index === 0) && (!range.trail || index === ranges.length - 1))
  // Each clause may carry its own title only when it is clearly a timetable; 회의/병원 lists stay one-off plans.
  const perClause = ranges.length > 1 && titles.every(Boolean) && (weeklyMarker || titles.every(title => TIMETABLE.test(title)))
  if (!shared && !perClause) return null
  const sharedTitle = titles.find(Boolean)!
  const dayCount = ranges.reduce((count, range) => count + (range.inherited ? 0 : [...range.days.matchAll(new RegExp(DAY, 'g'))].length), 0)
  if (!weeklyMarker && dayCount < 2) return null
  const items: ScheduleAnalysis['items'] = []
  for (const [index, { days, time }] of ranges.entries()) {
    const title = perClause ? titles[index] : sharedTitle
    for (const [day] of days.matchAll(new RegExp(DAY, 'g'))) {
      const date = parseKoreanDate(day.length === 1 ? `${day}요일` : day, today)
      if (!date) return null
      items.push({ id: `weekly-${items.length + 1}`, type: 'event', source: 'rule', confidence: 1,
        draft: { title, date, startTime: time.startTime, endTime: time.endTime, dueDate: null, endDate: null, categoryId: null },
        evidence: { date: day, startTime: time.evidenceStart, endTime: time.evidenceEnd, dueDate: null, endDate: null },
        categoryReason: null, uncertainties: time.estimated ? [{ field: 'endTime', reason: `${time.startTime}–${time.endTime}로 추정했어요. 오전·오후와 소요시간 ${time.durationMinutes}분을 확인해 주세요.` }] : !time.endTime ? [{ field: 'endTime', reason: '자정을 넘는지 확인하고 종료 날짜와 시각을 입력해 주세요.' }] : [],
      })
    }
  }
  if (items.length < 1 || items.length > 20) return null
  return validateScheduleAnalysis({ version: 1, route: 'parser', items, relations: [], warnings: ['명시된 요일·시간 범위를 규칙으로 읽었어요. 첫 날짜, 종료 시각과 매주 반복을 확인해 주세요.'] }, { text })
}
