import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { repeatsOn } from '../packages/types/src/recurrence.ts'
import { extractIntents, needsIntentAI, needsIntentPlan, resolveClock } from '../packages/parse/src/intents.ts'
import { mergeIntentResults, validateIntentAnalysis } from '../packages/parse/src/intentAnalysis.ts'
import { parseKoreanDate } from '../packages/parse/src/parse.ts'
import { captureIntent, hasScheduleSignal, shouldSaveAnalysisAsMemo } from '../src/utils/captureIntent.ts'
import type { WorkItem } from '../src/types/work.ts'

// App utils import the Vite alias @blanky/utils; map it the same way for this test only.
registerHooks({ resolve: (specifier, context, next) => specifier === '@blanky/utils'
  ? { url: pathToFileURL(`${process.cwd()}/packages/utils/src/index.ts`).href, shortCircuit: true }
  : next(specifier, context) })
const { planIntents, runIntentPlan, describeIntentPlan } = await import('../src/features/ai/intentPlan.ts')
const { applySeriesChangeLocally, shiftISO } = await import('../src/features/schedule/seriesEdit.ts')
const { createScheduleHandler } = await import('../supabase/functions/parse-schedule/handler.ts')

// 2026-11-04 is a Wednesday; 이번 주 금요일 is 2026-11-06.
const TODAY = new Date(2026, 10, 4)
const base = { description: '', categoryId: null, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, calendarId: 'cal' } as const
const work: WorkItem = { ...base, id: 'work', kind: 'event', title: '근로', date: '2026-10-05', startTime: '09:00', endTime: '18:00', duration: 540, repeat: 'weekly', repeatDays: [1, 3, 5] }
const lecture: WorkItem = { ...base, id: 'lecture', kind: 'event', title: '자료구조 수업', date: '2026-09-03', startTime: '13:00', endTime: '15:00', duration: 120, repeat: 'weekly', repeatDays: [4] }
const meeting: WorkItem = { ...base, id: 'meeting', kind: 'event', title: '팀 회의', date: '2026-11-05', startTime: '14:00', endTime: '15:00', duration: 60, repeat: 'none', repeatDays: [] }
const dinner: WorkItem = { ...base, id: 'dinner', kind: 'event', title: '민수랑 저녁 약속', date: '2026-11-07', startTime: '18:00', endTime: '20:00', duration: 120, repeat: 'none', repeatDays: [] }
const ITEMS = [work, lecture, meeting, dinner]

function plan(text: string, items: WorkItem[] = ITEMS, lastId: string | null = null) {
  let next = 0
  return planIntents(extractIntents(text, TODAY), items, { today: '2026-11-04', lastId, makeId: () => `new-${++next}` })
}

/** Rows after the plan: changes applied, new items added. */
function after(result: ReturnType<typeof plan>, items: WorkItem[] = ITEMS): WorkItem[] {
  let rows = [...items]
  for (const action of result.actions) {
    if (action.op === 'change') rows = applySeriesChangeLocally(rows, action.changes)
    if (action.op === 'create') rows.push({ ...base, ...action.input, endDate: null, repeat: 'none', repeatDays: [] } as WorkItem)
  }
  return rows
}

/** "start–end" of the work occurrence on each day, one row per day. */
function workDays(rows: WorkItem[], from: string, to: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (let day = from; day <= to; day = shiftISO(day, 1)) {
    const hits = rows.filter(row => (row.id === 'work' || row.seriesId === 'work') && repeatsOn(row, day))
    assert.ok(hits.length <= 1, `duplicate work occurrence on ${day}`)
    if (hits[0]) out[day] = `${hits[0].startTime}–${hits[0].endTime}`
  }
  return out
}

test('이번주 (붙여쓰기) and 다음주 resolve like their spaced forms', () => {
  assert.equal(parseKoreanDate('이번주 금요일은', TODAY), '2026-11-06')
  assert.equal(parseKoreanDate('다음주 월요일', TODAY), '2026-11-09')
  assert.equal(parseKoreanDate('이번 주 금요일', TODAY), '2026-11-06')
})

test('the reported sentence is a schedule, never a memo', () => {
  const text = '이번주 금요일은 1시 퇴근하고 도현오빠랑 데이트 있어'
  assert.equal(captureIntent(text).type, 'conversation')
  assert.equal(hasScheduleSignal(text), true)
  assert.equal(shouldSaveAnalysisAsMemo([], text), false)
  assert.equal(shouldSaveAnalysisAsMemo([], '조용한 하루'), true)
})

test('퇴근 at 1 changes only this Friday’s work end to 13:00 and adds the date', () => {
  for (const text of ['이번주 금요일은 1시 퇴근하고 도현오빠랑 데이트 있어', '이번주 금욜 1시 퇴근하구 도현오빠랑 데이트 잇어', '이번 주 금요일 1시에 퇴근하고 도현오빠랑 데이트 있음']) {
    const result = plan(text)
    assert.equal(result.mode, 'preview', text)
    const change = result.actions.find(action => action.op === 'change')
    assert.ok(change && change.op === 'change' && change.target.id === 'work' && change.recurring, text)
    const create = result.actions.find(action => action.op === 'create')
    assert.ok(create && create.op === 'create', text)
    assert.equal(create.input.title, '도현오빠랑 데이트')
    assert.equal(create.input.date, '2026-11-06')
    // No time was said for the date: nothing is invented, the user is asked.
    assert.equal(create.input.startTime, null)
    assert.equal(create.input.allDay, true)
    assert.match(create.input.description ?? '', /13:00 이후/)
    assert.ok(result.questions.some(question => question.includes('도현오빠랑 데이트')), text)

    const rows = after(result)
    assert.deepEqual(workDays(rows, '2026-10-26', '2026-11-20'), {
      '2026-10-26': '09:00–18:00', '2026-10-28': '09:00–18:00', '2026-10-30': '09:00–18:00',
      '2026-11-02': '09:00–18:00', '2026-11-04': '09:00–18:00', '2026-11-06': '09:00–13:00',
      '2026-11-09': '09:00–18:00', '2026-11-11': '09:00–18:00', '2026-11-13': '09:00–18:00',
      '2026-11-16': '09:00–18:00', '2026-11-18': '09:00–18:00', '2026-11-20': '09:00–18:00',
    }, text)
    // The series keeps its weekly rule: the cut and the continuation are both still weekly Mon/Wed/Fri.
    for (const row of rows.filter(row => row.id === 'work' || (row.seriesId === 'work' && row.repeat !== 'none'))) {
      assert.equal(row.repeat, 'weekly')
      assert.deepEqual(row.repeatDays, [1, 3, 5])
    }
  }
})

test('no saved work schedule: ask instead of guessing, still offer the new event', () => {
  const result = plan('이번주 금요일은 1시 퇴근하고 도현오빠랑 데이트 있어', [meeting])
  assert.equal(result.actions.filter(action => action.op === 'change').length, 0)
  assert.ok(result.questions.some(question => /근무.*찾지 못했어요/.test(question)))
  assert.equal(result.mode, 'preview')
})

test('compound sentence: cancel one class occurrence and add an appointment', () => {
  const result = plan('목요일 수업 휴강이래 그리고 금요일 3시에 치과 예약 있어')
  const cancel = result.actions[0]
  assert.ok(cancel.op === 'change' && cancel.target.id === 'lecture' && cancel.removes)
  const rows = after(result)
  assert.equal(rows.some(row => (row.id === 'lecture' || row.seriesId === 'lecture') && repeatsOn(row, '2026-11-05')), false)
  assert.equal(rows.some(row => (row.id === 'lecture' || row.seriesId === 'lecture') && repeatsOn(row, '2026-11-12')), true)
  const create = result.actions[1]
  assert.ok(create.op === 'create' && create.input.title === '치과 예약' && create.input.date === '2026-11-06' && create.input.startTime === '15:00')
  // 15:00 on Friday overlaps work, and 3시 without 오후 is a guess: both shown before running.
  assert.ok(result.confirm.some(reason => reason.includes('근로')))
  assert.ok(result.confirm.some(reason => reason.includes('15:00로 이해')))
  assert.equal(result.mode, 'preview')
})

test('cancelled appointments, moves and shifts link to the saved item', () => {
  const cancelled = plan('토요일 약속 취소됐어')
  assert.ok(cancelled.actions[0].op === 'change' && cancelled.actions[0].target.id === 'dinner' && cancelled.actions[0].removes)
  assert.equal(cancelled.mode, 'preview')

  const moved = plan('내일 회의 3시로 미뤄줘')
  assert.equal(moved.mode, 'auto')
  const update = moved.actions[0]
  assert.ok(update.op === 'change')
  assert.deepEqual(update.changes[0].update?.patch, { startTime: '15:00', allDay: false, endTime: '16:00', duration: 60 })

  const shifted = plan('팀 회의 한 시간 미뤄 주세요')
  assert.ok(shifted.actions[0].op === 'change')
  assert.equal(shifted.actions[0].changes[0].update?.patch.startTime, '15:00')

  const day = plan('팀 회의 하루 미뤄줘')
  assert.ok(day.actions[0].op === 'change')
  assert.equal(day.actions[0].changes[0].update?.patch.date, '2026-11-06')

  const followUp = plan('그거 5시로 바꿔줘', ITEMS, 'meeting')
  assert.ok(followUp.actions[0].op === 'change')
  assert.equal(followUp.actions[0].changes[0].update?.patch.startTime, '17:00')
})

test('moving one occurrence of a routine to another day keeps the rule for other weeks', () => {
  const result = plan('이번주 금요일 근로 토요일로 옮겨줘')
  const rows = after(result)
  const days = workDays(rows, '2026-11-02', '2026-11-13')
  assert.equal(days['2026-11-06'], undefined)
  assert.equal(days['2026-11-07'], '09:00–18:00')
  assert.equal(days['2026-11-13'], '09:00–18:00')
  assert.equal(result.mode, 'preview')
})

test('부터 changes the series from that day on', () => {
  const result = plan('다음 주부터 근무 10시 출근으로 바꿔줘')
  const days = workDays(after(result), '2026-11-02', '2026-11-13')
  assert.equal(days['2026-11-06'], '09:00–18:00')
  assert.equal(days['2026-11-09'], '10:00–18:00')
  assert.equal(days['2026-11-13'], '10:00–18:00')
})

test('relative relations: 수업 끝나고 places a task after the class without a made-up time', () => {
  const result = plan('내일 수업 끝나고 도서관 가기')
  assert.equal(result.actions.length, 1)
  const create = result.actions[0]
  assert.ok(create.op === 'create' && create.input.kind === 'task' && create.input.date === '2026-11-05')
  assert.equal(create.input.startTime, null)
  assert.match(create.input.description ?? '', /15:00 이후/)
})

test('unclear target, day or change asks only what is missing and saves nothing', () => {
  const twoMeetings = [meeting, { ...meeting, id: 'meeting-2', title: '프로젝트 회의', startTime: '10:00', endTime: '11:00' }]
  const ambiguous = plan('내일 회의 3시로 미뤄줘', twoMeetings)
  assert.equal(ambiguous.actions.length, 0)
  assert.match(ambiguous.questions[0], /여러 개/)

  const noDay = plan('근무 시간 바꿔줘')
  assert.equal(noDay.actions.length, 0)
  assert.match(noDay.questions[0], /어느 날짜/)

  const noChange = plan('내일 회의 바꿔줘')
  assert.equal(noChange.actions.length, 0)
  assert.match(noChange.questions[0], /어떻게 바꿀지/)

  const missing = plan('목요일 동아리 회식 취소됐어')
  assert.equal(missing.actions.length, 0)
  assert.match(missing.questions[0], /찾지 못했어요/)
  assert.match(describeIntentPlan(missing), /저장하지 않았어요/)
})

test('a bare end hour reads after the start; an explicit earlier end is refused', () => {
  const evening = plan('이번주 금요일 8시 퇴근')
  assert.deepEqual(workDays(after(evening), '2026-11-06', '2026-11-06'), { '2026-11-06': '09:00–20:00' })
  const early = plan('이번주 금요일 오전 8시 퇴근')
  assert.equal(early.actions.length, 0)
  assert.match(early.questions[0], /종료 시간이 시작보다 빨라요/)
})

test('typos and spoken forms read like the standard sentence', () => {
  const result = plan('낼 회의 3씨로 미뤄죠')
  assert.ok(result.actions[0]?.op === 'change')
  assert.equal(result.actions[0].changes[0].update?.patch.startTime, '15:00')
  // Thursday has no work occurrence: nothing is changed and the user is told.
  const thursday = plan('낼 오후 2시 출근이야')
  assert.equal(thursday.actions.length, 0)
  assert.match(thursday.questions[0], /11\/5\(목\) '근무' 일정을 찾지 못했어요/)
  const friday = plan('이번주 금욜 오후 2시 출근')
  assert.deepEqual(workDays(after(friday), '2026-11-06', '2026-11-06'), { '2026-11-06': '14:00–18:00' })
})

test('clock reading uses the saved item as context', () => {
  assert.deepEqual(resolveClock({ hour: 1, minute: 0, explicit: false }, { after: '09:00' }), { time: '13:00', guessed: false })
  assert.deepEqual(resolveClock({ hour: 10, minute: 0, explicit: false }, { near: '09:00' }), { time: '10:00', guessed: false })
  assert.deepEqual(resolveClock({ hour: 3, minute: 0, explicit: false }), { time: '15:00', guessed: true })
  assert.deepEqual(resolveClock({ hour: 9, minute: 30, explicit: false }), { time: '09:30', guessed: false })
  assert.deepEqual(resolveClock({ hour: 1, minute: 0, explicit: true }), { time: '01:00', guessed: false })
})

test('simple creations, memos and diary keep the existing routes', () => {
  assert.equal(needsIntentPlan(extractIntents('내일 오후 3시 회의', TODAY)), false)
  assert.equal(needsIntentPlan(extractIntents('금요일까지 과제 제출', TODAY)), false)
  assert.equal(needsIntentPlan(extractIntents('토요일 약속 취소됐어', TODAY)), true)
  const mixed = extractIntents('내일 3시 회의 있고 회의 아이디어는 메모해줘', TODAY)
  assert.deepEqual(mixed.intents.map(intent => intent.kind), ['create_event', 'memo'])
  assert.equal(needsIntentPlan(mixed), true)
  assert.equal(captureIntent('메모: 도현오빠 생일 선물 후보').type, 'memo')
  assert.equal(captureIntent('오늘 도현오빠랑 데이트해서 즐거웠다').type, 'diary')
})

test('two independent items in one sentence keep their own dates', () => {
  const result = extractIntents('금요일 저녁 7시 동아리 모임 있고 토요일까지 보고서 제출해야 해', TODAY)
  assert.deepEqual(result.intents.map(intent => [intent.kind, intent.title, intent.date]), [
    ['create_event', '동아리 모임', '2026-11-06'], ['create_task', '보고서 제출', '2026-11-07'],
  ])
})

test('unreadable schedule clauses are handed to the AI layer', () => {
  assert.equal(needsIntentAI(extractIntents('금요일 3시 도현오빠', TODAY)), true)
  assert.equal(needsIntentAI(extractIntents('이번주 금요일은 1시 퇴근하고 도현오빠랑 데이트 있어', TODAY)), false)
})

const AI_OUTPUT = {
  version: 1,
  intents: [
    { id: 'a', kind: 'modify', clause: '금요일은 1시 퇴근하고', title: null, targetTerms: [], family: 'work', date: '2026-11-06', dateEvidence: '금요일', newDate: null, newDateEvidence: null,
      startTime: null, startEvidence: null, endTime: '13:00', endEvidence: '1시', boundary: 'end', shiftMinutes: null, scope: 'this', afterId: null, missing: [] },
    { id: 'b', kind: 'create_event', clause: '도현오빠랑 데이트 있어', title: '도현오빠랑 데이트', targetTerms: [], family: null, date: '2026-11-06', dateEvidence: '금요일', newDate: null, newDateEvidence: null,
      startTime: null, startEvidence: null, endTime: null, endEvidence: null, boundary: null, shiftMinutes: null, scope: 'this', afterId: 'a', missing: ['time'] },
  ],
  questions: ['데이트는 몇 시인가요?'],
}
const AI_TEXT = '이번주 금요일은 1시 퇴근하고 도현오빠랑 데이트 있어'

test('AI intents are validated and keep bare hours ambiguous for the planner', () => {
  const extraction = validateIntentAnalysis(structuredClone(AI_OUTPUT), AI_TEXT)
  assert.equal(extraction.source, 'ai')
  // The model wrote 13:00 for "1시"; without a meridiem in the evidence it stays a bare 1.
  assert.deepEqual(extraction.intents[0].end, { hour: 1, minute: 0, explicit: false })
  const result = planIntents(extraction, ITEMS, { today: '2026-11-04', makeId: () => 'x' })
  assert.equal(workDays(after(result), '2026-11-06', '2026-11-06')['2026-11-06'], '09:00–13:00')
  assert.ok(result.confirm.some(reason => reason.includes('AI')))
})

test('AI intents without verbatim evidence, with forward relations or unknown kinds are rejected', () => {
  const bad = (edit: (value: typeof AI_OUTPUT) => void) => { const value = structuredClone(AI_OUTPUT); edit(value); return () => validateIntentAnalysis(value, AI_TEXT) }
  assert.throws(bad(value => { value.intents[0].endEvidence = '13시' }))
  assert.throws(bad(value => { value.intents[0].dateEvidence = null }))
  assert.throws(bad(value => { value.intents[0].clause = '다른 문장' }))
  assert.throws(bad(value => { value.intents[0].afterId = 'b' }))
  assert.throws(bad(value => { (value.intents[0] as { kind: string }).kind = 'delete_all' }))
  assert.throws(bad(value => { value.intents[1].title = null }))
})

test('parse-schedule serves intents-v1 through the injected provider only after auth', async () => {
  const handler = createScheduleHandler({
    getEnv: () => undefined,
    authorize: async request => request.headers.get('Authorization') === 'Bearer ok',
    loadPersonal: async () => ({ categories: [], rules: [] }),
    intentProvider: { analyze: async () => structuredClone(AI_OUTPUT) },
  })
  const request = (auth: string) => new Request('https://x/parse', { method: 'POST', headers: { Authorization: auth }, body: JSON.stringify({ text: AI_TEXT, timezone: 'Asia/Seoul', format: 'intents-v1' }) })
  assert.equal((await handler(request('Bearer no'))).status, 401)
  const response = await handler(request('Bearer ok'))
  assert.equal(response.status, 200)
  assert.equal(validateIntentAnalysis(await response.json(), AI_TEXT).intents.length, 2)
})

test('running a plan applies each action independently and skips stale targets', async () => {
  const result = plan('목요일 수업 휴강이래 그리고 금요일 3시에 치과 예약 있어')
  const commits: string[] = []
  const run = await runIntentPlan(result, {
    items: ITEMS,
    commitChange: async changes => { commits.push(changes.map(change => change.remove ? 'remove' : change.update ? 'update' : 'create').join(',')); return { updated: [], created: [] } },
    createBatch: async () => { throw new Error('네트워크 오류') },
    saveRecord: () => undefined,
  })
  assert.equal(commits.length, 1)
  assert.equal(run.failed.length, 1)
  assert.match(run.failed[0].reason, /네트워크/)

  const stale = await runIntentPlan(plan('토요일 약속 취소됐어'), {
    items: [{ ...dinner, startTime: '19:00' }, work, lecture, meeting],
    commitChange: async () => { throw new Error('must not run') },
    createBatch: async () => [],
    saveRecord: () => undefined,
  })
  assert.match(stale.failed[0].reason, /바뀌어 건너뛰었어요/)
})

test('AI dates are recounted from their evidence and a 퇴근 clock written as a start becomes the end', () => {
  const value = structuredClone(AI_OUTPUT)
  value.intents[0].date = '2026-11-13'
  value.intents[0].dateEvidence = '이번주 금요일'
  value.intents[0].startTime = '01:00'; value.intents[0].startEvidence = '1시'
  value.intents[0].endTime = null; value.intents[0].endEvidence = null
  const extraction = validateIntentAnalysis(value, AI_TEXT, TODAY)
  assert.equal(extraction.intents[0].date, '2026-11-06')
  assert.equal(extraction.intents[0].start, null)
  assert.deepEqual(extraction.intents[0].end, { hour: 1, minute: 0, explicit: false })
})

test('AI only fills clauses the rules could not read', () => {
  const ai = validateIntentAnalysis(structuredClone(AI_OUTPUT), AI_TEXT)
  const read = extractIntents(AI_TEXT, TODAY)
  assert.equal(mergeIntentResults(read, ai), read)
  const empty = { ...read, intents: [], unresolved: [AI_TEXT] }
  assert.equal(mergeIntentResults(empty, ai), ai)
  const partial = { ...read, unresolved: ['도현오빠랑 데이트 있어'] }
  const merged = mergeIntentResults(partial, ai)
  assert.equal(merged.source, 'ai')
  assert.deepEqual(merged.intents.slice(read.intents.length).map(intent => [intent.id, intent.afterId]), [['ai-b', null]])
})
