import type { PlanningTask, SchedulingResult, SchedulingSettings } from '../../types/src/planning.ts'
import type { Schedule } from '../../types/src/schedule.ts'
import { AnalysisError, isCalendarDate } from '../../types/src/aiSchema.ts'
import { repeatsOn } from '../../types/src/recurrence.ts'
import { validateSettings } from './settings.ts'
import { dateDistance, epoch, localInstant, nextDate, startOfDay, weekday, zonedISO } from './time.ts'

export type BusySchedule = Pick<Schedule, 'id' | 'date' | 'startTime' | 'endTime' | 'duration' | 'status'> & {
  kind?: Schedule['kind']; allDay?: boolean; endDate?: string | null; repeat?: Schedule['repeat']; repeatDays?: number[]; timezone?: string
}
type Interval = { start: number; end: number; task: boolean }
const minute = 60000

function validateTasks(tasks: PlanningTask[]): void {
  const invalid = () => { throw new AnalysisError('INVALID_INPUT', '작업 ID, 소요시간, 반복 횟수, 선후 관계를 확인해 주세요.') }
  if (!Array.isArray(tasks) || !tasks.length || tasks.length > 200 || new Set(tasks.map(task => task.id)).size !== tasks.length) invalid()
  for (const task of tasks) {
    if (!task.id || !task.title.trim() || !['low', 'medium', 'high'].includes(task.priority) || !Number.isInteger(task.occurrences) || task.occurrences < 1 || task.occurrences > 30) invalid()
    if (task.durationMinutes !== null && (!Number.isInteger(task.durationMinutes) || task.durationMinutes < 1 || task.durationMinutes > 10080)) invalid()
    if (task.deadline && !isCalendarDate(task.deadline)) invalid()
    if (task.preferredChunkMinutes !== null && (!Number.isInteger(task.preferredChunkMinutes) || task.preferredChunkMinutes < 1 || task.preferredChunkMinutes > 1440)) invalid()
    if (!Array.isArray(task.dependencies) || !Array.isArray(task.confirmationNeeded)) invalid()
  }
}

/** Pure, deterministic, read-only greedy allocator. All times are exact instants. */
export function scheduleTasks(tasks: PlanningTask[], existing: BusySchedule[], settings: SchedulingSettings): SchedulingResult {
  validateSettings(settings); validateTasks(tasks)
  const { intervals, warnings } = getBusyIntervals(existing, settings)
  const dates: string[] = []
  for (let date = settings.startDate; date <= settings.endDate; date = nextDate(date)) dates.push(date)
  const result: SchedulingResult = { version: 1, intent: 'PLAN_TASKS', recommendationOnly: true, settings: structuredClone(settings), tasks: [], blocks: [], warnings }
  const completed = new Map<string, number>()
  const outcomes = new Map<string, SchedulingResult['tasks'][number]>()
  const rank = { high: 0, medium: 1, low: 2 }
  const pending = [...tasks].sort((a, b) => (a.deadline ?? settings.endDate).localeCompare(b.deadline ?? settings.endDate) || rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id, 'en'))
  const now = epoch(settings.now)
  const rest = settings.breakMinutes * minute
  while (pending.length) {
    const ready = pending.findIndex(task => task.dependencies.every(id => outcomes.has(id)) || task.dependencies.some(id => !tasks.some(other => other.id === id)))
    const index = ready < 0 ? 0 : ready
    const originalTask = pending.splice(index, 1)[0]
    const task = {...originalTask, splittable: originalTask.splittable && settings.allowSplit !== false}
    const duration = task.durationMinutes ?? settings.defaultDurationMinutes
    const confirmationNeeded = [...task.confirmationNeeded]
    if (task.durationMinutes === null || task.durationIsEstimate) confirmationNeeded.push(`회당 ${duration}분 소요시간은 추정값이에요.`)
    if (!task.deadline) confirmationNeeded.push(`마감일 미정: 추천 범위 ${settings.endDate}까지만 배치했어요.`)
    else if (task.deadlineIsEstimate) confirmationNeeded.push(`마감일 ${task.deadline}은 추정값이에요.`)
    if (task.priorityIsEstimate) confirmationNeeded.push(`우선순위 ${task.priority}는 추천값이에요.`)
    const outcome: SchedulingResult['tasks'][number] = { task: structuredClone(task), status: 'unscheduled', requestedMinutes: duration * task.occurrences,
      scheduledMinutes: 0, remainingMinutes: duration * task.occurrences, completedOccurrences: 0, reason: null, confirmationNeeded: [...new Set(confirmationNeeded)] }
    outcomes.set(task.id, outcome)
    if (duration < settings.minBlockMinutes) { outcome.reason = 'BELOW_MIN_BLOCK'; continue }
    if (ready < 0 || task.dependencies.some(id => !completed.has(id))) {
      outcome.reason = ready < 0 ? 'DEPENDENCY_CYCLE' : 'DEPENDENCY_UNSCHEDULED'
      continue
    }
    const dependencyEnd = Math.max(now, task.notBefore ? epoch(task.notBefore) : 0, ...task.dependencies.map(id => completed.get(id)! + rest))
    let lastEnd = dependencyEnd
    const targetChunk = Math.min(settings.maxBlockMinutes, Math.max(settings.minBlockMinutes, task.preferredChunkMinutes ?? settings.maxBlockMinutes))
    for (let occurrence = 1; occurrence <= task.occurrences; occurrence++) {
      let remaining = duration, part = 0
      // Repetitions occur on distinct local days. Long occurrences may still split across days.
      const priorDays = new Set(settings.repeatOnSeparateDays ? result.blocks.filter(block => block.sourceTaskId === task.id && block.occurrence !== occurrence).map(block => block.startAt.slice(0, 10)) : [])
      for (const date of dates) {
        if (!remaining || result.blocks.length >= 5000 || date > (task.deadline ?? settings.endDate) || priorDays.has(date) || task.excludedDates?.includes(date) || (settings.repeatOnSeparateDays && task.originGroup && result.blocks.some(block=>{const other=tasks.find(item=>item.id===block.sourceTaskId);return other!==undefined&&other.originGroup===task.originGroup&&other.repeatIndex!==task.repeatIndex&&block.startAt.slice(0,10)===date})) || !settings.workDays.includes(weekday(date))) continue
        let start: number, end: number
        try { start = localInstant(date, settings.dayStartTime, settings.timezone); end = localInstant(date, settings.dayEndTime, settings.timezone) }
        catch { warnings.push(`${date}: DST로 모호하거나 존재하지 않는 작업 시간대를 건너뛰었어요.`); continue }
        const dayStart = startOfDay(date, settings.timezone), dayEnd = startOfDay(nextDate(date), settings.timezone)
        let used = intervals.filter(item => item.task).reduce((sum, item) => sum + Math.max(0, Math.min(item.end, dayEnd) - Math.max(item.start, dayStart)) / minute, 0)
        const blocked = intervals.map(item => ({ start: item.start - rest, end: item.end + rest })).sort((a, b) => a.start - b.start || a.end - b.end)
        const gaps: { start: number; end: number }[] = []
        let cursor = Math.max(start, dependencyEnd, lastEnd, now)
        for (const busy of blocked) {
          if (busy.end <= cursor || busy.start >= end) continue
          if (busy.start > cursor) gaps.push({ start: cursor, end: Math.min(end, busy.start) })
          cursor = Math.max(cursor, busy.end)
        }
        if (cursor < end) gaps.push({ start: cursor, end })
        const candidates = settings.placementMode === 'focus' && settings.preferredStartTime && settings.preferredEndTime ? (() => {
          const focusStart=localInstant(date,settings.preferredStartTime!,settings.timezone),focusEnd=localInstant(date,settings.preferredEndTime!,settings.timezone)
          const preferred=gaps.map(gap=>({start:Math.max(gap.start,focusStart),end:Math.min(gap.end,focusEnd)})).filter(gap=>gap.end>gap.start)
          const fallback=gaps.flatMap(gap=>[{start:gap.start,end:Math.min(gap.end,focusStart)},{start:Math.max(gap.start,focusEnd),end:gap.end}]).filter(gap=>gap.end>gap.start)
          return [...preferred,...fallback]
        })() : gaps
        for (const gap of candidates) {
          let at = Math.ceil(Math.max(gap.start,lastEnd) / minute) * minute
          while (remaining > 0 && at < gap.end && result.blocks.length < 5000) {
            const capacity = Math.floor(Math.min((gap.end - at) / minute, settings.maxDailyMinutes - used))
            let length = Math.min(remaining, capacity, task.splittable ? targetChunk : settings.maxBlockMinutes)
            if (!task.splittable && length < remaining) break
            // Respect minimum size; never discard or round up small remainders.
            if (task.splittable && remaining > length && remaining - length < settings.minBlockMinutes) length -= settings.minBlockMinutes - (remaining - length)
            if (length < settings.minBlockMinutes) break
            const finish = at + length * minute
            intervals.push({ start: at, end: finish, task: true })
            result.blocks.push({ id: `${task.id}:${occurrence}:${++part}`, sourceTaskId: task.id, title: task.title, occurrence, part,
              startAt: zonedISO(at, settings.timezone), endAt: zonedISO(finish, settings.timezone), durationMinutes: length, priority: task.priority,
              reason: `우선순위 ${task.priority}, 마감 ${task.deadline ?? '미정'}, 선행 작업 ${task.dependencies.length}개 완료 조건을 지키는 가장 이른 빈 시간`, status: 'recommended', confirmationNeeded: outcome.confirmationNeeded })
            outcome.scheduledMinutes += length; remaining -= length; used += length; lastEnd = finish + rest; at = lastEnd
          }
        }
      }
      if (!remaining) outcome.completedOccurrences++
      else break // preserve occurrence order and report all remaining work
    }
    outcome.remainingMinutes = outcome.requestedMinutes - outcome.scheduledMinutes
    outcome.status = outcome.remainingMinutes === 0 ? 'scheduled' : outcome.scheduledMinutes ? 'partial' : 'unscheduled'
    if (outcome.status === 'scheduled') completed.set(task.id, lastEnd - rest)
    else outcome.reason = result.blocks.length >= 5000 ? 'RECOMMENDATION_LIMIT' : task.deadline && task.deadline < settings.startDate ? 'DEADLINE_PASSED' : 'INSUFFICIENT_CAPACITY'
  }
  result.tasks = tasks.map(task => outcomes.get(task.id)!)
  result.warnings = [...new Set(warnings)]
  return result
}

export function getBusyIntervals(existing: BusySchedule[], settings: SchedulingSettings): { intervals: Interval[]; warnings: string[] } {
  const warnings: string[] = []
  const intervals: Interval[] = []
  // Expand recurrence from its original anchor. Overnight and multi-day items block every intersecting day.
  for (const row of existing) {
    if (!isCalendarDate(row.date) || (row.endDate && (!isCalendarDate(row.endDate) || row.endDate < row.date))) throw new AnalysisError('SCHEDULE_DATA_INVALID', '기존 일정 날짜를 확인할 수 없어 추천을 중단했어요.')
    if (row.status === 'done' && row.kind === 'task') continue
    const zone = row.timezone ?? settings.timezone
    const span = row.endDate ? dateDistance(row.date, row.endDate) : 0
    let anchors: string[]
    if (!row.repeat || row.repeat === 'none') anchors = [row.date]
    else {
      anchors = []
      // Include preceding anchor for overnight/multi-day recurrence crossing the horizon boundary.
      const first = nextDate(settings.startDate, -Math.min(span + 2, 32))
      for (let day = first; day <= nextDate(settings.endDate, 1); day = nextDate(day)) {
        if (day < row.date) continue
        if (repeatsOn(row, day)) anchors.push(day)
      }
      if (span > 30) { warnings.push(`${row.id}: 긴 반복 일정은 안전하게 전체 추천 범위를 차단했어요.`); anchors = [nextDate(settings.startDate, -2)] }
    }
    for (const date of anchors) {
      try {
        if (row.kind === 'task' && !row.startTime && !row.allDay) continue // backlog is not a fixed commitment
        const start = row.allDay || !row.startTime ? startOfDay(date, zone) : localInstant(date, row.startTime, zone)
        let end: number
        if (row.allDay || !row.startTime) {
          end = startOfDay(nextDate(date, span + 1), zone)
          if (!row.allDay) warnings.push(`${row.id}: 시작 시각 미정으로 해당 날짜 전체를 차단했어요.`)
        }
        else if (row.endTime) end = localInstant(nextDate(date, span || (row.endTime <= row.startTime ? 1 : 0)), row.endTime, zone)
        else if (row.duration && row.duration > 0) end = start + row.duration * minute
        else { end = startOfDay(nextDate(date, span + 1), zone); warnings.push(`${row.id}: 종료 시각 미정으로 해당 날짜의 남은 시간을 차단했어요.`) }
        if (end <= start) throw new Error('invalid interval')
        intervals.push({ start, end, task: row.kind === 'task' })
        if (intervals.length > 10000) throw new AnalysisError('SCHEDULE_LIMIT_EXCEEDED', '반복 일정이 너무 많아 추천 범위를 줄여야 해요.')
      } catch (error) {
        if (error instanceof AnalysisError) throw error
        // Unknown existing DST/zone data must never be ignored and create collisions.
        throw new AnalysisError('SCHEDULE_DATA_INVALID', '기존 일정의 타임존 또는 시각이 모호해 안전한 추천을 만들 수 없어요.')
      }
    }
  }
  return { intervals, warnings }
}
