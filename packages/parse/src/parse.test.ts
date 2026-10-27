import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildFeedback, rulesFromFeedback } from './learn.ts'
import { PARSE_CONFIG } from './config.ts'
import { parseDateRange, parseDueDate, parseDuration, parseKoreanDate, parseKoreanTime, parseScheduleText, extractRecordFields } from './parse.ts'
import { createAIProvider, readModelSchedule } from './provider.ts'
import { resolveParse } from './resolve.ts'
import type { AIProvider } from './provider.ts'

const today = new Date(2026, 9, 1)

function parsed(text: string) {
  return parseScheduleText(text, { today })
}

test('오늘 오후 3시 회의', () => {
  const result = parsed('오늘 오후 3시 회의')
  assert.equal(result.type, 'event')
  assert.equal(result.source, 'rule')
  assert.equal(result.draft.date, '2026-10-01')
  assert.equal(result.draft.startTime, '15:00')
  assert.equal(result.draft.endTime, null)
  assert.equal(result.draft.dueDate, null)
  assert.equal(result.draft.title, '회의')
  assert.ok(result.confidence >= PARSE_CONFIG.aiConfidenceThreshold)
})

test('내일 10시 병원', () => {
  const result = parsed('내일 10시 병원')
  assert.equal(result.type, 'event')
  assert.equal(result.draft.date, '2026-10-02')
  assert.equal(result.draft.startTime, '10:00')
  assert.equal(result.draft.endTime, null)
  assert.equal(result.draft.dueDate, null)
  assert.equal(result.draft.title, '병원')
  assert.ok(result.confidence >= 0.8)
})

test('금요일까지 과제 제출', () => {
  const result = parsed('금요일까지 과제 제출')
  assert.equal(result.type, 'task')
  assert.equal(result.draft.dueDate, '2026-10-02')
  assert.equal(result.draft.date, '2026-10-02')
  assert.equal(result.draft.startTime, null)
  assert.equal(result.draft.endTime, null)
  assert.equal(result.draft.title, '과제 제출')
  assert.ok(result.confidence >= 0.8)
})

test('오후 3시부터 5시까지 Blanky 회의', () => {
  const result = parsed('오후 3시부터 5시까지 Blanky 회의')
  assert.equal(result.type, 'event')
  assert.equal(result.draft.date, '2026-10-01')
  assert.equal(result.draft.startTime, '15:00')
  assert.equal(result.draft.endTime, '17:00')
  assert.equal(result.draft.dueDate, null)
  assert.equal(result.draft.title, 'Blanky 회의')
  assert.ok(result.confidence >= 0.8)
})

test('컴활 문제 20개', () => {
  const result = parsed('컴활 문제 20개')
  assert.equal(result.type, 'task')
  assert.equal(result.draft.title, '컴활 문제 20개')
  assert.equal(result.draft.date, '2026-10-01')
  assert.equal(result.draft.startTime, null)
  assert.equal(result.draft.endTime, null)
  assert.equal(result.draft.dueDate, null)
  assert.ok(result.confidence < PARSE_CONFIG.aiConfidenceThreshold)
})

test('10월 3일 저녁 6시 운동', () => {
  const result = parsed('10월 3일 저녁 6시 운동')
  assert.equal(result.type, 'event')
  assert.equal(result.draft.date, '2026-10-03')
  assert.equal(result.draft.startTime, '18:00')
  assert.equal(result.draft.endTime, null)
  assert.equal(result.draft.dueDate, null)
  assert.equal(result.draft.title, '운동')
})

test('다음 주 월요일 발표자료 완성', () => {
  const result = parsed('다음 주 월요일 발표자료 완성')
  assert.equal(result.type, 'task')
  assert.equal(result.draft.date, '2026-10-05')
  assert.equal(result.draft.startTime, null)
  assert.equal(result.draft.endTime, null)
  assert.equal(result.draft.dueDate, null)
  assert.equal(result.draft.title, '발표자료 완성')
})

test('date and time helpers', () => {
  assert.equal(parseKoreanDate('오늘 회의', today), '2026-10-01')
  assert.equal(parseKoreanDate('어제', today), '2026-09-30')
  assert.equal(parseKoreanDate('내일', today), '2026-10-02')
  assert.equal(parseKoreanDate('모레', today), '2026-10-03')
  assert.equal(parseKoreanDate('tomorrow', today), '2026-10-02')
  assert.equal(parseKoreanTime('move class to 3pm')?.startTime, '15:00')
  assert.equal(parseKoreanTime('오후 3시 반')?.startTime, '15:30')
  assert.equal(parseKoreanTime('3시 30분')?.startTime, '03:30')
  assert.equal(parseKoreanTime('15:30')?.startTime, '15:30')
  assert.equal(parseKoreanTime('오후 3시부터 5시까지')?.startTime, '15:00')
  assert.equal(parseKoreanTime('오후 3시부터 5시까지')?.endTime, '17:00')
  assert.equal(parseDuration('한 시간'), 60)
  assert.equal(parseDuration('2시간 15분'), 135)
  assert.equal(parseDueDate('오늘까지', today), '2026-10-01')
  assert.deepEqual(parseDateRange('10월 5일부터 10월 8일까지', today), {
    start: '2026-10-05',
    end: '2026-10-08',
  })
})

test('personal rule raises task score and category', () => {
  const result = parseScheduleText('Blanky 문제 정리', {
    today,
    rules: [{ pattern: 'Blanky', targetType: 'task', categoryId: 'blanky', weight: 2 }],
  })
  assert.equal(result.source, 'personal_rule')
  assert.equal(result.type, 'task')
  assert.equal(result.draft.categoryId, 'blanky')
  assert.ok(result.confidence >= PARSE_CONFIG.aiConfidenceThreshold)
})

test('feedback and learned rules', () => {
  const predicted = parsed('컴활 문제 20개')
  const same = buildFeedback({
    text: '컴활 문제 20개',
    predicted,
    saved: {
      type: predicted.type,
      title: predicted.draft.title,
      date: predicted.draft.date,
      startTime: predicted.draft.startTime,
      endTime: predicted.draft.endTime,
      dueDate: predicted.draft.dueDate,
      categoryId: predicted.draft.categoryId,
    },
  })
  assert.equal(same, null)
  const changed = buildFeedback({
    text: '컴활 문제 20개',
    predicted: { ...predicted, type: 'event' },
    saved: {
      type: 'task',
      title: '컴활 문제 20개',
      date: '2026-10-01',
      startTime: null,
      endTime: null,
      dueDate: null,
      categoryId: 'study',
    },
  })
  assert.equal(changed?.predictedType, 'event')
  assert.equal(changed?.correctedType, 'task')
  assert.equal(changed?.correctedCategoryId, 'study')
  const sample = { inputText: '컴활 문제 20개', correctedType: 'task', correctedCategoryId: 'study' }
  assert.equal(rulesFromFeedback([sample, sample]).length, 0)
  const rules = rulesFromFeedback([sample, sample, sample])
  assert.ok(rules.some((rule) => rule.pattern === '문제' && rule.targetType === 'task' && rule.categoryId === 'study'))
})

test('record fields share the parser core', () => {
  const fields = extractRecordFields('오늘 스쿼트 40kg 10회 3세트', {
    blocks: [
      { fieldKey: 'name', label: '운동명', type: 'textField' },
      { fieldKey: 'weight', label: '무게', type: 'number' },
      { fieldKey: 'reps', label: '횟수', type: 'number' },
      { fieldKey: 'sets', label: '세트', type: 'number' },
    ],
  })
  assert.equal(fields?.weight, 40)
  assert.equal(fields?.reps, 10)
  assert.equal(fields?.sets, 3)
  assert.equal(fields?.name, '오늘 스쿼트')
})

test('ai fallback only under the threshold', async () => {
  let calls = 0
  const provider: AIProvider = {
    async parseSchedule() {
      calls += 1
      return readModelSchedule({
        type: 'task',
        confidence: 0.91,
        draft: {
          title: '컴활 문제',
          date: '2026-10-01',
          startTime: null,
          endTime: null,
          dueDate: null,
          categoryId: null,
        },
      })
    },
    async classifyRecord() {
      return null
    },
    async extractFields() {
      return null
    },
  }
  const low = await resolveParse('컴활 문제 20개', { today }, { provider })
  assert.equal(calls, 1)
  assert.equal(low.source, 'ai')
  assert.equal(low.draft.title, '컴활 문제')
  const high = await resolveParse('오늘 오후 3시 회의', { today }, { provider })
  assert.equal(calls, 1)
  assert.equal(high.source, 'rule')
  const offline = await resolveParse('오늘 오후 3시 회의', { today }, { provider: createAIProvider({ aiProvider: 'local' }) })
  assert.equal(offline.source, 'rule')
  assert.equal(offline.draft.startTime, '15:00')
  const missingKey = await resolveParse('컴활 문제 20개', { today }, { provider: createAIProvider({ aiProvider: 'openai' }) })
  assert.equal(missingKey.source, 'rule')
  assert.equal(missingKey.type, 'task')
})

test('bad model json is ignored', () => {
  assert.equal(readModelSchedule('not json'), null)
  assert.equal(readModelSchedule({ type: 'event' }), null)
})

test('dated events without task actions stay events, deadlines stay tasks', () => {
  assert.equal(parsed('토요일에 데이트').type, 'event')
  assert.equal(parsed('내일 친구 만나기').type, 'event')
  assert.equal(parsed('주말에 영화 보기').type, 'event')
  assert.equal(parsed('오늘 운동하기').type, 'task')
  assert.equal(parsed('이번 주 수요일까지 논문 읽기').type, 'task')
  assert.equal(parsed('React 공부하기').type, 'task')
})
