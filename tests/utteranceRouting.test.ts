import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeUtterance, extractIntents, needsIntentAI } from '../packages/parse/src/intents.ts'
import { resolveScheduleAnalysis } from '../packages/parse/src/resolve.ts'
import { requestedRule } from '../src/features/ai/review.ts'
import { routeUtterance, splitMixed } from '../src/features/ai/routeUtterance.ts'
import { captureIntent } from '../src/utils/captureIntent.ts'
import { parseReading } from '../src/utils/readingParse.ts'

// Monday. Synthetic sentences only.
const TODAY = new Date(2026, 10, 9)
const first = async (text: string) => (await resolveScheduleAnalysis(text, { today: TODAY })).items

test('colloquial dates read the same in schedule analysis as in intent analysis', async () => {
  const cases: [string, Record<string, string | null>][] = [
    ['낼 오후 3시 미팅', { date: '2026-11-10', startTime: '15:00' }],
    ['담주 월욜 오전 11시 병원', { date: '2026-11-16', startTime: '11:00' }],
    ['금욜까지 과제 내야됨', { dueDate: '2026-11-13' }],
    ['낼모레 오후 2시 치과', { date: '2026-11-11', startTime: '14:00' }],
    ['토욜 오전 10시 등산', { date: '2026-11-14', startTime: '10:00' }],
    ['수욜 오후 3시반 미팅', { date: '2026-11-11', startTime: '15:30' }],
  ]
  for (const [text, expected] of cases) {
    const items = await first(text)
    assert.equal(items.length, 1, text)
    for (const [field, value] of Object.entries(expected)) assert.equal(items[0].draft[field as 'date'], value, `${text} ${field}`)
  }
})

test('normalized evidence still validates and the colloquial repeat rule is read', async () => {
  const items = await first('월욜마다 오전 9시 스터디')
  assert.equal(items[0].draft.date, '2026-11-09')
  const rule = requestedRule('월욜마다 오전 9시 스터디', items[0], true, TODAY)
  assert.equal(rule.repeat, 'weekly')
  assert.deepEqual(rule.repeatDays, [1])
})

test('normalization leaves look-alike words alone', async () => {
  assert.equal(normalizeUtterance('모래 놀이 키트 사기'), '모래 놀이 키트 사기')
  assert.equal(normalizeUtterance('모래 3시 약속'), '모레 3시 약속')
  assert.equal(normalizeUtterance('가구 사러 가기'), '가구 사러 가기')
  assert.equal(normalizeUtterance('공부하구 자기'), '공부하고 자기')
  assert.equal((await first('가구 사러 가기 내일 오후 2시'))[0].draft.title.includes('가구'), true)
  // Idempotent: clause recursion normalizes again.
  const once = normalizeUtterance('낼 담주 금욜 3시반')
  assert.equal(normalizeUtterance(once), once)
})

test('a clause opening with a relative day takes the previous clause date', async () => {
  const seminar = await first('11월 30일 오후 2시 세미나 발표, 그 전날까지 슬라이드 완성')
  assert.deepEqual(seminar.map(item => [item.type, item.draft.date ?? item.draft.dueDate]), [['event', '2026-11-30'], ['task', '2026-11-29']])
  const next = await first('금요일 오후 3시 발표, 다음 날 오전 10시 회고')
  assert.deepEqual(next.map(item => [item.draft.date, item.draft.startTime]), [['2026-11-13', '15:00'], ['2026-11-14', '10:00']])
  // Across New Year: the event is next year's 1월 1일 and the relative day is written out with its year.
  const newYear = await first('1월 1일 오후 2시 행사, 그 전날까지 준비')
  assert.deepEqual(newYear.map(item => [item.type, item.draft.title, item.draft.date ?? item.draft.dueDate]), [['event', '행사', '2027-01-01'], ['task', '준비', '2026-12-31']])
})

test('routeUtterance: records, explicit prefixes, planner and pending in one order', () => {
  assert.deepEqual(routeUtterance('오늘 친구랑 카페 다녀왔는데 즐거웠다', { today: TODAY }), { kind: 'record', type: 'diary', original: '오늘 친구랑 카페 다녀왔는데 즐거웠다' })
  // An explicit prefix wins over a planning word inside the memo.
  assert.equal(routeUtterance('아이디어: 계획 세워 주는 앱', { today: TODAY }).kind, 'record')
  assert.equal(captureIntent('아이디어: 계획 세워 주는 앱').type, 'memo')
  assert.equal(routeUtterance('메모: 와이파이 비밀번호, 내일 3시 회의', { today: TODAY }).kind, 'record')
  assert.equal(routeUtterance('다음 주 계획 세워줘', { today: TODAY }).kind, 'planner')
  // A follow-up to an open question is never sent to the planner.
  assert.equal(routeUtterance('다음 주 계획 세워줘', { today: TODAY, pending: true }).kind, 'schedule')
  // A picked type other than auto never files a record.
  assert.equal(routeUtterance('오늘 친구랑 카페 다녀왔는데 즐거웠다', { type: 'schedule', today: TODAY }).kind, 'schedule')
  const route = routeUtterance('낼 오후 3시 미팅', { today: TODAY })
  assert.deepEqual(route, { kind: 'schedule', text: '내일 오후 3시 미팅', original: '낼 오후 3시 미팅' })
})

test('routeUtterance splits records from schedules in one message', () => {
  const reading = routeUtterance('데미안 50쪽 읽었고 내일 오후 3시 회의', { today: TODAY })
  assert.equal(reading.kind, 'mixed')
  if (reading.kind !== 'mixed') return
  assert.deepEqual(reading.records, [{ type: 'reading', text: '데미안 50쪽 읽었고' }])
  assert.equal(reading.text, '내일 오후 3시 회의')
  const diary = routeUtterance('오늘 영화 봤는데 재밌었다, 금욜까지 감상문 제출', { today: TODAY })
  assert.equal(diary.kind, 'mixed')
  if (diary.kind !== 'mixed') return
  assert.deepEqual(diary.records, [{ type: 'diary', text: '오늘 영화 봤는데 재밌었다' }])
  assert.equal(diary.rest, '금욜까지 감상문 제출')
  assert.equal(diary.text, '금요일까지 감상문 제출')
  assert.equal(routeUtterance('오늘 너무 피곤했다. 내일 오전 9시 병원', { today: TODAY }).kind, 'mixed')
})

test('mixed splitting stays off without a clear record and a clear schedule', () => {
  // Past schedule talk with a future one is one schedule message (the intent layer reads both clauses).
  assert.equal(splitMixed('어제 회의 했는데 내일 또 회의 있어', TODAY), null)
  // A diary that mentions tomorrow in the past tense stays a diary.
  assert.equal(splitMixed('오늘 친구랑 카페 다녀왔는데 즐거웠다. 내일도 만나기로 했다', TODAY), null)
  // Several schedules are not records.
  assert.equal(splitMixed('토요일 오전 11시 결혼식, 오후 3시 친구 만남', TODAY), null)
  assert.equal(splitMixed('내일 오후 3시 회의', TODAY), null)
})

test('a named day with an explicit clock is an event without the intent AI', () => {
  assert.equal(needsIntentAI(extractIntents('토요일 오전 10시 등산', TODAY)), false)
  assert.equal(extractIntents('토요일 오전 10시 등산', TODAY).intents[0]?.kind, 'create_event')
  // A bare hour with only a name stays with the AI layer.
  assert.equal(needsIntentAI(extractIntents('금요일 3시 도현오빠', TODAY)), true)
})

test('reading records keep structured fields', () => {
  const cases: [string, Partial<ReturnType<typeof parseReading>>][] = [
    ['독서: 데미안 120페이지까지 읽었다', { title: '데미안', page: 120, total: null, finished: false }],
    ['어린왕자 50쪽 읽음', { title: '어린왕자', page: 50 }],
    ['『데미안』(헤르만 헤세) 50~120쪽 읽음', { title: '데미안', page: 120, startPage: 50, author: '헤르만 헤세' }],
    ['오늘 데미안 완독!', { title: '데미안', page: null, finished: true }],
    ['코스모스 120/600', { title: '코스모스', page: 120, total: 600 }],
    ['p.45 사피엔스 읽는 중', { title: '사피엔스', page: 45 }],
    ['사피엔스 p.30-45 읽었다', { title: '사피엔스', page: 45, startPage: 30 }],
    ['총 300쪽 중 120쪽까지 읽은 데미안', { title: '데미안', page: 120, total: 300 }],
    ['데미안을 다 읽었다', { title: '데미안', finished: true }],
    ['독서 기록: 이기적 유전자 저자: 리처드 도킨스 80쪽', { title: '이기적 유전자', author: '리처드 도킨스', page: 80 }],
  ]
  for (const [text, expected] of cases) {
    const parsed = parseReading(text)
    for (const [field, value] of Object.entries(expected)) assert.deepEqual(parsed[field as keyof typeof parsed], value, `${text} ${field}`)
    assert.equal(parsed.note, text)
  }
  assert.equal(captureIntent('총 300쪽 중 120쪽까지 읽은 데미안').type, 'reading')
  assert.equal(parseReading('').title, '제목 없는 책')
})

test('a month-day without a year: next one for new items, closest for changes, last for records', async () => {
  const { parseKoreanDate } = await import('../packages/parse/src/parse.ts')
  // New schedules take the next occurrence; a day passed by at most 30 days stays this year.
  assert.equal(parseKoreanDate('1월 5일', TODAY), '2027-01-05')
  assert.equal(parseKoreanDate('11월 20일', TODAY), '2026-11-20')
  assert.equal(parseKoreanDate('11월 3일', TODAY), '2026-11-03')
  assert.equal(parseKoreanDate('2027년 3월 1일', TODAY), '2027-03-01')
  assert.equal(parseKoreanDate('2025년 12월 1일', TODAY), '2025-12-01')
  assert.equal(parseKoreanDate('1월 5일', TODAY, null, 'past'), '2026-01-05')
  assert.equal(parseKoreanDate('12월 1일', TODAY, null, 'past'), '2025-12-01')
  assert.equal(parseKoreanDate('10월 20일', TODAY, null, 'nearest'), '2026-10-20')
  assert.equal(parseKoreanDate('1월 5일', TODAY, null, 'nearest'), '2027-01-05')

  assert.equal((await first('1월 5일 오후 2시 회의'))[0].draft.date, '2027-01-05')
  const range = (await first('12월 28일부터 1월 3일까지 여행'))[0].draft
  assert.deepEqual([range.date, range.endDate], ['2026-12-28', '2027-01-03'])
  // A late entry keeps its day but waits for a look instead of saving on its own.
  const late = (await first('11월 3일 오후 2시 회의'))[0]
  assert.equal(late.draft.date, '2026-11-03')
  assert.ok(late.uncertainties.some(entry => /지난 날짜/.test(entry.reason)))
  assert.equal((await first('1월 5일 오후 2시 회의'))[0].uncertainties.length, 0)

  // Changing or cancelling points at the saved schedule nearest to today.
  assert.equal(extractIntents('10월 20일 회의 취소됐어', TODAY).intents[0]?.date, '2026-10-20')
  assert.equal(extractIntents('1월 5일 회의 오후 3시로 바꿔줘', TODAY).intents[0]?.date, '2027-01-05')
})

test('more spoken dates and routing slips found by the held-out set', async () => {
  const { parseKoreanDate } = await import('../packages/parse/src/parse.ts')
  assert.equal(parseKoreanDate('글피', TODAY), '2026-11-12')
  assert.equal(parseKoreanDate('다다음주 화요일', TODAY), '2026-11-24')
  assert.equal(parseKoreanDate('다음 주 화요일', TODAY), '2026-11-17')
  assert.equal(parseKoreanDate('다음 달 3일', TODAY), '2026-12-03')
  assert.equal(parseKoreanDate('다음 달 3일', new Date(2026, 11, 20)), '2027-01-03')
  assert.deepEqual((await first('글피 저녁 8시 동아리 회의')).map(item => [item.draft.date, item.draft.startTime]), [['2026-11-12', '20:00']])
  assert.equal((await first('담달 3일 오후 2시 세미나'))[0].draft.date, '2026-12-03')
  // A book club is a meeting, not a reading log; a repeat rule with a clock is a schedule, not a memo.
  assert.equal(captureIntent('매주 수요일 저녁 8시 독서모임').type, 'conversation')
  assert.equal(captureIntent('12/12 오후 5시 독서모임 송년회').type, 'conversation')
  assert.equal(captureIntent('매주 월수금 아침 7시 필라테스').type, 'conversation')
  assert.equal(captureIntent('매일 밤 11시 일기 쓰기').type, 'conversation')
  assert.equal(captureIntent('매일 아침 운동했더니 기분 좋았다').type, 'diary')
  assert.equal(captureIntent('오늘 독서: 미드나잇 라이브러리 140쪽까지').type, 'reading')
  // Emoticon tails do not hide a sentence end.
  assert.equal(routeUtterance('오늘 동아리 첫 모임 진짜 재밌었다ㅎㅎ 다음 모임은 담주 수요일 저녁 6시래', { today: TODAY }).kind, 'mixed')
  const range = parseReading('김영하 작별인사 30페이지에서 75페이지까지 읽었음')
  assert.deepEqual([range.startPage, range.page], [30, 75])
  assert.equal(parseReading('불편한 편의점 오늘 다 읽었다! 총 268쪽').title, '불편한 편의점')
})

test('a repeat starts where the text says it starts', async () => {
  const { readRecurrence } = await import('../packages/parse/src/recurrence.ts')
  const tuesday = new Date(2026, 10, 10)
  const start = (text: string) => readRecurrence(text, tuesday)?.start
  assert.equal(start('다음 주부터 매주 목요일 오후 7시 요가'), '2026-11-19')
  assert.equal(start('다다음 주부터 매주 월요일 오전 8시 스터디'), '2026-11-23')
  assert.equal(start('12월부터 매주 화요일 오전 10시 수영'), '2026-12-01')
  assert.equal(start('12월 3일부터 매주 목요일 독서'), '2026-12-03')
  assert.equal(start('내일부터 평일마다 오전 9시 출근 준비'), '2026-11-11')
  assert.equal(start('다음 달부터 매달 5일 관리비 납부'), '2026-12-05')
  // A month already running starts today; a month already past is next year's.
  assert.equal(start('11월부터 매주 금요일 독서모임'), '2026-11-13')
  assert.equal(start('3월부터 매주 월요일 오전 9시 수업'), '2027-03-01')
  const until = readRecurrence('이번 달 말까지 매일 아침 7시 스트레칭', tuesday)
  assert.deepEqual([until?.start, until?.repeatUntil], ['2026-11-10', '2026-11-30'])
  const items = (await resolveScheduleAnalysis('다음 주부터 매주 목요일 오후 7시 요가', { today: tuesday })).items
  assert.deepEqual(items.map(item => [item.draft.title, item.draft.date, item.draft.startTime]), [['요가', '2026-11-19', '19:00']])
})

test('relative days chained to an earlier item', async () => {
  const tuesday = new Date(2026, 10, 10)
  const read = async (text: string) => (await resolveScheduleAnalysis(text, { today: tuesday })).items.map(item => [item.type, item.draft.title, item.draft.date ?? item.draft.dueDate])
  assert.deepEqual(await read('11월 27일 오후 3시 발표, 발표 이틀 전까지 자료 완성'), [['event', '발표', '2026-11-27'], ['task', '자료 완성', '2026-11-25']])
  assert.deepEqual(await read('11월 25일 동아리 공연이고 공연 일주일 전까지 대관 신청'), [['event', '동아리 공연', '2026-11-25'], ['task', '대관 신청', '2026-11-18']])
  assert.deepEqual(await read('11월 18일 오후 1시 점심약속이랑 같은날 저녁 7시 영화'), [['event', '점심약속', '2026-11-18'], ['event', '영화', '2026-11-18']])
  assert.deepEqual(await read('11월 20일 오전 10시 면접, 그 주 월요일까지 포트폴리오 제출'), [['event', '면접', '2026-11-20'], ['task', '포트폴리오 제출', '2026-11-16']])
  assert.deepEqual(await read('11월 20일 오전 10시 면접, 그 주 토요일 오후 2시 뒤풀이'), [['event', '면접', '2026-11-20'], ['event', '뒤풀이', '2026-11-21']])
})

test('a change and a new item in one message are two intents', () => {
  const tuesday = new Date(2026, 10, 10)
  const read = (text: string) => extractIntents(text, tuesday).intents.map(intent => [intent.kind, intent.title, intent.date, intent.newDate])
  assert.deepEqual(read('화요일 요가 목요일로 옮겨주고 금요일 저녁 7시 저녁 약속 추가'), [['modify', null, '2026-11-10', '2026-11-12'], ['create_event', '저녁 약속', '2026-11-13', null]])
  assert.deepEqual(read('수요일 회의 취소해주고 목요일 오후 2시 치과 예약 넣어줘'), [['cancel', null, '2026-11-11', null], ['create_event', '치과 예약', '2026-11-12', null]])
  // A bare weekday destination stays in the moved item's week.
  assert.equal(extractIntents('다음 주 화요일 필라테스 수요일로 옮겨줘', tuesday).intents[0]?.newDate, '2026-11-18')
})

test('an explicit memo followed by a schedule after a hard break is split; a comma is not', () => {
  const route = routeUtterance('메모: 택배 송장번호 1234\n금요일 오후 3시 치과', { today: TODAY })
  assert.equal(route.kind, 'mixed')
  if (route.kind === 'mixed') {
    assert.deepEqual(route.records, [{ type: 'memo', text: '메모: 택배 송장번호 1234' }])
    assert.equal(route.text, '금요일 오후 3시 치과')
  }
  assert.equal(routeUtterance('메모: 공유기 비번 abc / 토요일 오후 2시 집들이', { today: TODAY }).kind, 'mixed')
  assert.equal(routeUtterance('현관 비번 메모해둬 / 토요일 오후 2시 집들이', { today: TODAY }).kind, 'mixed')
  assert.equal(routeUtterance('메모: 장볼 것 우유 / 계란', { today: TODAY }).kind, 'record')
  assert.equal(routeUtterance('메모: 와이파이 비밀번호, 내일 3시 회의', { today: TODAY }).kind, 'record')
})

test('authors are read only where the text marks them', () => {
  const read = (text: string) => { const parsed = parseReading(text); return [parsed.title, parsed.author] }
  assert.deepEqual(read('채식주의자(한강) 87쪽 읽음'), ['채식주의자', '한강'])
  assert.deepEqual(read('정유정 작가 종의 기원 120쪽까지'), ['종의 기원', '정유정'])
  assert.deepEqual(read('파친코 by 이민진 200쪽'), ['파친코', '이민진'])
  assert.deepEqual(read('노르웨이의 숲 무라카미 하루키 지음 150쪽 읽음'), ['노르웨이의 숲', '무라카미 하루키'])
  assert.deepEqual(read('저자는 유발 하라리, 사피엔스 끝까지 읽었다'), ['사피엔스', '유발 하라리'])
  // Unmarked: the name cannot be told from the title, so nothing is guessed.
  assert.deepEqual(read('한강 채식주의자 87쪽 읽음'), ['한강 채식주의자', null])
})
