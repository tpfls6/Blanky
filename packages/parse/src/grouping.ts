import type { ScheduleAnalysis } from '../../types/src/ai.ts'

const canonical = (text: string) => text.toLowerCase().replace(/피피티/g, 'ppt').replace(/데모\s*영상/g, '데모영상').replace(/제작하기|만들기|만들다/g, '제작').replace(/[\s.,→]/g, '').replace(/하기$/g, '')

/** Deduplicate only matching temporal intent; never erase distinct appointments. */
export function normalizeAnalysis(input: ScheduleAnalysis): ScheduleAnalysis {
  const result = structuredClone(input)
  const aliases = new Map<string, string>()
  result.items = result.items.filter((item, index, all) => {
    const same = all.slice(0, index).find(other => other.type === item.type && canonical(other.draft.title) === canonical(item.draft.title) &&
      ['date', 'dueDate', 'dueTime', 'startTime', 'endTime', 'endDate'].every(key => (other.draft[key as 'date'] ?? null) === (item.draft[key as 'date'] ?? null)))
    if (same) aliases.set(item.id, aliases.get(same.id) ?? same.id)
    item.uncertainties = item.uncertainties.filter(entry => {
      if (/추정|모호|오전|오후|충돌|불명확/.test(entry.reason)) return true
      if (item.type === 'task' && ['date', 'startTime', 'endTime', 'endDate', 'dueTime'].includes(entry.field)) return false
      return !['endTime', 'endDate'].includes(entry.field)
    })
    return !same
  })
  const seen = new Set<string>()
  result.relations = result.relations.flatMap(relation => {
    const row = { ...relation, fromId: aliases.get(relation.fromId) ?? relation.fromId, toId: aliases.get(relation.toId) ?? relation.toId }
    const key = `${row.fromId}:${row.toId}:${row.type}`
    if (row.fromId === row.toId || seen.has(key)) return []
    seen.add(key)
    return [row]
  })
  return result
}
