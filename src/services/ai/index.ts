import { replanTasks as replanOnServer } from '@blanky/api'
import { parseScheduleFromText as parseOnServer, analyzeScheduleFromText as analyzeOnServer, analyzeIntentsFromText as intentsOnServer } from '@blanky/api'
import { extractIntents, needsIntentAI, type IntentExtraction } from '@blanky/parse'
import { mergeIntentResults } from '../../../packages/parse/src/intentAnalysis.ts'
import type { NaturalLanguageScheduleRequest } from '@blanky/types'
import type { ParsedSchedule } from '@blanky/parse'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'
import { planTasksFromText as planOnServer } from '@blanky/api'
import type { PlanTasksRequest } from '@blanky/types'
import { routeInput } from '@blanky/parse'
import { approvePlanner as approveOnServer, createCalendarRepository, createScheduleRepository } from '@blanky/api'
import type { PlannerApprovalRequest } from '@blanky/types'
export async function approvePlanner(request:PlannerApprovalRequest){return approveOnServer(getSupabaseClient(),request)}
export async function getPlannerSchedules(startDate:string,endDate:string){
  const client=getSupabaseClient()
  const [schedules,calendars]=await Promise.all([createScheduleRepository(client).listForPlanning(startDate,endDate),createCalendarRepository(client).getCalendars()])
  return schedules.map(row=>{const calendar=calendars.find(calendar=>calendar.id===row.calendarId);if(!calendar)throw new Error('기존 일정의 캘린더를 확인하지 못했어요. 다시 불러와 주세요.');return {...row,kind:row.plannerApprovalKey?'task' as const:row.kind,timezone:calendar.timezone}})
}

export type { NaturalLanguageScheduleRequest } from '@blanky/types'
export type { ParsedSchedule } from '@blanky/parse'
export type { InputRoute } from '@blanky/types'
export { routeInput, PlannerRequiredError } from '@blanky/parse'
/** Phase 4 entrypoint. Generates recommendations only; never calls schedule writes. */
export async function planTasksFromText(request: PlanTasksRequest) {
  if(!isSupabaseConfigured)throw new Error('계획 추천은 서버 연결이 필요해요. 로그인 및 Supabase 설정을 확인해 주세요.')
  return planOnServer(getSupabaseClient(), request)
}
export async function processAiInput(request: PlanTasksRequest) {
  if(routeInput(request.text).route==='reschedule')return {intent:'RESCHEDULE' as const, ...await replanOnServer(getSupabaseClient(),{mode:'reschedule'})}
  if (routeInput(request.text).route === 'planner') return { intent: 'PLAN_TASKS' as const, recommendation: await planTasksFromText(request) }
  return { intent: 'ANALYZE_SCHEDULE' as const, analysis: await analyzeScheduleFromText({ text: request.text, timezone: request.settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Seoul' }) }
}
export async function analyzeScheduleFromText(request: NaturalLanguageScheduleRequest, options: { ai?: false } = {}) {
  return analyzeOnServer(getSupabaseClient(), request, options)
}

export async function parseScheduleFromText(
  request: NaturalLanguageScheduleRequest,
): Promise<ParsedSchedule> {
  return parseOnServer(getSupabaseClient(), request)
}

export async function replanRemaining(token:string,edits:import('@blanky/types').PlannerEdit[]){return replanOnServer(getSupabaseClient(),{mode:'remaining',token,edits})}
export async function inspectPlannerConflicts(){if(!isSupabaseConfigured)return [];return (await replanOnServer(getSupabaseClient(),{mode:'inspect'})).conflicts}

/**
 * Rules first. The AI split runs only when the rules left a schedule-like clause unread, and any AI
 * failure (offline, old deployment, invalid output) keeps the rule result instead of guessing.
 */
export async function analyzeIntents(text: string, today: Date, deps: { intents?: (text: string, today: Date) => Promise<IntentExtraction> } = {}): Promise<IntentExtraction & { aiCalled?: true }> {
  const rules = extractIntents(text, today)
  if (!needsIntentAI(rules) || (!deps.intents && !isSupabaseConfigured)) return rules
  try {
    const ai = await (deps.intents ?? ((text, today) => intentsOnServer(getSupabaseClient(), { text, timezone: 'Asia/Seoul', today })))(text, today)
    // The paid call for this message is spent; the analysis step that may follow asks for rules only.
    return { ...mergeIntentResults(rules, ai), aiCalled: true }
  } catch {
    return rules
  }
}
