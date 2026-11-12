import assert from 'node:assert/strict'
import test from 'node:test'
import { readRecurrence } from './recurrence.ts'

// Thursday 2026-11-05.
const today = new Date(2026, 10, 5)
const read = (text: string) => {
  const rule = readRecurrence(text, today)
  return rule && { ...rule }
}

test('daily, every N days, weekdays and weekends', () => {
  assert.deepEqual(read('매일 영양제 먹기'), { repeat: 'daily', repeatDays: [], repeatInterval: 1, repeatUntil: null, start: '2026-11-05', rest: '영양제 먹기' })
  assert.deepEqual(read('3일마다 화분 물주기'), { repeat: 'daily', repeatDays: [], repeatInterval: 3, repeatUntil: null, start: '2026-11-05', rest: '화분 물주기' })
  assert.deepEqual(read('평일마다 스트레칭하기'), { repeat: 'weekly', repeatDays: [1, 2, 3, 4, 5], repeatInterval: 1, repeatUntil: null, start: '2026-11-05', rest: '스트레칭하기' })
  assert.equal(read('주말마다 대청소')?.start, '2026-11-07')
  assert.deepEqual(read('주말마다 대청소')?.repeatDays, [6, 7])
})

test('weekly with days, every other week, monthly on a day', () => {
  const weekly = read('매주 월수금 아침 7시 운동하기')!
  assert.deepEqual([weekly.repeat, weekly.repeatDays, weekly.start, weekly.rest], ['weekly', [1, 3, 5], '2026-11-06', '아침 7시 운동하기'])
  const report = read('매주 월요일 주간 보고서 제출')!
  assert.deepEqual([report.repeatDays, report.start, report.rest], [[1], '2026-11-09', '주간 보고서 제출'])
  const biweekly = read('격주 화요일 분리수거')!
  assert.deepEqual([biweekly.repeat, biweekly.repeatInterval, biweekly.repeatDays, biweekly.start, biweekly.rest], ['weekly', 2, [2], '2026-11-10', '분리수거'])
  const rent = read('매달 1일 월세 내기')!
  assert.deepEqual([rent.repeat, rent.start, rent.rest], ['monthly', '2026-12-01', '월세 내기'])
  const twoMonths = read('2개월마다 필터 교체')!
  assert.deepEqual([twoMonths.repeat, twoMonths.repeatInterval, twoMonths.rest], ['monthly', 2, '필터 교체'])
  assert.deepEqual(read('화목마다 영어 학원')?.repeatDays, [2, 4])
})

test('end dates, deadlines and plain one-off text', () => {
  const until = read('12월 말까지 매일 영어 단어 외우기')!
  assert.deepEqual([until.repeat, until.repeatUntil, until.rest], ['daily', '2026-12-31', '영어 단어 외우기'])
  assert.equal(read('2027-01-15까지 매주 화요일 PT')?.repeatUntil, '2027-01-15')
  // A weekday deadline is not a series end.
  const friday = read('매주 금요일까지 회고 작성')!
  assert.deepEqual([friday.repeatDays, friday.repeatUntil, friday.start], [[5], null, '2026-11-06'])
  for (const text of ['내일 3시 회의', '금요일까지 과제 제출', '1일 휴가', '월요일 병원']) assert.equal(read(text), null, text)
})
