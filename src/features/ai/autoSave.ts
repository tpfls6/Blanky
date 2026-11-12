import type { AnalysisItem, ScheduleAnalysis } from '../../../packages/types/src/ai.ts'
import { titlesMatch } from '../../../packages/scheduling/src/duplicates.ts'
import type { WorkInput, WorkItem } from '../../types/work.ts'
import { occursOn } from '../../utils/calendarMonth.ts'
import { requestedRule, reviewedWorkInput, withoutRepeatWords } from './review.ts'

/** A save request keeps its ids so a retry after an unknown failure cannot create a second copy. */
export type AutoSaveInput = WorkInput & { id: string }
/** `input` is set when the item is complete and only needs a yes (a conflict or an early hour). */
export type AutoSaveReview = { item: AnalysisItem; reasons: string[]; input?: AutoSaveInput }
export type AutoSavePlan = { ready: AutoSaveInput[]; review: AutoSaveReview[] }

const MERIDIEM = /오전|오후|아침|새벽|저녁|밤|낮|점심|정오|자정|\bam\b|\bpm\b|\d{1,2}:\d{2}/i

/** "3시" without 오전·오후 reads as 03:00; early hours are confirmed instead of saved at night. */
export function ambiguousHour(text: string, startTime: string | null): boolean {
  if (!startTime || MERIDIEM.test(text)) return false
  const hour = Number(startTime.slice(0, 2))
  return hour >= 1 && hour <= 6
}

function minutes(clock: string): number {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
}

function span(row: Pick<WorkInput, 'startTime' | 'endTime'>): [number, number] | null {
  if (!row.startTime) return null
  const start = minutes(row.startTime)
  const end = row.endTime && minutes(row.endTime) > start ? minutes(row.endTime) : start + 60
  return [start, end]
}

const kindLabel = (kind: WorkInput['kind']) => kind === 'task' ? '할 일' : '일정'

/** Same title and slot already saved, or a timed event that overlaps an existing one. */
export function saveConflicts(input: WorkInput, existing: readonly WorkItem[]): string[] {
  const reasons: string[] = []
  const day = input.kind === 'task' ? input.dueDate ?? input.date : input.date
  for (const item of existing) {
    if (item.kind !== input.kind || !titlesMatch(item.title, input.title)) continue
    const sameDay = item.kind === 'task' ? (input.undated ? !!item.undated : !item.undated && (item.dueDate ?? item.date) === day) : occursOn(item, input.date)
    if (sameDay && (item.startTime ?? null) === (input.startTime ?? null)) {
      reasons.push(`이미 같은 ${kindLabel(input.kind)} '${item.title}'이 있어요.`)
      return reasons
    }
  }
  const mine = input.kind === 'event' ? span(input) : null
  if (!mine) return reasons
  for (const item of existing) {
    if (item.kind !== 'event' || titlesMatch(item.title, input.title) || !occursOn(item, input.date)) continue
    const other = span(item)
    if (other && mine[0] < other[1] && other[0] < mine[1]) {
      reasons.push(`'${item.title}'(${item.startTime}${item.endTime ? '–' + item.endTime : ''})과 시간이 겹쳐요.`)
      break
    }
  }
  return reasons
}

/** Clear items save at once; ambiguous, failing or conflicting ones wait for confirmation. */
export function planAutoSave(analysis: ScheduleAnalysis, text: string, existing: readonly WorkItem[], categoryIds: string[], preferredKind?: 'event' | 'task', makeId: () => string = () => crypto.randomUUID()): AutoSavePlan {
  const ready: AutoSaveInput[] = []
  const review: AutoSaveReview[] = []
  const seen = new Set<string>()
  for (const analysed of analysis.items) {
    const item = preferredKind && analysis.items.length === 1 ? { ...analysed, type: preferredKind } : analysed
    const reasons = item.uncertainties.filter(entry => entry.field !== 'categoryId').map(entry => entry.reason)
    let input: WorkInput | null = null
    if (!reasons.length) {
      try {
        const rule = requestedRule(text, item, analysis.items.length === 1)
        const title = rule.repeat === 'none' ? item.draft.title : withoutRepeatWords(item.draft.title)
        // A repeating item without a date starts on the first day the rule fires.
        const date = item.draft.date ?? (rule.repeat !== 'none' ? rule.start : null)
        input = reviewedWorkInput(item, { ...item.draft, title, date, ...(rule.repeat !== 'none' ? { dueDate: null, dueTime: null } : {}) }, false, categoryIds, rule.repeat, rule.repeatDays, false, false, rule)
      } catch (error) {
        reasons.push(error instanceof Error ? error.message : '내용을 확인해 주세요.')
      }
    }
    if (input && ambiguousHour(text, input.startTime ?? null)) reasons.push(`${input.startTime}(오전)로 이해했어요. 오후라면 시간을 고쳐 주세요.`)
    if (input) {
      const identity = JSON.stringify([input.kind, input.title.replace(/\s/g, '').toLowerCase(), input.date, input.dueDate, input.startTime])
      if (seen.has(identity)) reasons.push('같은 요청 안에서 중복된 항목이에요.')
      seen.add(identity)
      reasons.push(...saveConflicts(input, existing))
    }
    if (!input) review.push({ item, reasons })
    else if (reasons.length) review.push({ item, reasons, input: { ...input, id: makeId() } })
    else ready.push({ ...input, id: makeId() })
  }
  return { ready, review }
}

/** Analysis limited to the items still waiting, with our own reasons shown as checks. */
export function reviewAnalysis(analysis: ScheduleAnalysis, review: readonly AutoSaveReview[]): ScheduleAnalysis {
  const ids = new Set(review.map(row => row.item.id))
  return {
    ...analysis,
    items: review.map(row => ({ ...row.item, uncertainties: [...row.item.uncertainties, ...row.reasons.filter(reason => !row.item.uncertainties.some(entry => entry.reason === reason)).map(reason => ({ field: 'title' as const, reason }))] })),
    relations: analysis.relations.filter(relation => ids.has(relation.fromId) && ids.has(relation.toId)),
  }
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const REPEAT_LABEL: Record<string, string> = { daily: '매일', weekly: '매주', monthly: '매달' }

/** One chip line: date, time and repeat in the fewest words. */
export function chipDetail(item: Pick<WorkItem, 'kind' | 'date' | 'startTime' | 'endTime' | 'dueDate' | 'dueTime' | 'repeat' | 'repeatDays' | 'undated'>, today: Date = new Date()): string {
  // Only a day outside the current year shows its year: "2027/1/5(화)".
  const day = (iso: string) => {
    const [year, month, date] = iso.split('-').map(Number)
    return `${year !== today.getFullYear() ? `${year}/` : ''}${month}/${date}(${WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()]})`
  }
  const parts: string[] = []
  if (item.kind === 'task' && item.dueDate) parts.push(`${day(item.dueDate)}${item.dueTime ? ' ' + item.dueTime : ''}까지`)
  else if (item.undated) parts.push('날짜 없음')
  else parts.push(day(item.date))
  if (item.startTime) parts.push(item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime)
  else if (item.kind === 'event') parts.push('종일')
  if (item.repeat && item.repeat !== 'none') {
    const days = item.repeat === 'weekly' && item.repeatDays?.length ? ' ' + item.repeatDays.map(index => WEEKDAYS[index % 7]).join('·') : ''
    parts.push(REPEAT_LABEL[item.repeat] + days)
  }
  return parts.join(' · ')
}
