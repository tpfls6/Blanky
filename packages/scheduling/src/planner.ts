import type { PlanTasksRequest, PlanningTask, SchedulingSettings } from '../../types/src/planning.ts'
import type { PlanningProvider } from '../../parse/src/planningProvider.ts'
import type { CategoryRef } from '../../parse/src/model.ts'
import { routeInput } from '../../parse/src/intentRouter.ts'
import { AnalysisError } from '../../types/src/aiSchema.ts'
import { schedulingSettings } from './settings.ts'
import { scheduleTasks, type BusySchedule } from './engine.ts'
import { tasksFromPlanningAnalysis } from './analysis.ts'
import { localDate } from './time.ts'

export type PlannerDependencies = {
  userId?: string
  provider: PlanningProvider
  loadSettings: () => Promise<Partial<SchedulingSettings>>
  loadSchedules: (startDate: string, endDate: string) => Promise<BusySchedule[]>
  loadCategories: () => Promise<CategoryRef[]>
  loadManualHistory?: () => Promise<{title:string;duration:number;priority:PlanningTask['priority']}[]>
  now: string
}
/** No save/update/delete dependency exists. Caller authenticates before invoking. */
export async function createPlanningRecommendation(request: PlanTasksRequest, deps: PlannerDependencies) {
  if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 8000) throw new AnalysisError('INVALID_INPUT', '1~8000자 이내로 입력해 주세요.')
  if (routeInput(request.text).route !== 'planner') throw new AnalysisError('INVALID_INPUT', '일정 계획 요청을 입력해 주세요.')
  const saved = await deps.loadSettings()
  const settings = schedulingSettings({ ...request.settings, ...saved, now: deps.now }, deps.now)
  const [existing, categories] = await Promise.all([deps.loadSchedules(settings.startDate, settings.endDate), deps.loadCategories()])
  const analysis = await deps.provider.analyzeTasks({ text: request.text, today: localDate(deps.now, settings.timezone), timezone: settings.timezone, categories, horizonEnd: settings.endDate })
  // The provider and adapter both validate; the original analysis is returned for phase 4 editing.
  const tasks=tasksFromPlanningAnalysis(analysis)
  const history=settings.useManualHistory && deps.loadManualHistory ? await deps.loadManualHistory() : []
  for(const task of tasks){
    const matches=history.filter(row=>row.title.trim()===task.title.trim()&&row.duration>0)
    if(matches.length>=2){
      if(task.durationIsEstimate || task.durationMinutes===null){task.durationMinutes=matches[0].duration;task.durationIsEstimate=true}
      if(task.priorityIsEstimate)task.priority=matches[0].priority
      task.confirmationNeeded.push('최근 직접 수정한 동일 제목 작업을 참고한 추천입니다. 자동 학습 결과가 아니에요.')
    } else if(task.durationIsEstimate || task.durationMinutes===null){task.durationMinutes=settings.defaultDurationMinutes;task.durationIsEstimate=true}
  }
  const result = scheduleTasks(tasks, existing, settings)
  result.warnings = [...new Set([...analysis.analysis.warnings, ...result.warnings])]
  return { analysis, result }
}
