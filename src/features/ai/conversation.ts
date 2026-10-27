import { parseScheduleText } from '../../../packages/parse/src/parse.ts'
import { routeInput, PlannerRequiredError } from '../../../packages/parse/src/intentRouter.ts'
import { addDays, formatISODate } from '../../../packages/utils/src/date.ts'
import { isGoogleOriginWork } from '../../services/calendarSync/origin.ts'
import type { WorkItem, WorkPatch, WorkspaceCategory } from '../../types/work.ts'

export type Intent =
  | { type: 'create'; text: string }
  | { type: 'list'; date: string; endDate?: string }
  | { type: 'update'; item: WorkItem; patch: WorkPatch }
  | { type: 'delete'; item: WorkItem }
  | { type: 'dedupe' }
  | { type: 'conflicts'; start: string; end: string }
  | { type: 'summarize'; start: string; end: string }
  | { type: 'move_incomplete'; from: string; to: string }
  | { type: 'reply'; text: string }

const DATE_CUE = /오늘|내일|모레|어제|요일|today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|next week/i
const WEEK = /이번\s*주|다음\s*주|this week|next week/i
const WEEKDAY = /[일월화수목금토]요일|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i

function matchItems(text: string, items: WorkItem[], lastId: string | null, date: string | null): WorkItem[] {
  const referring = /(그거|그것|방금|이 일정|이 할 일)|(?:\bthat\b|\bit\b)/i.test(text)
  let matches = referring ? items.filter(item => item.id === lastId) : items.filter(item => text.includes(item.title))
  if (!referring && DATE_CUE.test(text) && date) {
    const onDate = matches.filter(item => item.date === date)
    if (onDate.length) matches = onDate
  }
  return matches
}

function weekSpan(text: string, date: string, today: Date): { start: string; end?: string } {
  if (!WEEK.test(text) || WEEKDAY.test(text)) return { start: date }
  const next = /다음\s*주|next week/i.test(text)
  const start = formatISODate(next ? addDays(mondayOf(today), 7) : mondayOf(today))
  return { start, end: formatISODate(addDays(parseDay(start), 6)) }
}

function mondayOf(date: Date): Date {
  const day = date.getDay()
  return addDays(date, day === 0 ? -6 : 1 - day)
}

function parseDay(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Route commands; all date/time interpretation stays in the existing parser. */
export function conversationIntent(text: string, items: WorkItem[], lastId: string | null, today: Date, categories: WorkspaceCategory[]): Intent {
  const route = routeInput(text)
  if (route.route === 'reschedule') return { type: 'reply', text: '자동 재배치는 준비 중이에요. 기존 일정은 변경하지 않았어요.' }
  if (route.route === 'planner') return { type: 'reply', text: new PlannerRequiredError().message }
  if (/(중복|duplicate)/i.test(text) && /(삭제|지워|정리|빼|remove|delete)/i.test(text)) return { type: 'dedupe' }
  if (/(겹치|overlap|conflict)/i.test(text) && /(찾아|알려|보여|정리|find|show)/i.test(text)) {
    const parsed = parseScheduleText(text, { today, categories })
    const span = weekSpan(text, parsed.draft.date ?? formatISODate(today), today)
    return { type: 'conflicts', start: span.start, end: span.end ?? span.start }
  }
  if (/(어제|yesterday).*(못한|안 한|미완료|unfinished|incomplete)|(못한 일).*(내일|tomorrow)/i.test(text)) {
    return { type: 'move_incomplete', from: formatISODate(addDays(today, -1)), to: formatISODate(addDays(today, 1)) }
  }
  if (route.route === 'ai') {
    if (/(바꿔|변경|미뤄|수정해|완료해|완료 처리|삭제|지워|뭐 있어|보여|알려|조회|delete|move)/i.test(text)) {
      return { type: 'reply', text: '여러 항목의 변경이나 조회는 각각 요청해 주세요. 복합 입력 분석은 새 일정과 할 일 추가를 지원해요.' }
    }
    return { type: 'create', text: text.replace(/\s*(?:추가해\s*줘|추가해줘|추가|등록해줘|add(?:\s+it)?)\s*[.!?]?$/i, '').trim() }
  }
  const parsed = parseScheduleText(text, { today, categories })
  if (/(할\s*일).*(정리|요약)|summarize|organize (?:my )?tasks/i.test(text) && !/(계획|짜|재배치|plan )/i.test(text)) {
    const span = weekSpan(text, parsed.draft.date ?? formatISODate(today), today)
    return { type: 'summarize', start: span.start, end: span.end ?? span.start }
  }
  if (/(정리해|시간 찾아|추천|재배치)/.test(text)) return { type: 'reply', text: '자동 정리와 빈 시간 추천은 준비 중이에요. 일정 조회, 추가, 시간 변경, 할 일 완료를 도와드릴 수 있어요.' }
  if (/(뭐 있어|보여|알려|조회|what do i have|show (?:me )?(?:my )?(?:schedule|events)|list)/i.test(text)) {
    const span = weekSpan(text, parsed.draft.date ?? '', today)
    return { type: 'list', date: span.start, endDate: span.end }
  }
  if (/(바꿔|변경|미뤄|미뤄줘|수정해|완료해|완료 처리|옮겨|늦춰|move|reschedule|change|push)/i.test(text)) {
    const matches = matchItems(text, items, lastId, parsed.draft.date)
    if (matches.length !== 1) return { type: 'reply', text: matches.length ? '같은 이름이 여러 개예요. 날짜와 제목을 함께 입력해 주세요.' : '변경할 항목을 찾지 못했어요. 정확한 제목을 알려 주세요.' }
    const item = matches[0]
    if (/완료|mark(?: it)? done|complete/i.test(text)) return { type: 'update', item, patch: { status: 'done' } }
    const rename = /제목(?:을)?\s*["“]?(.+?)["”]?(?:으로|로)\s*(?:바꿔|변경)/.exec(text)
    if (rename) return { type: 'update', item, patch: { title: rename[1].trim() } }
    const relative = /(?:(\d+)\s*시간|한\s*시간|(\d+)\s*hours?)\s*(?:뒤로|늦춰|later)/i.exec(text)
    let start = parsed.draft.startTime
    if (relative && item.startTime) {
      const [h, m] = item.startTime.split(':').map(Number)
      const minutes = h * 60 + m + Number(relative[1] ?? relative[2] ?? 1) * 60
      if (minutes >= 1440) return { type: 'reply', text: '자정을 넘는 변경은 날짜와 시간을 직접 지정해 주세요.' }
      start = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    }
    if (!start && DATE_CUE.test(text) && parsed.draft.date) {
      return { type: 'update', item, patch: item.kind === 'task' && /마감|까지|due/i.test(text)
        ? { dueDate: parsed.draft.dueDate ?? parsed.draft.date }
        : { date: parsed.draft.date } }
    }
    if (!start) return { type: 'reply', text: '변경할 시간을 알려 주세요. 예: 그거 오후 5시로 바꿔줘' }
    if (!/(오전|오후|저녁|밤|\d{1,2}:\d{2}|am|pm)/i.test(text) && item.startTime && Number(item.startTime.slice(0, 2)) >= 12 && Number(start.slice(0, 2)) < 12) start = `${Number(start.slice(0, 2)) + 12}${start.slice(2)}`
    const duration = item.duration ?? 60
    const [h, m] = start.split(':').map(Number)
    const end = h * 60 + m + duration
    if (end >= 1440) return { type: 'reply', text: '종료 시간이 자정을 넘어요. 다른 시간을 지정해 주세요.' }
    return { type: 'update', item, patch: { startTime: start, endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`, duration, allDay: false,
      ...(DATE_CUE.test(text) && parsed.draft.date ? { date: parsed.draft.date } : {}) } }
  }
  if (/(삭제|지워|빼줘|빼 줘|delete|remove)/i.test(text)) {
    const matches = matchItems(text, items, lastId, parsed.draft.date)
    if (matches.length !== 1) return { type: 'reply', text: matches.length ? '같은 이름이 여러 개예요. 어떤 항목을 지울지 알려 주세요.' : '삭제할 항목을 찾지 못했어요. 정확한 제목을 알려 주세요.' }
    if (isGoogleOriginWork(matches[0])) return { type: 'reply', text: 'Google에서 가져온 일정은 원본을 지우지 않았어요. 캘린더 권한을 확인해 주세요.' }
    return { type: 'delete', item: matches[0] }
  }
  if (text.endsWith('?')) return { type: 'reply', text: '일정 조회, 추가, 시간 변경, 할 일 완료를 요청해 주세요.' }
  return { type: 'create', text: text.replace(/\s*(?:추가해\s*줘|추가해줘|추가|등록해줘|add(?:\s+it)?)\s*[.!?]?$/i, '').trim() }
}
