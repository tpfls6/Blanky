import { isoWeekday, normalizeRepeatDays, repeatsOn } from '../../../packages/types/src/recurrence.ts'
import type { WorkItem } from '../../types/work.ts'
import { firstOccurrence, groupSeries, nextOccurrence, segmentAt, type SeriesGroup } from './seriesEdit.ts'

export type SeriesFilter = 'active' | 'ended' | 'all'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

export function repeatSummary(item: WorkItem): string {
  if (item.repeat === 'daily') return '매일'
  if (item.repeat === 'monthly') return `매월 ${Number(item.date.slice(8))}일`
  if (item.repeat !== 'weekly') return '반복 없음'
  const days = normalizeRepeatDays(item.repeatDays)
  const list = days.length ? days : [isoWeekday(item.date)]
  if (list.length === 7) return '매주 매일'
  if (list.join() === '1,2,3,4,5') return '매주 평일'
  if (list.join() === '6,7') return '매주 주말'
  return `매주 ${list.map(day => WEEKDAYS[day - 1]).join('·')}`
}

export function timeSummary(item: Pick<WorkItem, 'startTime' | 'endTime' | 'allDay' | 'kind'>): string {
  if (item.startTime && item.endTime) return `${item.startTime}–${item.endTime}`
  if (item.startTime) return item.startTime
  return item.kind === 'event' ? '종일' : '시간 없음'
}

/** Next occurrence on or after `today`, or null once the series has ended. */
export function upcomingOccurrence(item: WorkItem, today: string): string | null {
  if (today <= item.date) return firstOccurrence(item)
  return repeatsOn(item, today) ? today : nextOccurrence(item, today)
}

export function isEnded(item: WorkItem, today: string): boolean {
  return Boolean(item.repeatUntil && item.repeatUntil < today) || upcomingOccurrence(item, today) === null
}

/** Next occurrence of the whole series; a one-off exception on a day counts as that day's occurrence. */
export function groupUpcoming(group: SeriesGroup, today: string): string | null {
  const dates = [
    ...group.segments.map(row => upcomingOccurrence(row, today)),
    ...group.exceptions.map(row => row.date >= today ? row.date : null),
  ].filter((day): day is string => Boolean(day))
  return dates.sort()[0] ?? null
}

export function groupEnded(group: SeriesGroup, today: string): boolean {
  return group.segments.every(row => isEnded(row, today)) && !group.exceptions.some(row => row.date >= today)
}

/** The segment users think of as "the series now": the one running today, else the next, else the last. */
export function currentSegment(group: SeriesGroup, today: string): WorkItem {
  const next = group.segments.map(row => ({ row, day: upcomingOccurrence(row, today) })).filter(entry => entry.day).sort((a, b) => a.day!.localeCompare(b.day!))[0]
  return next?.row ?? segmentAt(group, today)
}

export type SeriesPeriod = { start: string; end: string | null }

export function groupPeriod(group: SeriesGroup): SeriesPeriod {
  const last = group.segments.at(-1)!
  return { start: group.segments[0].date, end: last.repeatUntil ?? null }
}

function sameRule(a: WorkItem, b: WorkItem): boolean {
  return repeatSummary(a) === repeatSummary(b) && timeSummary(a) === timeSummary(b) && a.title === b.title && a.categoryId === b.categoryId
}

/** Rule changes along the way. A period that only resumes after a single-day change is not one. */
export function ruleChanges(group: SeriesGroup): number {
  return group.segments.filter((row, index) => index > 0 && !sameRule(group.segments[index - 1], row)).length
}

/** What changed along the way, in words: "규칙 변경 1회 · 개별 변경 2건". */
export function groupChanges(group: SeriesGroup): string | null {
  const rules = ruleChanges(group)
  const parts = [
    rules ? `규칙 변경 ${rules}회` : '',
    group.exceptions.length ? `개별 변경 ${group.exceptions.length}건` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export function listRecurring(items: WorkItem[], today: string, filter: SeriesFilter, query = ''): SeriesGroup[] {
  const text = query.trim().toLocaleLowerCase('ko')
  return groupSeries(items)
    .filter(group => filter === 'all' || (filter === 'ended') === groupEnded(group, today))
    .filter(group => !text || [...group.segments, ...group.exceptions].some(row => row.title.toLocaleLowerCase('ko').includes(text)))
    .map(group => ({ group, next: groupUpcoming(group, today) ?? '9999-12-31', current: currentSegment(group, today) }))
    .sort((a, b) => a.next.localeCompare(b.next) || (a.current.startTime ?? '').localeCompare(b.current.startTime ?? '') || a.current.title.localeCompare(b.current.title, 'ko'))
    .map(row => row.group)
}
