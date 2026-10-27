import type { PlannerEdit, PlanningRecommendation } from '../../types/src/planning.ts'
import { AnalysisError, isCalendarDate } from '../../types/src/aiSchema.ts'
import { validateSettings } from './settings.ts'
import { getBusyIntervals, type BusySchedule } from './engine.ts'
import { epoch, localInstant, nextDate, startOfDay, weekday } from './time.ts'

export function editsFromRecommendation(plan: PlanningRecommendation): PlannerEdit[] {
  return plan.result.blocks.map(block => ({ id: block.id, title: block.title, date: block.startAt.slice(0,10), startTime: block.startAt.slice(11,16), endTime: block.endAt.slice(11,16), durationMinutes: block.durationMinutes, priority: block.priority, included: true, confirmed: block.confirmationNeeded.length === 0 }))
}
/** Shared immediate UI validation and authoritative server validation. */
export function validatePlannerEdits(plan: PlanningRecommendation, edits: PlannerEdit[], existing: BusySchedule[], now: string, alreadyApproved: PlannerEdit[] = [], replayIds: string[] = []) {
  const settings = { ...plan.result.settings, now }; validateSettings(settings)
  const fail = (code: string, message: string): never => { throw new AnalysisError(code, message) }
  if (!Array.isArray(edits) || edits.length > 200 || new Set(edits.map(edit=>edit.id)).size !== edits.length) fail('INVALID_INPUT','추천 항목 형식을 확인해 주세요.')
  const selected = edits.filter(edit=>edit.included)
  if (!selected.length) fail('NO_SELECTION','적용할 추천 일정을 선택해 주세요.')
  const original = new Map(plan.result.blocks.map(block=>[block.id,block]))
  const tasks = new Map(plan.result.tasks.map(outcome=>[outcome.task.id,outcome]))
  const { intervals } = getBusyIntervals(existing, settings)
  const approved = [...alreadyApproved.filter(edit=>!selected.some(row=>row.id===edit.id)), ...selected]
  const placed = approved.map(edit=> {
    const block = original.get(edit.id)
    if (!block) fail('INVALID_INPUT','추천에 없는 항목은 적용할 수 없어요.')
    const source = tasks.get(block!.sourceTaskId)!
    if (typeof edit.title !== 'string' || !edit.title.trim() || edit.title.length > 500 || !isCalendarDate(edit.date) || !['low','medium','high'].includes(edit.priority)) fail('INVALID_INPUT','제목, 날짜와 우선순위를 확인해 주세요.')
    if (edit.date < settings.startDate || edit.date > settings.endDate || (source.task.deadline && edit.date > source.task.deadline) || !settings.workDays.includes(weekday(edit.date))) fail('CONSTRAINT_VIOLATION','추천 범위, 작업 요일 또는 마감일을 벗어났어요.')
    if(source.task.excludedDates?.includes(edit.date)) fail('CONSTRAINT_VIOLATION','반복 작업은 다른 날짜에 배치해 주세요.')
    if (block!.confirmationNeeded.length && edit.confirmed !== true) fail('CONFIRMATION_REQUIRED','추정 정보와 확인 필요 항목을 확인해 주세요.')
    let start=0,end=0
    try { start=localInstant(edit.date,edit.startTime,settings.timezone); end=localInstant(edit.date,edit.endTime,settings.timezone) } catch { fail('INVALID_INPUT','존재하지 않거나 모호한 시각이에요. 다른 시간을 지정해 주세요.') }
    if (!Number.isInteger(edit.durationMinutes) || edit.durationMinutes < settings.minBlockMinutes || edit.durationMinutes > settings.maxBlockMinutes || (end-start)/60000 !== edit.durationMinutes || edit.startTime < settings.dayStartTime || edit.endTime > settings.dayEndTime || end <= start) fail('CONSTRAINT_VIOLATION','시작·종료 시각, 소요시간과 작업 가능 범위를 확인해 주세요.')
    if (source.task.notBefore && start < epoch(source.task.notBefore)) fail('DEPENDENCY_VIOLATION','선행 작업이 끝난 후에 배치해 주세요.')
    if (selected.some(row=>row.id===edit.id) && !replayIds.includes(edit.id) && start < epoch(now)) fail('CONSTRAINT_VIOLATION','지난 시간에는 적용할 수 없어요. 추천을 다시 생성해 주세요.')
    return { edit,block:block!,source,start,end }
  })
  const rest = settings.breakMinutes*60000
  for (const row of placed) {
    // previously approved rows remain in existing; only new rows need fixed-interval checks.
    if (selected.some(edit=>edit.id===row.edit.id) && intervals.some(busy=> row.start < busy.end+rest && row.end > busy.start-rest)) fail('SCHEDULE_CONFLICT','기존 일정이 변경되었거나 시간·휴식 구간이 겹쳐요. 수정하거나 다시 생성해 주세요.')
    if (placed.some(other=>other!==row && row.start<other.end+rest && row.end>other.start-rest)) fail('SCHEDULE_CONFLICT','선택한 추천 일정끼리 시간·휴식 구간이 겹쳐요.')
  }
  for (const date of new Set(selected.map(row=>row.date))) {
    const start=startOfDay(date,settings.timezone),end=startOfDay(nextDate(date),settings.timezone)
    const used=intervals.filter(row=>row.task).reduce((sum,row)=>sum+Math.max(0,Math.min(end,row.end)-Math.max(start,row.start))/60000,0)
    const added=placed.filter(row=>selected.some(edit=>edit.id===row.edit.id)&&row.edit.date===date).reduce((sum,row)=>sum+row.edit.durationMinutes,0)
    if(used+added>settings.maxDailyMinutes) fail('CONSTRAINT_VIOLATION','하루 최대 작업 시간을 초과했어요.')
  }
  if(settings.repeatOnSeparateDays) for(const row of placed) if(row.source.task.originGroup && placed.some(other=>other!==row&&other.source.task.originGroup===row.source.task.originGroup&&other.source.task.repeatIndex!==row.source.task.repeatIndex&&row.edit.date===other.edit.date)) fail('CONSTRAINT_VIOLATION','반복 작업은 다른 날짜에 배치해 주세요.')
  for(const [id,outcome] of tasks) {
    const rows=placed.filter(row=>row.block.sourceTaskId===id)
    if(settings.repeatOnSeparateDays) for(const row of rows) if(rows.some(other=>other.block.occurrence!==row.block.occurrence&&other.edit.date===row.edit.date)) fail('CONSTRAINT_VIOLATION','반복 작업은 서로 다른 날짜에 배치해 주세요.')
    for(const dependency of outcome.task.dependencies) if(rows.length) {
      const before=placed.filter(row=>row.block.sourceTaskId===dependency)
      const expected=plan.result.blocks.filter(block=>block.sourceTaskId===dependency)
      if(!before.length || expected.some(block=>!before.some(row=>row.block.id===block.id)) || Math.max(...before.map(row=>row.end))+rest>Math.min(...rows.map(row=>row.start))) fail('DEPENDENCY_VIOLATION','선행 작업 전체를 먼저 적용하거나 후속 작업을 제외해 주세요.')
    }
  }
  return placed.filter(row=>selected.some(edit=>edit.id===row.edit.id))
}
