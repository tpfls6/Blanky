import { parseScheduleText } from '../../../packages/parse/src/parse.ts'
import { routeInput, PlannerRequiredError } from '../../../packages/parse/src/intentRouter.ts'
import { addDays, formatISODate } from '../../../packages/utils/src/date.ts'
import { isGoogleOriginWork } from '../../services/calendarSync/origin.ts'
import type { WorkItem, WorkPatch, WorkspaceCategory } from '../../types/work.ts'

export type DedupeScope = { start?: string; end?: string; titles?: string[]; openEnd?: boolean }

export type ConflictScope = { start: string; end: string; weekday?: number; keepTitles?: string[]; dropTitles?: string[] }

export type ConversationPending =
  | ({ kind: 'dedupe' } & DedupeScope)
  | ({ kind: 'conflicts' } & ConflictScope)
  | { kind: 'clarify' }
  | null

export type Intent =
  | { type: 'create'; text: string }
  | { type: 'list'; date: string; endDate?: string }
  | { type: 'update'; item: WorkItem; patch: WorkPatch }
  | { type: 'delete'; item: WorkItem }
  | ({ type: 'dedupe' } & DedupeScope)
  | ({ type: 'conflicts' } & ConflictScope)
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

function mentionedTitles(text: string, items: readonly WorkItem[]): string[] {
  return [...new Set(items.map(item => item.title))].filter(title => title && text.includes(title))
}

function afterDay(text: string, today: Date): { start?: string; openEnd?: boolean } {
  const match = /(\d{1,2})\s*일\s*이후/.exec(text)
  if (!match) return {}
  const day = Number(match[1])
  if (day < 1 || day > 31) return {}
  const year = today.getFullYear()
  const month = today.getMonth()
  let candidate = new Date(year, month, day)
  if (candidate.getDate() !== day) return {}
  if (formatISODate(candidate) < formatISODate(today)) candidate = new Date(year, month + 1, day)
  if (candidate.getDate() !== day) return {}
  return { start: formatISODate(candidate), openEnd: true }
}

function keepOne(text: string) {
  return /(하나만\s*남겨|하나만\s*남기|시간대별로\s*하나만|나머진?\s*삭제|keep one|leave one)/i.test(text)
}

function weekdayOf(text: string): number | undefined {
  const names: [RegExp, number][] = [
    [/월요일|monday/i, 1], [/화요일|tuesday/i, 2], [/수요일|wednesday/i, 3],
    [/목요일|thursday/i, 4], [/금요일|friday/i, 5], [/토요일|saturday/i, 6], [/일요일|sunday/i, 7],
  ]
  return names.find(([pattern]) => pattern.test(text))?.[1]
}

function copiesTalk(text: string) {
  return /(두\s*개씩|두개씩|시간대별로)/.test(text)
}

function overlapTalk(text: string) {
  return /(겹치|같은 시간|같은 시간대|overlap|conflict)/i.test(text)
}

function keepDrop(text: string, items: readonly WorkItem[]): { keepTitles?: string[]; dropTitles?: string[] } {
  const titles = mentionedTitles(text, items)
  const keepHit = /(.+?)만\s*남기/.exec(text)
  const dropHit = /(.+?)(?:은|는)?\s*지워/.exec(text)
  const keepTitles = keepHit ? titles.filter(title => keepHit[1].includes(title)) : undefined
  const dropTitles = dropHit ? titles.filter(title => dropHit[1].includes(title) && !keepHit?.[1].includes(title)) : undefined
  return {
    keepTitles: keepTitles?.length ? keepTitles : undefined,
    dropTitles: dropTitles?.length ? dropTitles : undefined,
  }
}

function windowFrom(text: string, today: Date, pending: ConversationPending): { start: string; end: string; weekday?: number } {
  const weekday = weekdayOf(text)
  const after = afterDay(text, today)
  const prior = pending && pending.kind === 'conflicts' ? pending : null
  let start = after.start ?? prior?.start ?? formatISODate(today)
  if (weekday) {
    let day = parseDay(start)
    for (let step = 0; step < 7; step++) {
      const iso = formatISODate(day)
      if (isoWeekdayFromDate(day) === weekday) { start = iso; break }
      day = addDays(day, 1)
    }
  }
  const end = prior?.end ?? formatISODate(addDays(parseDay(start), /앞으로/.test(text) ? 84 : 56))
  return { start, end, weekday: weekday ?? prior?.weekday }
}

function isoWeekdayFromDate(date: Date): number {
  return date.getDay() || 7
}

function wantsConflicts(text: string, titles: readonly string[], items: readonly WorkItem[], pending: ConversationPending): boolean {
  if (titles.length >= 2 && copiesTalk(text) && !overlapTalk(text)) return false
  // Conflicts are overlaps between different titles. A generic "keep one" while the named titles
  // really have same-title copies is a duplicate cleanup, unless the user picks a title to keep.
  const copied = titles.some(title => items.filter(item => item.title === title).length > 1)
  if (copied && (keepOne(text) || /(중복|버그|duplicate|bug)/i.test(text)) && !keepDrop(text, items).keepTitles) return false
  if (/(겹치|overlap|conflict)/i.test(text) && /(찾아|알려|보여|정리|find|show)/i.test(text)) return true
  if (overlapTalk(text) && titles.length >= 2) return true
  if (titles.length >= 2 && keepOne(text) && !copiesTalk(text)) return true
  if (keepDrop(text, []).keepTitles || /만\s*남기고/.test(text) && /지워/.test(text)) return true
  if (pending?.kind === 'conflicts' && /(남기|지워|삭제|그중|유지)/.test(text)) return true
  return false
}

function wantsDedupe(text: string, pending: ConversationPending): boolean {
  if (pending?.kind === 'conflicts') return false
  if (/(중복|duplicate)/i.test(text) && (/(삭제|지워|정리|빼|남겨|남기|remove|delete|keep|leave)/i.test(text) || /이야|입니다|예요/.test(text))) return true
  if (keepOne(text)) return true
  if (/(겹치|overlap|conflict)/i.test(text) && /(남겨|남기|삭제|지워|정리|remove|delete)/i.test(text)) return true
  if (/일정만\s*정리/.test(text)) return true
  if (pending && /(남겨|남기|삭제|지워|정리|그중|시간대별|만 정리|이후 것만|두\s*개만|remove|delete)/i.test(text)) return true
  return false
}

function dedupeFrom(text: string, items: readonly WorkItem[], today: Date, pending: ConversationPending): Intent {
  const range = afterDay(text, today)
  const titles = mentionedTitles(text, items)
  const prior = pending && pending.kind === 'dedupe' ? pending : null
  return {
    type: 'dedupe',
    start: range.start ?? prior?.start,
    end: prior?.end,
    openEnd: range.openEnd || prior?.openEnd,
    titles: titles.length ? titles : prior?.titles,
  }
}

/** Route commands; all date/time interpretation stays in the existing parser. */
export function conversationIntent(text: string, items: WorkItem[], lastId: string | null, today: Date, categories: WorkspaceCategory[], pending: ConversationPending = null): Intent {
  const route = routeInput(text)
  const titles = mentionedTitles(text, items)
  if (wantsConflicts(text, titles, items, pending)) {
    const window = windowFrom(text, today, pending)
    const choice = keepDrop(text, items)
    const prior = pending && pending.kind === 'conflicts' ? pending : null
    return {
      type: 'conflicts',
      start: window.start,
      end: window.end,
      weekday: window.weekday,
      keepTitles: choice.keepTitles ?? prior?.keepTitles,
      dropTitles: choice.dropTitles ?? prior?.dropTitles,
    }
  }
  if (wantsDedupe(text, pending)) return dedupeFrom(text, items, today, pending)
  if (route.route === 'reschedule') return { type: 'reply', text: '자동 재배치는 준비 중이에요. 기존 일정은 변경하지 않았어요.' }
  if (route.route === 'planner') return { type: 'reply', text: new PlannerRequiredError().message }
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
        ? { dueDate: parsed.draft.dueDate ?? parsed.draft.date, dueTime: parsed.draft.dueTime ?? null }
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
