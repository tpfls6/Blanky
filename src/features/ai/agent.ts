import { repeatsOn } from '../../../packages/types/src/recurrence.ts'
import { isGoogleOriginWork } from '../../services/calendarSync/origin.ts'
import { findConflicts, findDuplicates, type Sighting } from '../../../packages/scheduling/src/duplicates.ts'
import type { WorkItem, WorkPatch } from '../../types/work.ts'

export type AgentAction =
  | { op: 'delete'; item: WorkItem; reason: string }
  | { op: 'update'; item: WorkItem; patch: WorkPatch; reason: string }

export type AgentSkip = { title: string; reason: string }

export type AgentPlan = {
  title: string
  mode: 'auto' | 'preview'
  actions: AgentAction[]
  skipped: AgentSkip[]
  kept: WorkItem[]
}

const CONFIRM_DROPS = 5

function asSighting(item: WorkItem): Sighting {
  return {
    id: item.id,
    title: item.title,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    calendarId: item.calendarId,
    repeat: item.repeat,
    repeatDays: item.repeatDays,
    changeSource: item.changeSource,
    calendarType: item.calendarType,
    kind: item.kind,
  }
}

function byId(items: readonly WorkItem[]): Map<string, WorkItem> {
  return new Map(items.map(item => [item.id, item]))
}

function lastDate(item: WorkItem): string {
  return item.endDate && item.endDate >= item.date ? item.endDate : item.date
}

function inAskedRange(item: WorkItem, start?: string, end?: string): boolean {
  if (!start && !end) return true
  if (start && end) return inRange(item, start, end)
  if (start) return item.repeat !== 'none' || lastDate(item) >= start
  return lastDate(item) <= end!
}

export function planDedupe(items: readonly WorkItem[], scope?: { start?: string; end?: string; titles?: string[]; openEnd?: boolean }): AgentPlan {
  const scoped = items.filter(item => {
    if (scope?.titles?.length && !scope.titles.some(title => title === item.title || item.title.includes(title) || title.includes(item.title))) return false
    return inAskedRange(item, scope?.start, scope?.end)
  })
  const groups = findDuplicates(scoped.map(asSighting))
  const index = byId(items)
  const actions: AgentAction[] = []
  const skipped: AgentSkip[] = []
  const kept: WorkItem[] = []
  for (const group of groups) {
    const keep = index.get(group.keepId)
    if (keep) kept.push(keep)
    for (const id of group.dropIds) {
      const item = index.get(id)
      if (!item) continue
      if (isGoogleOriginWork(item)) {
        skipped.push({ title: item.title, reason: 'Google에서 가져온 일정은 원본을 지우지 않았어요.' })
        continue
      }
      actions.push({ op: 'delete', item, reason: `${group.title} 중복` })
    }
  }
  const found = groups.reduce((sum, group) => sum + group.dropIds.length + 1, 0)
  const range = scope?.start ? `${scope.start}${scope.end ? '~' + scope.end : ' 이후'}` : ''
  const title = groups.length
    ? `${range ? range + ' · ' : ''}중복 일정 ${found}건을 확인했습니다.${scope?.openEnd && !scope.end ? ' 종료일이 없어 이 날짜 이후 전체를 대상으로 합니다.' : ''}`
    : '중복 일정이 없어요.'
  return {
    title,
    mode: actions.length ? 'preview' : 'auto',
    actions,
    skipped,
    kept,
  }
}

export function planConflicts(items: readonly WorkItem[], start: string, end: string): AgentPlan {
  const scoped = items.filter(item => inRange(item, start, end))
  const pairs = findConflicts(scoped.map(asSighting))
  const index = byId(scoped)
  const kept: WorkItem[] = []
  for (const pair of pairs) {
    const a = index.get(pair.aId), b = index.get(pair.bId)
    if (a) kept.push(a)
    if (b) kept.push(b)
  }
  return {
    title: pairs.length ? `겹치는 일정 ${pairs.length}건을 찾았어요. 제목이 달라 중복이 아니에요.` : '겹치는 일정이 없어요.',
    mode: 'auto',
    actions: [],
    skipped: pairs.map(pair => ({ title: `${index.get(pair.aId)?.title ?? ''} / ${index.get(pair.bId)?.title ?? ''}`, reason: `${pair.date} 충돌` })),
    kept,
  }
}

export function planSummarize(items: readonly WorkItem[], start: string, end: string): AgentPlan {
  const scoped = items.filter(item => inRange(item, start, end))
  const open = scoped.filter(item => item.kind === 'task' && item.status !== 'done')
  const events = scoped.filter(item => item.kind === 'event')
  return {
    title: `${start}~${end} · 일정 ${events.length}건, 미완료 할 일 ${open.length}건이에요.`,
    mode: 'auto',
    actions: [],
    skipped: [],
    kept: [...events, ...open],
  }
}

export function planMoveIncomplete(items: readonly WorkItem[], from: string, to: string): AgentPlan {
  const open = items.filter(item => item.kind === 'task' && item.status !== 'done' && (item.date === from || item.dueDate === from))
  return {
    title: open.length ? `어제 못한 일 ${open.length}건을 ${to}로 옮길게요.` : '어제 못한 할 일이 없어요.',
    mode: open.length > CONFIRM_DROPS ? 'preview' : 'auto',
    actions: open.map(item => ({
      op: 'update' as const,
      item,
      patch: item.dueDate === from ? { dueDate: to, date: to } : { date: to },
      reason: `${from} → ${to}`,
    })),
    skipped: [],
    kept: [],
  }
}

export function liveActions(plan: AgentPlan, items: readonly WorkItem[]): AgentAction[] {
  const live = new Map(items.map(item => [item.id, item]))
  return plan.actions.flatMap(action => {
    const item = live.get(action.item.id)
    return item ? [{ ...action, item }] : []
  })
}

export function failedActionIds(failed: readonly string[], actions: readonly AgentAction[]): AgentAction[] {
  const ids = new Set(failed)
  return actions.filter(action => !ids.has(action.item.id))
}

export function describePlan(plan: AgentPlan): string {
  const lines = [plan.title]
  const deletes = plan.actions.filter(action => action.op === 'delete')
  const updates = plan.actions.filter(action => action.op === 'update')
  for (const item of plan.kept) {
    const extras = deletes.filter(action => action.reason.startsWith(item.title)).length
    if (extras) lines.push(`- ${item.title} 중복 ${extras + 1}건 → 1건 유지`)
  }
  if (deletes.length) lines.push(plan.mode === 'preview' ? `삭제 후보 ${deletes.length}건입니다. 확인 후 실행해 주세요.` : `총 ${deletes.length}건을 정리했습니다.`)
  if (updates.length) lines.push(plan.mode === 'preview' ? `변경 후보 ${updates.length}건입니다. 확인 후 실행해 주세요.` : `총 ${updates.length}건을 변경했습니다.`)
  for (const skip of plan.skipped) lines.push(`- 건너뜀: ${skip.title} (${skip.reason})`)
  return lines.join('\n')
}

function inRange(item: WorkItem, start: string, end: string): boolean {
  let day = start
  while (day <= end) {
    if (item.kind === 'task') {
      if (item.dueDate === day || item.date === day || repeatsOn(item, day)) return true
    } else {
      const last = item.endDate && item.endDate >= item.date ? item.endDate : item.date
      if ((item.date <= day && day <= last) || repeatsOn(item, day)) return true
    }
    const next = new Date(`${day}T00:00:00`)
    next.setDate(next.getDate() + 1)
    const nextDay = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
    if (nextDay === day) break
    day = nextDay
  }
  return false
}
