import { isoWeekday, normalizeRepeatDays, repeatsOn } from '../../../packages/types/src/recurrence.ts'
import type { WorkItem, WorkPatch } from '../../types/work.ts'

/**
 * Scoped edits of a recurring series without exception rows: a series is cut with
 * `repeatUntil` and continued as a new row, so one-off items and untouched series keep
 * their data exactly as before. `endDate` stays the multi-day span of each occurrence.
 * Rows split off a series carry `seriesId` (the original row's id) so they read as one series.
 */
export type SeriesScope = 'this' | 'future' | 'all'

export type SeriesChange = {
  remove?: WorkItem
  update?: { item: WorkItem; patch: WorkPatch }
  create?: WorkItem[]
}

/** Fields that only make sense for the whole rule; ignored for a single occurrence. */
const RULE_FIELDS = ['date', 'endDate', 'repeat', 'repeatDays', 'repeatUntil'] as const

// Monthly rules on the 29th–31st can skip up to two months; a year is plenty.
const SEARCH_DAYS = 400
const DAY = 86400000

// UTC noon arithmetic like recurrence.ts, so this module stays free of app aliases.
export function shiftISO(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10)
}

function daySpan(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY)
}

export function isRecurring(item: Pick<WorkItem, 'repeat'>): boolean {
  return Boolean(item.repeat) && item.repeat !== 'none'
}

export function nextOccurrence(item: WorkItem, after: string): string | null {
  let day = shiftISO(after, 1)
  for (let step = 0; step < SEARCH_DAYS; step++) {
    if (item.repeatUntil && day > item.repeatUntil) return null
    if (repeatsOn(item, day)) return day
    day = shiftISO(day, 1)
  }
  return null
}

export function firstOccurrence(item: WorkItem): string | null {
  return repeatsOn(item, item.date) ? item.date : nextOccurrence(item, item.date)
}

/** Occurrence start dates in [from, to], at most `limit`. */
export function occurrencesBetween(item: WorkItem, from: string, to: string, limit = 60): string[] {
  const days: string[] = []
  let day = from < item.date ? item.date : from
  const last = item.repeatUntil && item.repeatUntil < to ? item.repeatUntil : to
  while (day <= last && days.length < limit) {
    if (repeatsOn(item, day)) days.push(day)
    day = shiftISO(day, 1)
  }
  return days
}

/** Legacy weekly rows repeat on the start weekday; freeze it before the start date moves. */
function ruleAt(item: WorkItem, date: string): Pick<WorkItem, 'date' | 'endDate' | 'repeatDays'> {
  const span = item.endDate && item.endDate > item.date ? daySpan(item.date, item.endDate) : 0
  return {
    date,
    endDate: span ? shiftISO(date, span) : null,
    repeatDays: item.repeat === 'weekly' && !item.repeatDays?.length ? [isoWeekday(item.date)] : item.repeatDays ?? [],
  }
}

/** A new row for the same calendar and series; commitWork normalizes it like any other save. */
function copy(item: WorkItem, fields: Partial<WorkItem>): WorkItem | null {
  const next = { ...item, ...fields, id: crypto.randomUUID(), seriesId: item.seriesId ?? item.id }
  if (next.repeatUntil && next.repeatUntil < next.date) return null
  delete next.changeSource
  return { ...next, repeatDays: next.repeat === 'weekly' ? normalizeRepeatDays(next.repeatDays) : [], repeatUntil: next.repeat === 'none' ? null : next.repeatUntil ?? null }
}

function withoutRuleFields(patch: WorkPatch): WorkPatch {
  const rest = { ...patch }
  for (const key of RULE_FIELDS) delete rest[key]
  return rest
}

/** Keeps the multi-day span when a whole-series edit moves the start date. */
function seriesPatch(item: WorkItem, patch: WorkPatch): WorkPatch {
  if (!patch.date || patch.date === item.date || 'endDate' in patch) return patch
  const moved = ruleAt(item, patch.date)
  return { ...patch, ...moved, repeatDays: patch.repeatDays ?? moved.repeatDays }
}

export function planSeriesDelete(item: WorkItem, selected: string, scope: SeriesScope): SeriesChange {
  const first = firstOccurrence(item)
  if (!isRecurring(item) || scope === 'all' || !first) return { remove: item }
  if (scope === 'future') return selected <= first ? { remove: item } : { update: { item, patch: { repeatUntil: shiftISO(selected, -1) } } }
  const next = nextOccurrence(item, selected)
  if (selected <= first) return next ? { update: { item, patch: ruleAt(item, next) } } : { remove: item }
  const rest = next ? copy(item, ruleAt(item, next)) : null
  return { update: { item, patch: { repeatUntil: shiftISO(selected, -1) } }, create: rest ? [rest] : [] }
}

export function planSeriesPatch(item: WorkItem, selected: string, scope: SeriesScope, patch: WorkPatch): SeriesChange {
  const first = firstOccurrence(item)
  if (!isRecurring(item) || scope === 'all' || !first) return { update: { item, patch: seriesPatch(item, patch) } }
  if (scope === 'future') {
    const fields = { ...patch, ...ruleAt(item, selected), ...(patch.repeatDays ? { repeatDays: patch.repeatDays } : {}) }
    if (selected <= first) return { update: { item, patch: fields } }
    const rest = copy(item, { ...fields, repeatUntil: 'repeatUntil' in patch ? patch.repeatUntil : item.repeatUntil })
    return { update: { item, patch: { repeatUntil: shiftISO(selected, -1) } }, create: rest ? [rest] : [] }
  }
  const single = copy(item, { ...withoutRuleFields(patch), ...ruleAt(item, selected), repeat: 'none', repeatDays: [], repeatUntil: null })
  const without = planSeriesDelete(item, selected, 'this')
  return { ...without, create: [...(without.create ?? []), ...(single ? [single] : [])] }
}

// --- Whole series: the original row plus everything split off it ---

export type SeriesGroup = {
  /** The original row's id, shared by every split row as `seriesId`. */
  key: string
  /** Recurring rows, oldest first. Together they are the series' rule over time. */
  segments: WorkItem[]
  /** One-off rows made by "this occurrence only" edits. */
  exceptions: WorkItem[]
}

export function seriesKey(item: Pick<WorkItem, 'id' | 'seriesId'>): string {
  return item.seriesId ?? item.id
}

/** Groups recurring rows by series; exceptions whose series has no recurring row left are ordinary one-offs. */
export function groupSeries(items: readonly WorkItem[]): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>()
  for (const item of items) {
    if (!isRecurring(item) && !item.seriesId) continue
    const key = seriesKey(item)
    const group = groups.get(key) ?? { key, segments: [], exceptions: [] }
    if (isRecurring(item)) group.segments.push(item)
    else group.exceptions.push(item)
    groups.set(key, group)
  }
  const byDate = (a: WorkItem, b: WorkItem) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  return [...groups.values()].filter(group => group.segments.length).map(group => ({ ...group, segments: group.segments.sort(byDate), exceptions: group.exceptions.sort(byDate) }))
}

export function groupMembers(group: SeriesGroup): WorkItem[] {
  return [...group.segments, ...group.exceptions]
}

/** The recurring row that owns `date`, else the latest one starting on or before it. */
export function segmentAt(group: SeriesGroup, date: string): WorkItem {
  return group.segments.find(row => repeatsOn(row, date)) ?? [...group.segments].reverse().find(row => row.date <= date) ?? group.segments[0]
}

const EXCEPTION_FIELDS = ['title', 'description', 'categoryId'] as const

function pick(patch: WorkPatch, keys: readonly (keyof WorkPatch)[]): WorkPatch {
  return Object.fromEntries(keys.filter(key => key in patch).map(key => [key, patch[key]])) as WorkPatch
}

function sharedFields(patch: WorkPatch): WorkPatch {
  const rest = { ...patch }
  delete rest.date
  delete rest.endDate
  delete rest.repeatUntil
  return rest
}

/**
 * A series-level end date: rows starting after it go away, the rest are capped.
 * The last segment takes the end as given, including null (open-ended again).
 */
function endChange(row: WorkItem, patch: WorkPatch, last: boolean): { remove: WorkItem } | WorkPatch {
  if (!('repeatUntil' in patch)) return {}
  const until = patch.repeatUntil ?? null
  if (until && row.date > until) return { remove: row }
  if (!isRecurring(row)) return {}
  if (last) return { repeatUntil: until }
  return until && (!row.repeatUntil || row.repeatUntil > until) ? { repeatUntil: until } : {}
}

/** Edits a whole series: 'future' also reaches later split rows, 'all' reaches every row. */
export function planGroupPatch(group: SeriesGroup, selected: string, scope: SeriesScope, patch: WorkPatch): SeriesChange[] {
  const current = segmentAt(group, selected)
  const members = groupMembers(group)
  if (scope === 'this' || members.length === 1) return [planSeriesPatch(current, selected, scope, patch)]
  const last = group.segments.at(-1)!
  const shared = sharedFields(patch)
  const changes: SeriesChange[] = []
  for (const row of members) {
    if (scope === 'future' && (isRecurring(row) ? row !== current && row.date <= current.date : row.date < selected)) continue
    const end = endChange(row, patch, row === last)
    if ('remove' in end) { changes.push(end); continue }
    if (!isRecurring(row)) {
      const fields = pick(shared, EXCEPTION_FIELDS)
      if (Object.keys(fields).length) changes.push({ update: { item: row, patch: fields } })
      continue
    }
    const own: WorkPatch = { ...shared, ...end, ...(scope === 'all' && row === group.segments[0] && patch.date ? { date: patch.date } : {}) }
    if (scope === 'future' && row === current) changes.push(planSeriesPatch(row, selected, 'future', own))
    else if (Object.keys(own).length) changes.push({ update: { item: row, patch: seriesPatch(row, own) } })
  }
  return changes
}

/** Deletes from a whole series: 'future' drops later split rows too, 'all' drops every row. */
export function planGroupDelete(group: SeriesGroup, selected: string, scope: SeriesScope): SeriesChange[] {
  const current = segmentAt(group, selected)
  if (scope === 'all') return groupMembers(group).map(row => ({ remove: row }))
  if (scope === 'this') return [planSeriesDelete(current, selected, 'this')]
  return [
    planSeriesDelete(current, selected, 'future'),
    ...groupMembers(group)
      .filter(row => row !== current && (isRecurring(row) ? row.date > current.date : row.date >= selected))
      .map(row => ({ remove: row })),
  ]
}

/** The rows that would exist after the changes, for previews and tests. */
export function applySeriesChangeLocally(items: WorkItem[], changes: SeriesChange | SeriesChange[]): WorkItem[] {
  const list = Array.isArray(changes) ? changes : [changes]
  const removed = new Set(list.flatMap(change => change.remove ? [change.remove.id] : []))
  const patches = new Map(list.flatMap(change => change.update ? [[change.update.item.id, change.update.patch] as const] : []))
  return [
    ...items.flatMap(row => removed.has(row.id) ? [] : [{ ...row, ...patches.get(row.id) }]),
    ...list.flatMap(change => change.create ?? []),
  ]
}

export type PreviewRow = {
  date: string
  before: WorkItem | null
  after: WorkItem | null
  status: 'same' | 'changed' | 'added' | 'removed'
}

/** A one-off on that day wins over a series row, matching how a split leaves it. */
function occurrenceAt(rows: WorkItem[], date: string): WorkItem | null {
  return rows.find(row => !isRecurring(row) && repeatsOn(row, date)) ?? rows.find(row => repeatsOn(row, date)) ?? null
}

function sameOccurrence(left: WorkItem, right: WorkItem): boolean {
  return left.title === right.title && left.startTime === right.startTime && left.endTime === right.endTime
    && left.allDay === right.allDay && left.categoryId === right.categoryId && left.description === right.description
}

/** Upcoming occurrences before and after the changes, starting at `from`. */
export function previewSeriesChange(current: WorkItem | WorkItem[], changes: SeriesChange | SeriesChange[], from: string, count = 8): PreviewRow[] {
  const before = Array.isArray(current) ? current : [current]
  const after = applySeriesChangeLocally(before, changes)
  const rows: PreviewRow[] = []
  let day = from
  for (let step = 0; step < SEARCH_DAYS * 2 && rows.length < count; step++) {
    const old = occurrenceAt(before, day)
    const next = occurrenceAt(after, day)
    if (old || next) rows.push({ date: day, before: old, after: next,
      status: !old ? 'added' : !next ? 'removed' : sameOccurrence(old, next) ? 'same' : 'changed' })
    day = shiftISO(day, 1)
  }
  return rows
}

type Commit = (before: WorkItem | null, after: WorkItem | null) => Promise<WorkItem | null>

/**
 * Runs changes through the normal single-row save path. Creates go first so a failed cut
 * never drops occurrences; a failure before any delete undoes what already landed. Deletes go
 * last and are not undone (they sit in the trash), so a retry never duplicates rows.
 */
export async function commitSeriesChange(changes: SeriesChange | SeriesChange[], commit: Commit): Promise<{ updated: WorkItem[]; created: WorkItem[] }> {
  const list = Array.isArray(changes) ? changes : [changes]
  const created: WorkItem[] = []
  const updated: { saved: WorkItem; original: WorkItem }[] = []
  let removing = false
  try {
    for (const row of list.flatMap(change => change.create ?? [])) {
      const saved = await commit(null, row)
      if (!saved) throw new Error('반복 일정을 저장하지 못했습니다.')
      created.push(saved)
    }
    for (const { item, patch } of list.flatMap(change => change.update ? [change.update] : [])) {
      const saved = await commit(item, { ...item, ...patch })
      if (saved) updated.push({ saved, original: item })
    }
    removing = true
    for (const row of list.flatMap(change => change.remove ? [change.remove] : [])) await commit(row, null)
    return { updated: updated.map(row => row.saved), created }
  } catch (error) {
    if (removing) throw error
    for (const { saved, original } of updated.reverse()) await commit(saved, original).catch(() => undefined)
    for (const row of created.reverse()) await commit(row, null).catch(() => undefined)
    throw error
  }
}
