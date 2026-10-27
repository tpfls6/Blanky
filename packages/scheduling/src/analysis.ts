import type { PlanningAnalysis, PlanningTask } from '../../types/src/planning.ts'
import { validatePlanningAnalysis } from '../../types/src/planningSchema.ts'
/** Preserve original IDs/items and semantic relationships; no date/time allocation here. */
export function tasksFromPlanningAnalysis(input: PlanningAnalysis): PlanningTask[] {
  const analysis = validatePlanningAnalysis(input)
  return analysis.tasks.map(task => {
    const item = analysis.analysis.items.find(item => item.id === task.sourceTaskId)!
    const dependencies = analysis.analysis.relations.flatMap(relation => relation.type === 'before'
      ? relation.toId === item.id ? [relation.fromId] : []
      : relation.fromId === item.id ? [relation.toId] : [])
    return { id: item.id, title: item.draft.title, sourceItem: item, durationMinutes: task.durationMinutes, durationIsEstimate: task.durationIsEstimate,
      priority: task.priority, priorityIsEstimate: task.priorityIsEstimate, deadline: task.deadline, deadlineIsEstimate: task.deadlineIsEstimate,
      occurrences: task.occurrences, dependencies: [...new Set(dependencies)], splittable: task.splittable, preferredChunkMinutes: task.preferredChunkMinutes,
      confirmationNeeded: [...task.notes, ...item.uncertainties.filter(uncertainty => !['date', 'startTime'].includes(uncertainty.field)).map(uncertainty => uncertainty.reason)] }
  })
}
