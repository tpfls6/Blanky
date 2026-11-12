import { repeatsOn } from '../../../packages/types/src/recurrence.ts'
import type { WorkItem } from '../../types/work.ts'
import type { ScheduleDraft } from '../../utils/scheduleDraft.ts'
import { commitSeriesChange, isRecurring, planOccurrenceEdit } from './seriesEdit.ts'

type Commit = (before: WorkItem | null, after: WorkItem | null) => Promise<WorkItem | null>

/** Editor draft for one day of an item: a recurring item opened on one of its days shows that day and asks for a scope. */
export function occurrenceDraft(draft: ScheduleDraft, item: WorkItem, day: string): ScheduleDraft {
  if (!isRecurring(item) || !repeatsOn(item, day)) return draft
  return { ...draft, date: day, occurrence: day, scope: 'this' }
}

/**
 * Saves or deletes what the editor holds. A recurring item opened on a day goes through the series planner
 * with the chosen scope; anything else is a plain single-row save.
 */
export async function commitDraft(items: readonly WorkItem[], commit: Commit, before: WorkItem, after: WorkItem | null, draft: Pick<ScheduleDraft, 'occurrence' | 'scope'>): Promise<true> {
  if (isRecurring(before) && draft.occurrence) {
    // Rule fields describe the whole series; for one day they stay as they were.
    const next = after && draft.scope === 'this' ? { ...after, repeat: before.repeat, repeatDays: before.repeatDays, repeatInterval: before.repeatInterval, repeatUntil: before.repeatUntil } : after
    await commitSeriesChange(planOccurrenceEdit(items, before, draft.occurrence, draft.scope ?? 'this', next), commit)
    return true
  }
  await commit(before, after)
  return true
}
