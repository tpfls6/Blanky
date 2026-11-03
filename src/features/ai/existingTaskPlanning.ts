import type { PlannerEdit, PlanningRecommendation, PlanningTask, SchedulingSettings } from '../../../packages/types/src/planning.ts'
import { scheduleTasks, type BusySchedule } from '../../../packages/scheduling/src/engine.ts'
import { validatePlannerEdits } from '../../../packages/scheduling/src/approval.ts'
import { localInstant, zonedISO } from '../../../packages/scheduling/src/time.ts'
import type { WorkItem } from '../../types/work.ts'

/** Server identities come from the loaded repository, never from ID shape alone. */
export async function loadExistingPlanningTasks(items: WorkItem[], ids: string[], isRemote: (id: string) => boolean, readRemote: (ids: string[]) => Promise<WorkItem[]>): Promise<WorkItem[]> {
  const remoteIds = ids.filter(isRemote)
  const fresh = remoteIds.length ? await readRemote(remoteIds) : []
  return [...items.filter(item => ids.includes(item.id) && !remoteIds.includes(item.id)), ...fresh]
}

export function recommendExistingTasks(items: WorkItem[], ids: string[], existing: BusySchedule[], settings: SchedulingSettings, dependencies: Record<string, string[]> = {}): PlanningRecommendation {
  const tasks: PlanningTask[] = ids.map(id => {
    const item = items.find(row => row.id === id)
    if (!item || item.kind !== 'task' || item.status === 'done' || item.startTime) throw new Error('시간 미배정 할 일만 선택해 주세요. 이미 배정되었거나 완료된 작업은 다시 적용할 수 없어요.')
    return { id, title: item.title, sourceItem: null, durationMinutes: item.duration, durationIsEstimate: item.duration === null,
      priority: item.priority, priorityIsEstimate: false, deadline: item.dueDate, deadlineTime: item.dueTime,
      deadlineIsEstimate: false, occurrences: 1, dependencies: dependencies[id] ?? [], splittable: false,
      preferredChunkMinutes: null, confirmationNeeded: ['기존 할 일의 시간·소요시간·우선순위를 확인해 주세요.', ...(item.repeat !== 'none' ? ['반복 설정은 유지하며 이 할 일의 시작 시간만 연결해요.'] : [])] }
  })
  return { analysis: {version:1,intent:'PLAN_TASKS',analysis:{version:1,route:'ai',items:[],relations:[],warnings:[]},tasks:[]}, result: scheduleTasks(tasks, existing, settings) }
}

/** Only patches existing identities; preserves deadlines, status, recurrence and other metadata. */
export function existingTaskUpdates(plan: PlanningRecommendation, edits: PlannerEdit[], items: WorkItem[], existing: BusySchedule[], now: string, approved: PlannerEdit[] = []) {
  const placed = validatePlannerEdits(plan, edits, existing, now, approved)
  return placed.map(({edit,block}) => {
    const before = items.find(item => item.id === block.sourceTaskId)
    if (!before || before.kind !== 'task' || before.startTime || before.status === 'done') throw new Error('할 일이 변경되었어요. 목록을 새로고침한 후 다시 추천해 주세요.')
    const original = plan.result.tasks.find(row => row.task.id === before.id)!.task
    if (before.priority !== original.priority || before.dueDate !== original.deadline || (before.dueTime ?? null) !== (original.deadlineTime ?? null) || before.duration !== original.durationMinutes) throw new Error('우선순위·마감·소요시간이 변경되었어요. 다시 추천해 주세요.')
    if (plan.result.blocks.filter(row => row.sourceTaskId === before.id).length !== 1) throw new Error('기존 할 일은 하나의 시간대로 배정해 주세요.')
    return { before, after: {...before, title:edit.title, date:edit.date, startTime:edit.startTime, endTime:edit.endTime, duration:edit.durationMinutes, priority:edit.priority, allDay:false}, blockId:edit.id }
  })
}

export function preserveExistingChoices(plan: PlanningRecommendation, previous: PlanningRecommendation, edits: PlannerEdit[], existing: BusySchedule[]) {
  const fixed = edits.filter(edit=>edit.confirmed && edit.included && plan.result.tasks.some(row=>previous.result.blocks.find(block=>block.id===edit.id)?.sourceTaskId===row.task.id))
  const fixedTaskIds = new Set(fixed.map(edit=>previous.result.blocks.find(block=>block.id===edit.id)!.sourceTaskId))
  const zone=plan.result.settings.timezone
  const fixedBlocks=fixed.map(edit=>({...previous.result.blocks.find(block=>block.id===edit.id)!,title:edit.title,startAt:zonedISO(localInstant(edit.date,edit.startTime,zone),zone),endAt:zonedISO(localInstant(edit.date,edit.endTime,zone),zone),durationMinutes:edit.durationMinutes,priority:edit.priority,reason:'사용자가 확인한 시간·소요시간·우선순위를 유지했어요.'}))
  const remaining=plan.result.tasks.filter(row=>!fixedTaskIds.has(row.task.id)).map(row=>{
    const before=fixedBlocks.filter(block=>row.task.dependencies.includes(block.sourceTaskId))
    return {...row.task,priority:edits.find(edit=>previous.result.blocks.find(block=>block.id===edit.id)?.sourceTaskId===row.task.id)?.priority ?? row.task.priority,
      dependencies:row.task.dependencies.filter(id=>!fixedTaskIds.has(id)),notBefore:before.length?new Date(Math.max(...before.map(block=>Date.parse(block.endAt)))+plan.result.settings.breakMinutes*60000).toISOString():row.task.notBefore}
  })
  const occupied=fixed.map(edit=>({id:edit.id,kind:'task' as const,date:edit.date,startTime:edit.startTime,endTime:edit.endTime,duration:edit.durationMinutes,status:'todo' as const}))
  const result=remaining.length?scheduleTasks(remaining,[...existing,...occupied],plan.result.settings):{...plan.result,tasks:[],blocks:[]}
  const fixedOutcomes=plan.result.tasks.filter(row=>fixedTaskIds.has(row.task.id)).map(row=>({...row,status:'scheduled' as const,scheduledMinutes:fixedBlocks.find(block=>block.sourceTaskId===row.task.id)!.durationMinutes,remainingMinutes:0,completedOccurrences:1,reason:null}))
  const restored=result.tasks.map(row=>({...row,task:{...row.task,priority:plan.result.tasks.find(original=>original.task.id===row.task.id)!.task.priority,dependencies:plan.result.tasks.find(original=>original.task.id===row.task.id)!.task.dependencies}}))
  const next={...plan,result:{...result,tasks:[...fixedOutcomes,...restored],blocks:[...fixedBlocks,...result.blocks]}}
  return next
}
