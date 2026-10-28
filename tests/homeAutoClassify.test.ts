import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveScheduleAnalysis } from '../packages/parse/src/resolve.ts'
import { captureIntent, shouldSaveAnalysisAsMemo } from '../src/utils/captureIntent.ts'

const today = new Date(2026, 9, 27)

async function classifyHomeAuto(text: string) {
  const capture = captureIntent(text)
  if (capture.type === 'diary' || capture.type === 'memo' || capture.type === 'reading') return capture.type
  const result = await resolveScheduleAnalysis(text, { today, categories: [] })
  if (shouldSaveAnalysisAsMemo(result.items)) return 'memo'
  return result.items[0]?.type ?? 'memo'
}

const cases = [
  ['이번 주 수요일까지 논문 읽기', 'task'],
  ['토요일에 데이트', 'event'],
  ['내일 친구 만나기', 'event'],
  ['금요일까지 보고서 제출', 'task'],
  ['다음 주 월요일 병원 예약', 'event'],
  ['오늘 운동하기', 'task'],
  ['주말에 영화 보기', 'event'],
  ['React 공부하기', 'task'],
  ['오늘 회의에서 나온 아이디어 정리', 'task'],
  ['React의 상태 관리는 useState로 가능하다', 'memo'],
  ['오늘 날씨가 정말 좋았다', 'memo'],
  ['나중에 참고할 책 목록', 'memo'],
] as const

test('home auto-classify keeps Event/Task and memos only leftover notes', async () => {
  for (const [text, expected] of cases) {
    assert.equal(await classifyHomeAuto(text), expected, text)
  }
})

test('analysis with a due date or missing event time is not a memo', () => {
  assert.equal(shouldSaveAnalysisAsMemo([{ draft: { date: null, dueDate: '2026-10-28' }, uncertainties: [{ field: 'date' }] }]), false)
  assert.equal(shouldSaveAnalysisAsMemo([{ draft: { date: '2026-10-31', dueDate: null }, uncertainties: [{ field: 'startTime' }] }]), false)
  assert.equal(shouldSaveAnalysisAsMemo([]), true)
})
