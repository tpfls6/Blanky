import type { Priority } from '../../types/src/schedule.ts'

/** Deadline proximity affects placement, not importance by itself. */
export function recommendPriority(text: string, prerequisite = false): { priority: Priority; reason: string } {
  if (/나중에\s*해도|급하지\s*않|중요하지\s*않|낮은?\s*우선순위|여유\s*있을\s*때|low\s*priority/i.test(text)) return { priority: 'low', reason: '서두르지 않아도 된다는 표현을 반영했어요.' }
  if (/급하게|긴급|중요한|중요해|최우선|높은?\s*우선순위|high\s*priority|urgent/i.test(text)) return { priority: 'high', reason: '명시된 긴급도 또는 중요도를 반영했어요.' }
  if (prerequisite) return { priority: 'medium', reason: '후속 작업의 선행 조건이므로 먼저 배치하되 중요도는 보통으로 제안해요.' }
  return { priority: 'medium', reason: '중요도 근거가 부족해 보통으로 제안해요. 가까운 마감은 시간 배정에 반영해요.' }
}
