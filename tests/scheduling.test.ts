import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleTasks, type BusySchedule } from '../packages/scheduling/src/engine.ts'
import { schedulingSettings } from '../packages/scheduling/src/settings.ts'
import { createPlanningRecommendation } from '../packages/scheduling/src/planner.ts'
import { tasksFromPlanningAnalysis } from '../packages/scheduling/src/analysis.ts'
import { createPlanTasksHandler } from '../supabase/functions/plan-tasks/handler.ts'
import { createOpenAIPlanningProvider } from '../packages/parse/src/planningProvider.ts'
import { routeInput } from '../packages/parse/src/intentRouter.ts'
import { validatePlanningAnalysis, validatePlanningRecommendation } from '../packages/types/src/planningSchema.ts'
import { createScheduleRepository } from '../packages/api/src/scheduleRepository.ts'
import { planTasksFromText } from '../packages/api/src/planning.ts'
import type { PlanningAnalysis, PlanningTask, SchedulingSettings } from '../packages/types/src/planning.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/api/src/database.generated.ts'

const settings = (patch: Partial<SchedulingSettings> = {}) => schedulingSettings({ startDate: '2026-10-13', endDate: '2026-10-15', dayStartTime: '09:00', dayEndTime: '18:00', breakMinutes: 10, now: '2026-10-13T00:00:00Z', ...patch })
const task = (id = 'study', patch: Partial<PlanningTask> = {}): PlanningTask => ({ id, title: id, sourceItem: null, durationMinutes: 60, durationIsEstimate: false, priority: 'medium', priorityIsEstimate: false, deadline: '2026-10-15', deadlineIsEstimate: false, occurrences: 1, dependencies: [], splittable: true, preferredChunkMinutes: null, confirmationNeeded: [], ...patch })
const busy = (patch: Partial<BusySchedule> = {}): BusySchedule => ({ id: 'fixed', date: '2026-10-13', startTime: '09:00', endTime: '10:00', duration: 60, kind: 'event', status: 'todo', repeat: 'none', allDay: false, ...patch })

test('empty time schedules a task and repeated same inputs produce exactly the same immutable result', () => {
  const tasks = [task()], rows: BusySchedule[] = [], config = settings()
  const snapshot = structuredClone({ tasks, rows, config })
  const result = scheduleTasks(tasks, rows, config)
  assert.equal(result.blocks[0].startAt, '2026-10-13T09:00:00+09:00')
  assert.equal(result.blocks[0].endAt, '2026-10-13T10:00:00+09:00')
  assert.deepEqual(scheduleTasks(tasks, rows, config), result)
  assert.deepEqual({ tasks, rows, config }, snapshot)
  assert.equal(result.recommendationOnly, true)
})
test('fixed collisions and rest intervals are respected', () => {
  const result = scheduleTasks([task()], [busy()], settings())
  assert.equal(result.blocks[0].startAt, '2026-10-13T10:10:00+09:00')
})

test('selected weekly weekdays block all occurrences while other weekdays stay free', () => {
  const fixed = busy({ date: '2026-10-12', repeat: 'weekly', repeatDays: [2,4], endTime: '18:00' })
  const result = scheduleTasks([task()], [fixed], settings())
  assert.equal(result.blocks[0].startAt, '2026-10-14T09:00:00+09:00')
})
test('deadlines are never exceeded and past deadlines retain original task and reason', () => {
  const result = scheduleTasks([task('long', { durationMinutes: 600, deadline: '2026-10-13' }), task('past', { deadline: '2026-10-12' })], [], settings())
  assert.ok(result.blocks.every(block => block.startAt.startsWith('2026-10-13')))
  assert.equal(result.tasks[0].status, 'partial')
  assert.equal(result.tasks[0].remainingMinutes, 360)
  assert.equal(result.tasks[1].reason, 'DEADLINE_PASSED')
  assert.equal(result.tasks[1].task.id, 'past')
})
test('long work splits into minimum-sized chunks with exact total effort and breaks', () => {
  const result = scheduleTasks([task('long', { durationMinutes: 200 })], [], settings())
  assert.deepEqual(result.blocks.map(block => block.durationMinutes), [90, 85, 25])
  assert.equal(result.tasks[0].scheduledMinutes, 200)
  for (let index = 1; index < result.blocks.length; index++) assert.ok(Date.parse(result.blocks[index].startAt) - Date.parse(result.blocks[index-1].endAt) >= 600000)
})
test('repeated tasks use distinct days and preserve occurrence and part IDs', () => {
  const result = scheduleTasks([task('exercise', { occurrences: 2 })], [], settings())
  assert.deepEqual(result.blocks.map(block => block.occurrence), [1, 2])
  assert.deepEqual(result.blocks.map(block => block.startAt.slice(0,10)), ['2026-10-13', '2026-10-14'])
  assert.equal(result.tasks[0].completedOccurrences, 2)
  const sameDay = scheduleTasks([task('exercise', { occurrences: 2 })], [], settings({ repeatOnSeparateDays: false }))
  assert.ok(sameDay.blocks.every(block => block.startAt.startsWith('2026-10-13')))
})
test('dependencies enforce completion before successors even if input order is reversed', () => {
  const result = scheduleTasks([task('second', { priority: 'high', dependencies: ['first'] }), task('first')], [], settings())
  assert.deepEqual(result.blocks.map(block => block.sourceTaskId), ['first', 'second'])
  assert.ok(Date.parse(result.blocks[1].startAt) > Date.parse(result.blocks[0].endAt))
})
test('incomplete predecessor, missing dependency and cycles are reported without scheduling successors', () => {
  const result = scheduleTasks([task('first', { durationMinutes: 1000 }), task('second', { dependencies: ['first'] }), task('missing', { dependencies: ['unknown'] }), task('a', { dependencies: ['b'] }), task('b', { dependencies: ['a'] })], [], settings())
  assert.equal(result.tasks[1].reason, 'DEPENDENCY_UNSCHEDULED')
  assert.equal(result.tasks[2].reason, 'DEPENDENCY_UNSCHEDULED')
  assert.equal(result.tasks[3].reason, 'DEPENDENCY_CYCLE')
  assert.ok(!result.blocks.some(block => ['second','missing','a','b'].includes(block.sourceTaskId)))
})
test('priority breaks equal-deadline ties and urgent deadlines come first', () => {
  const result = scheduleTasks([task('low', { priority: 'low' }), task('high', { priority: 'high' }), task('urgent', { deadline: '2026-10-13', priority: 'low' })], [], settings())
  assert.deepEqual(result.blocks.map(block => block.sourceTaskId), ['urgent', 'high', 'low'])
})
test('allowed weekdays, work hours and daily total cap include existing timed tasks', () => {
  const result = scheduleTasks([task('long', { durationMinutes: 120 })], [busy({ kind: 'task', startTime: '10:00', endTime: '11:00' })], settings({ dayStartTime: '10:00', dayEndTime: '12:00', maxDailyMinutes: 90, workDays: [2,4], breakMinutes: 0 }))
  assert.equal(result.blocks[0].durationMinutes, 30)
  assert.equal(result.blocks[0].startAt, '2026-10-13T11:00:00+09:00')
  assert.equal(result.blocks[1].startAt, '2026-10-15T10:00:00+09:00')
  assert.equal(result.tasks[0].status, 'scheduled')
})
test('all-day, multi-day and overnight appointments block the correct dates', () => {
  const allDay = scheduleTasks([task()], [busy({ allDay: true, endDate: '2026-10-14' })], settings())
  assert.ok(allDay.blocks[0].startAt.startsWith('2026-10-15'))
  const night = scheduleTasks([task()], [busy({ date: '2026-10-12', startTime: '23:00', endTime: '10:00' })], settings())
  assert.equal(night.blocks[0].startAt, '2026-10-13T10:10:00+09:00')
})
test('old weekly/monthly recurring anchors block occurrences in the planning window', () => {
  const weekly = scheduleTasks([task()], [busy({ date: '2026-09-29', repeat: 'weekly' })], settings())
  assert.equal(weekly.blocks[0].startAt, '2026-10-13T10:10:00+09:00')
  const monthly = scheduleTasks([task()], [busy({ date: '2026-09-13', repeat: 'monthly' })], settings())
  assert.equal(monthly.blocks[0].startAt, '2026-10-13T10:10:00+09:00')
})
test('cross-calendar timezones and current instant boundaries are respected', () => {
  const result = scheduleTasks([task()], [busy({ date: '2026-10-12', startTime: '17:00', endTime: '18:00', timezone: 'America/Los_Angeles' })], settings())
  assert.equal(result.blocks[0].startAt, '2026-10-13T10:10:00+09:00')
  const now = scheduleTasks([task()], [], settings({ now: '2026-10-13T01:00:30Z' }))
  assert.equal(now.blocks[0].startAt, '2026-10-13T10:01:00+09:00')
})
test('DST nonexistent/ambiguous windows are skipped; actual elapsed durations remain exact', () => {
  const spring = scheduleTasks([task('dst', { deadline: null })], [], settings({ timezone: 'America/New_York', startDate: '2026-03-08', endDate: '2026-03-08', dayStartTime: '02:00', dayEndTime: '04:00', now: '2026-03-08T00:00:00Z' }))
  assert.equal(spring.blocks.length, 0)
  assert.ok(spring.warnings.length)
  const fall = scheduleTasks([task('dst', { deadline: null, durationMinutes: 120 })], [], settings({ timezone: 'America/New_York', startDate: '2026-11-01', endDate: '2026-11-01', dayStartTime: '00:00', dayEndTime: '04:00', now: '2026-11-01T00:00:00Z', breakMinutes: 0 }))
  assert.equal(fall.tasks[0].scheduledMinutes, 120)
  assert.ok(fall.blocks.every(block => Date.parse(block.endAt)-Date.parse(block.startAt)===block.durationMinutes*60000))
  const midnight = scheduleTasks([task('midnight', { deadline: null })], [], settings({ timezone: 'America/Santiago', startDate:'2026-09-06', endDate:'2026-09-06', now:'2026-09-06T00:00:00Z' }))
  assert.equal(midnight.tasks[0].status,'scheduled')
})
test('unknown/estimated effort and deadlines stay visible; unsplittable and too-small tasks are not invented', () => {
  const estimated = scheduleTasks([task('unknown', { durationMinutes: null, deadline: null, priorityIsEstimate: true })], [], settings())
  assert.equal(estimated.tasks[0].task.durationMinutes, null)
  assert.equal(estimated.tasks[0].task.deadline, null)
  assert.ok(estimated.tasks[0].confirmationNeeded.length >= 3)
  const blocked = scheduleTasks([task('tiny', { durationMinutes: 10 }), task('whole', { durationMinutes: 180, splittable: false })], [], settings())
  assert.equal(blocked.tasks[0].reason, 'BELOW_MIN_BLOCK')
  assert.equal(blocked.tasks[1].status, 'unscheduled')
})
test('invalid settings, duplicate IDs and invalid calendar data fail closed', () => {
  assert.throws(() => settings({ timezone: 'bad' }))
  assert.throws(() => settings({ startDate: '2026-02-30' }))
  assert.throws(() => settings({ dayStartTime: '20:00', dayEndTime: '09:00' }))
  assert.throws(() => scheduleTasks([task(), task()], [], settings()))
  assert.throws(() => scheduleTasks([task()], [busy({ endTime: '99:00' })], settings()), { code: 'SCHEDULE_DATA_INVALID' })
})

const text = '이번 주에 시험 공부 5시간, 운동 2번 해야 해. 일정 알아서 짜줘.'
export function planningFixture(): PlanningAnalysis {
  const source = (id: string, title: string) => ({ id, type: 'task' as const, confidence: 0.9, source: 'ai' as const, draft: { title, date: null, startTime: null, endTime: null, dueDate: null, endDate: null, categoryId: null }, evidence: { date: null, startTime: null, endTime: null, dueDate: null, endDate: null }, categoryReason: null, uncertainties: [{ field: 'date' as const, reason: '엔진이 배치할 작업' }] })
  const meta = (sourceTaskId: string) => ({ sourceTaskId, durationMinutes: 300, durationIsEstimate: false, durationEvidence: '5시간', occurrences: 1, occurrencesEvidence: null, priority: 'medium' as const, priorityIsEstimate: true, deadline: '2026-10-18', deadlineIsEstimate: false, deadlineEvidence: '이번 주', splittable: true, preferredChunkMinutes: 60, notes: [] })
  return { version: 1, intent: 'PLAN_TASKS', analysis: { version: 1, route: 'ai', items: [source('study','시험 공부'),source('exercise','운동')], relations: [], warnings: [] }, tasks: [meta('study'), { ...meta('exercise'), durationMinutes: null, durationIsEstimate: true, durationEvidence: null, occurrences: 2, occurrencesEvidence: '2번', splittable: false }] }
}
test('PLAN_TASKS routing, shared analysis conversion and OpenAI semantic schema never accept generated placements', async () => {
  assert.deepEqual(routeInput(text), { route: 'planner', intent: 'PLAN_TASKS', reason: 'planning_request' })
  let called = 0
  const provider = createOpenAIPlanningProvider({ key: 'mock', fetch: async (_url, init) => {
    called++
    assert.ok(String(init?.body).includes('NEVER generate assigned dates or times'))
    return Response.json({ status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(planningFixture())}]}] })
  } })
  const analysis = await provider.analyzeTasks({ text, today:'2026-10-13',timezone:'Asia/Seoul',categories:[],horizonEnd:'2026-10-18' })
  assert.equal(called, 1)
  assert.equal(tasksFromPlanningAnalysis(analysis)[0].durationMinutes, 300)
  const bad = planningFixture(); bad.analysis.items[0].draft.date = '2026-10-14' as never
  assert.throws(() => validatePlanningAnalysis(bad, text))
  const wrongDuration = planningFixture(); wrongDuration.tasks[0].durationMinutes = 500
  assert.throws(() => validatePlanningAnalysis(wrongDuration, text))
  const wrongCount = planningFixture(); wrongCount.tasks[1].occurrences = 3
  assert.throws(() => validatePlanningAnalysis(wrongCount, text))
})
test('Planner reads existing data and returns a validated recommendation without any write path', async () => {
  const rows = Object.freeze([Object.freeze(busy())])
  const snapshot = structuredClone(rows)
  let read = 0
  const recommendation = await createPlanningRecommendation({ text, settings: { startDate:'2026-10-13',endDate:'2026-10-18' } }, {
    now:'2026-10-13T00:00:00Z', provider:{async analyzeTasks(){return planningFixture()}}, loadSettings:async()=>({breakMinutes:5}),loadCategories:async()=>[],loadSchedules:async()=>{read++;return [...rows]},
  })
  assert.equal(read,1)
  assert.deepEqual(rows,snapshot)
  assert.equal(validatePlanningRecommendation(recommendation,text).result.intent,'PLAN_TASKS')
  assert.equal(recommendation.result.tasks.length,2)
})
test('Planner Edge auth, malformed settings and repository failure block generation, preserving data', async () => {
  let calls=0
  const dependencies = { now:'2026-10-13T00:00:00Z',provider:{async analyzeTasks(){calls++;return planningFixture()}},loadSettings:async()=>({}),loadCategories:async()=>[],loadSchedules:async()=>[busy()] }
  const handler = createPlanTasksHandler({authenticate:async()=>dependencies})
  const request=(body:unknown)=>new Request('http://local',{method:'POST',body:JSON.stringify(body)})
  assert.equal((await handler(request({text}))).status,200)
  assert.equal((await handler(request({text,settings:{now:'fake'}}))).status,400)
  const unauthorized=createPlanTasksHandler({authenticate:async()=>null})
  assert.equal((await unauthorized(request({text}))).status,401)
  const failing=createPlanTasksHandler({authenticate:async()=>({...dependencies,loadSchedules:async()=>{throw new Error('DB offline')}})})
  assert.equal((await failing(request({text}))).status,502)
  assert.equal(calls,1)
})
test('planning repository includes old recurring/multi-day anchors and uses read-only pagination', async () => {
  const calls:unknown[]=[]
  const query={select(value:string){calls.push(['select',value]);return this},lte(...args:unknown[]){calls.push(args);return this},or(value:string){calls.push(value);return this},order(){return this},async range(){return {data:[],error:null}}}
  const repo=createScheduleRepository({from:()=>query} as unknown as SupabaseClient<Database>)
  await repo.listForPlanning('2026-10-13','2026-10-18')
  assert.ok(JSON.stringify(calls).includes('repeat_rule.neq.none'))
  assert.ok(JSON.stringify(calls).includes('end_date.gte.2026-10-11'))
  await assert.rejects(repo.listForPlanning('bad','2026-10-18'))
})
test('phase 4 API validates response and preserves server errors without schedule mutations', async () => {
  const recommendation=await createPlanningRecommendation({text},{now:'2026-10-13T00:00:00Z',provider:{async analyzeTasks(){return planningFixture()}},loadSettings:async()=>({}),loadCategories:async()=>[],loadSchedules:async()=>[]})
  const client={functions:{async invoke(name:string){assert.equal(name,'plan-tasks');return {data:recommendation,error:null}}}} as unknown as SupabaseClient<Database>
  assert.equal((await planTasksFromText(client,{text})).result.recommendationOnly,true)
  recommendation.result.recommendationOnly=false as never
  await assert.rejects(planTasksFromText(client,{text}),{code:'AI_RESPONSE_INVALID'})
})
