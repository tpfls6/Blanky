import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captureIntent } from '../src/utils/captureIntent.ts'

test('retrospective diary entries win over schedule nouns and times', () => {
  for (const text of ['오늘 친구랑 만나서 즐거웠다', '오늘 회의 때문에 힘들었다', '오늘 오후 3시 회의를 했다. 기분이 좋았다', '오늘 병원에 다녀왔다']) {
    assert.deepEqual(captureIntent(text), { type: 'diary', needsConfirmation: false }, text)
  }
})
test('memo and reading records do not enter schedule analysis', () => {
  assert.equal(captureIntent('블로그에 쓸 아이디어: 회의 정리').type, 'memo')
  assert.equal(captureIntent('데미안 30페이지 읽었다').type, 'reading')
  assert.equal(captureIntent('일기: 조용한 하루').type, 'diary')
})
test('schedule requests, tasks and follow-ups keep the existing conversation route', () => {
  for (const text of ['내일 오후 3시 회의', '금요일까지 과제 제출해야 해', '내일 책 읽기', '이번 주 공부 계획 세워줘', '충돌한 AI 일정 재배치해줘', '그거 오후 5시로 바꿔줘', '오늘 일정 보여줘', '토요일에 데이트', '내일 친구 만나기', '주말에 영화 보기', '오늘 운동하기', '이번 주 수요일까지 논문 읽기', 'React 공부하기', '오늘 회의에서 나온 아이디어 정리']) {
    assert.equal(captureIntent(text).type, 'conversation', text)
  }
})
test('ambiguous, mixed and recipe records default to memo without confirmation', () => {
  for (const text of ['조용한 하루', '오늘 즐거웠다. 내일 회의 준비해야 한다', '미역국 레시피 미역 고기 간장 등등 오후5시', '미역 고기 간장 등등 오후5시', '오후5시', '내일 참고할 내용', 'React의 상태 관리는 useState로 가능하다', '오늘 날씨가 정말 좋았다', '나중에 참고할 책 목록']) {
    assert.deepEqual(captureIntent(text), { type: 'memo', needsConfirmation: false }, text)
  }
})
test('planned reading is a task; only what was read is a reading record', () => {
  for (const text of ['데미안 30페이지 읽었다', '데미안 완독', '어제 데미안 읽고 많이 울었다', '사피엔스 120/400', '노르웨이의 숲 130페이지까지 읽음. 나오코 부분이 인상적이었다.']) {
    assert.equal(captureIntent(text).type, 'reading', text)
  }
  for (const text of ['논문 읽기', '책 읽기', '내일 데미안 읽어야 해', '논문 읽고 일요일까지 요약 올리기', '논문 읽고 워크플로우 카톡방에 올리기', '주말에 사피엔스 50페이지 읽기']) {
    assert.equal(captureIntent(text).type, 'conversation', text)
  }
})
test('a list of several to-dos goes to analysis even when one mentions reading', () => {
  assert.equal(captureIntent('컴활 풀기, 논문 읽고 정리하기, 발표자료 만들기').type, 'conversation')
  assert.equal(captureIntent('현재 컴활 풀기, 논문 읽고 이번주 일요일까지 워크플로우 뭐한지랑 선택 이유 카톡방에 올리기 (IRIS 초파리 연구), stockmate 발표 숙지 1회').type, 'conversation')
})
