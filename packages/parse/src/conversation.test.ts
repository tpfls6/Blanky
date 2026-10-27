import test from 'node:test'
import assert from 'node:assert/strict'
import { conversationIntent } from '../../../src/features/ai/conversation.ts'
import { parseScheduleText } from './parse.ts'
import type { WorkItem } from '../../../src/types/work.ts'

const today = new Date(2026, 9, 7)
const item: WorkItem = { id: 'saved-id', kind: 'event', title: '운동', date: '2026-10-08', startTime: '15:00', endTime: '16:00', duration: 60,
  description: '', categoryId: null, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'none' }

test('create command reuses the parser and removes conversational suffix', () => {
  const intent = conversationIntent('내일 오후 3시에 운동 추가해줘', [], null, today, [])
  assert.equal(intent.type, 'create')
  if (intent.type !== 'create') return
  const parsed = parseScheduleText(intent.text, { today })
  assert.equal(parsed.draft.title, '운동')
  assert.equal(parsed.draft.date, '2026-10-08')
  assert.equal(parsed.draft.startTime, '15:00')
})
test('follow-up resolves saved ID and preserves duration and afternoon', () => {
  const intent = conversationIntent('그거 5시로 바꿔줘', [item], item.id, today, [])
  assert.equal(intent.type, 'update')
  if (intent.type !== 'update') return
  assert.equal(intent.item.id, item.id)
  assert.equal(intent.patch.startTime, '17:00')
  assert.equal(intent.patch.endTime, '18:00')
})
test('relative shift and completion reuse an existing entity', () => {
  const shift = conversationIntent('내일 운동 한 시간 뒤로 미뤄줘', [item], null, today, [])
  assert.equal(shift.type, 'update')
  if (shift.type === 'update') assert.equal(shift.patch.startTime, '16:00')
  const done = conversationIntent('운동 완료해줘', [item], null, today, [])
  assert.equal(done.type, 'update')
  if (done.type === 'update') assert.equal(done.patch.status, 'done')
})
test('ambiguous, missing and advanced requests never create or mutate', () => {
  assert.equal(conversationIntent('운동 5시로 바꿔줘', [item, { ...item, id: 'other' }], null, today, []).type, 'reply')
  assert.equal(conversationIntent('그거 5시로 바꿔줘', [], item.id, today, []).type, 'reply')
  assert.equal(conversationIntent('오늘 일정 너무 많은데 정리해줘', [item], null, today, []).type, 'reply')
})
test('today query and task deadline are parsed by existing core', () => {
  const list = conversationIntent('오늘 일정 뭐 있어?', [item], null, today, [])
  assert.equal(list.type, 'list')
  if (list.type === 'list') assert.equal(list.date, '2026-10-07')
  const intent = conversationIntent('금요일까지 발표자료 만들기 추가해줘', [], null, today, [])
  if (intent.type !== 'create') throw new Error('Expected create')
  const parsed = parseScheduleText(intent.text, { today })
  assert.equal(parsed.type, 'task')
  assert.equal(parsed.draft.dueDate, '2026-10-09')
})
test('duplicate cleanup, delete, conflicts and English verbs stay on existing items', () => {
  const workA = { ...item, id: 'w1', title: '근로' }
  const workB = { ...item, id: 'w2', title: '근로' }
  const classA = { ...item, id: 'c1', title: '수업' }
  assert.equal(conversationIntent('근로랑 수업이 두 개씩 있어. 중복 삭제해줘', [workA, workB, classA], null, today, []).type, 'dedupe')
  assert.equal(conversationIntent('내일 근로 빼줘', [workA], null, today, []).type, 'delete')
  const moved = conversationIntent('내일 수업 3시로 옮겨줘', [classA], null, today, [])
  assert.equal(moved.type, 'update')
  if (moved.type === 'update') {
    assert.equal(moved.patch.startTime, '15:00')
    assert.equal(moved.patch.date, '2026-10-08')
  }
  const conflicts = conversationIntent('다음 주 일정 중 겹치는 거 찾아줘', [workA, classA], null, today, [])
  assert.equal(conflicts.type, 'conflicts')
  const undone = conversationIntent('어제 못한 일 내일로 옮겨줘', [{ ...item, id: 't1', kind: 'task', title: '과제', date: '2026-10-06', status: 'todo' }], null, today, [])
  assert.equal(undone.type, 'move_incomplete')
  if (undone.type === 'move_incomplete') {
    assert.equal(undone.from, '2026-10-06')
    assert.equal(undone.to, '2026-10-08')
  }
  assert.equal(conversationIntent('show my schedule today', [item], null, today, []).type, 'list')
  const english = conversationIntent('move 수업 to 3pm tomorrow', [classA], null, today, [])
  assert.equal(english.type, 'update')
  if (english.type === 'update') assert.equal(english.patch.startTime, '15:00')
  assert.equal(conversationIntent('remove duplicate events', [workA, workB], null, today, []).type, 'dedupe')
  assert.equal(conversationIntent('근로 빼줘', [workA, { ...workA, id: 'w3', date: '2026-10-09' }], null, today, []).type, 'reply')
})
test('follow-up can change a date, task deadline or title without creating an item', () => {
  const date = conversationIntent('그거 모레로 바꿔줘', [item], item.id, today, [])
  assert.equal(date.type, 'update')
  if (date.type === 'update') assert.equal(date.patch.date, '2026-10-09')
  const task = { ...item, kind: 'task' as const }
  const deadline = conversationIntent('그거 마감 금요일까지로 바꿔줘', [task], item.id, today, [])
  assert.equal(deadline.type, 'update')
  if (deadline.type === 'update') assert.equal(deadline.patch.dueDate, '2026-10-09')
  const rename = conversationIntent('그거 제목을 달리기로 바꿔줘', [item], item.id, today, [])
  assert.equal(rename.type, 'update')
  if (rename.type === 'update') assert.equal(rename.patch.title, '달리기')
})
