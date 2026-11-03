import assert from 'node:assert/strict'
import test from 'node:test'
import type { AnalysisItem, ScheduleAnalysis } from '../../../packages/types/src/ai.ts'
import type { WorkItem } from '../../types/work.ts'
import { ambiguousHour, chipDetail, planAutoSave, reviewAnalysis, saveConflicts } from './autoSave.ts'

const evidence = { date: null, startTime: null, endTime: null, dueDate: null, endDate: null }
const event = (id: string, title: string, date: string, startTime: string | null, extra: Partial<AnalysisItem> = {}): AnalysisItem => ({
  id, type: 'event', confidence: 0.9, source: 'rule', evidence, categoryReason: null, uncertainties: [],
  draft: { title, date, startTime, endTime: null, dueDate: null, endDate: null, categoryId: null }, ...extra,
})
const analysis = (...items: AnalysisItem[]): ScheduleAnalysis => ({ version: 1, route: 'parser', items, relations: [], warnings: [] })
let counter = 0
const ids = () => `id-${++counter}`
const saved = (patch: Partial<WorkItem>): WorkItem => ({
  id: 'w', kind: 'event', title: '회의', description: '', date: '2026-11-04', startTime: '15:00', endTime: '16:00', duration: 60,
  categoryId: null, priority: 'medium', status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'none', ...patch,
} as WorkItem)

test('single and multiple clear items are all ready to save', () => {
  const task: AnalysisItem = { ...event('t', '과제 제출', '', null), type: 'task', draft: { title: '과제 제출', date: null, startTime: null, endTime: null, dueDate: '2026-11-06', endDate: null, categoryId: null } }
  const plan = planAutoSave(analysis(event('a', '회의', '2026-11-04', '15:00'), task), '내일 오후 3시 회의, 금요일까지 과제 제출', [], [], undefined, ids)
  assert.equal(plan.review.length, 0)
  assert.deepEqual(plan.ready.map(row => [row.kind, row.title, row.date, row.dueDate]), [['event', '회의', '2026-11-04', null], ['task', '과제 제출', '2026-11-06', '2026-11-06']])
  assert.ok(plan.ready.every(row => row.id.startsWith('id-')))
})

test('repeat words become a series and leave the title', () => {
  const plan = planAutoSave(analysis(event('a', '매주 스터디', '2026-11-09', '10:00')), '매주 월요일 10시 스터디', [], [], undefined, ids)
  assert.equal(plan.ready[0].repeat, 'weekly')
  assert.equal(plan.ready[0].title, '스터디')
  assert.equal(planAutoSave(analysis(event('a', '운동', '2026-11-04', '07:00')), '매일 아침 7시 운동', [], [], undefined, ids).ready[0].repeat, 'daily')
})

test('parser uncertainty and bare early hours wait for confirmation', () => {
  const noTime = event('a', '회의', '2026-11-04', null, { uncertainties: [{ field: 'startTime', reason: '시각이 없어요. 종일 일정인지 확인해 주세요.' }] })
  assert.deepEqual(planAutoSave(analysis(noTime), '내일 회의', [], [], undefined, ids).review[0].reasons, ['시각이 없어요. 종일 일정인지 확인해 주세요.'])
  const early = planAutoSave(analysis(event('a', '회의', '2026-11-04', '03:00')), '내일 3시 회의', [], [], undefined, ids)
  assert.equal(early.ready.length, 0)
  assert.match(early.review[0].reasons[0], /오전/)
  assert.equal(early.review[0].input?.startTime, '03:00')
  assert.equal(planAutoSave(analysis(noTime), '내일 회의', [], [], undefined, ids).review[0].input, undefined)
  assert.equal(ambiguousHour('내일 오후 3시 회의', '15:00'), false)
  assert.equal(ambiguousHour('내일 10시 회의', '10:00'), false)
})

test('only the conflicting item waits; the clear one still saves', () => {
  const plan = planAutoSave(analysis(event('a', '회의', '2026-11-04', '15:00'), event('b', '병원', '2026-11-05', '14:00')), '내일 오후 3시 회의 모레 오후 2시 병원', [saved({ title: '회의' })], [], undefined, ids)
  assert.deepEqual(plan.ready.map(row => row.title), ['병원'])
  assert.match(plan.review[0].reasons[0], /이미 같은 일정/)
  assert.match(saveConflicts({ kind: 'event', title: '면담', date: '2026-11-04', startTime: '15:30' }, [saved({ title: '회의' })])[0], /겹쳐요/)
  assert.deepEqual(saveConflicts({ kind: 'event', title: '면담', date: '2026-11-04', startTime: '17:00' }, [saved({ title: '회의' })]), [])
  const repeated = planAutoSave(analysis(event('a', '회의', '2026-11-04', '15:00'), event('b', '회의', '2026-11-04', '15:00')), '오후 3시 회의 오후 3시 회의', [], [], undefined, ids)
  assert.equal(repeated.ready.length, 1)
  assert.match(repeated.review[0].reasons[0], /중복/)
})

test('review analysis keeps only waiting items and shows our reasons', () => {
  const source = analysis(event('a', '회의', '2026-11-04', '03:00'), event('b', '병원', '2026-11-05', '14:00'))
  const narrowed = reviewAnalysis(source, [{ item: source.items[0], reasons: ['03:00(오전)로 이해했어요.'] }])
  assert.deepEqual(narrowed.items.map(item => item.id), ['a'])
  assert.equal(narrowed.items[0].uncertainties[0].reason, '03:00(오전)로 이해했어요.')
})

test('chip detail shows date, time and repeat briefly', () => {
  assert.equal(chipDetail(saved({ repeat: 'weekly', repeatDays: [1, 3] })), '11/4(수) · 15:00–16:00 · 매주 월·수')
  assert.equal(chipDetail(saved({ kind: 'task', startTime: null, endTime: null, dueDate: '2026-11-06', dueTime: '18:00' })), '11/6(금) 18:00까지')
  assert.equal(chipDetail(saved({ startTime: null, endTime: null })), '11/4(수) · 종일')
})
