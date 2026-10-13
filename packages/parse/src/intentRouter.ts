import type { InputRoute } from '../../types/src/ai.ts'
import { PARSE_CONFIG } from './config.ts'
import type { ParsedSchedule } from './model.ts'

/** Inspect semantics before trusting the single-schedule parser's confidence. */
export function routeInput(text: string, parsed?: ParsedSchedule, threshold = PARSE_CONFIG.aiConfidenceThreshold): InputRoute {
  const input = text.trim()
  if (!input) throw new Error('입력 내용을 확인해주세요.')
  if (/(계획\s*(?:을\s*)?(?:세워|짜|만들|수립|해)|플랜|일정\s*(?:을\s*)?짜|시간표\s*(?:를\s*)?(?:짜|만들)|추천|재배치|시간\s*찾아|일정.*정리해)/.test(input)) {
    return { route: 'planner', reason: 'planning_request' }
  }
  // A range/duration is one schedule; conjunctions, conditions and separate clauses are not.
  if (/(그리고|그다음|그 다음|이후에|끝나면|끝나고|하고\s|한\s*후|\s후\s|전에\s|면\s|대신|지만|(?:회의|운동|공부|미팅|수업|병원|약속)(?:하고|랑|와|과)\s|[;\n]|[.!?]\s+\S|[,，].*(?:시|내일|모레|오늘|요일))/.test(input)) {
    return { route: 'ai', reason: 'complex_sentence' }
  }
  return parsed && parsed.confidence < threshold
    ? { route: 'ai', reason: 'low_confidence' }
    : { route: 'parser', reason: 'simple_schedule' }
}

export class PlannerRequiredError extends Error {
  readonly code = 'PLANNER_REQUIRED'
  readonly route = 'planner'
  constructor() {
    super('계획 요청은 Planner 경로로 분류되었습니다. 계획 생성 기능은 준비 중이에요.')
    this.name = 'PlannerRequiredError'
  }
}
