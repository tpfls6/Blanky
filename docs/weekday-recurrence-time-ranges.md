# 요일별 반복 일정 및 시간 표현 — 2026-10-15

## 동작

- Schedule의 `직접 추가`와 기존 일정 편집에서 반복을 매주로 지정하고 월~일을 선택한다. 한 일정에 여러 요일을 저장한다. 최소 한 요일을 유지하며 시작 날짜 전에는 반복되지 않는다.
- Home 및 Schedule 자연어 미리보기에서도 동일한 반복 선택기를 사용한다. 명시적으로 해석한 주간 일정은 매주를 기본으로 표시한다. 사용자가 확인 후 저장한다.
- Calendar의 날짜 표시와 선택 날짜의 일정 목록, Home 일정 조회에 실제 반복을 반영한다. 기존 빈 요일 목록의 매주 일정은 원래 시작 요일을 유지한다.
- 수정·삭제는 반복 일정 전체에 적용된다. 개별 회차 예외·종료일·회차별 완료 상태는 이번 범위에서 추가하지 않았다.

| 입력 | 시작–종료 | 소요시간 | 처리 |
|---|---|---|---|
| 9시부터 13시 | 09:00–13:00 | 240분 | 명시된 시각 계산 |
| 오전 9시부터 오후 6시 | 09:00–18:00 | 540분 | 명시된 시각 계산 |
| 9시부터 6시 | 09:00–18:00 | 540분 | 추정 표시 및 저장 전 확인 필수 |
| 오후 3시부터 5시 | 15:00–17:00 | 120분 | 오후 승계 추정 표시 및 확인 |
| 09:30~18:00 | 09:30–18:00 | 510분 | 분 단위 계산 |
| 오전 9시 반부터 오후 1시 15분 | 09:30–13:15 | 225분 | 분·반 계산 |

자정을 넘는 범위는 종료 날짜를 임의로 만들지 않고 미리보기에서 확인한다. 모든 자연어 표현을 지원하는 것은 아니며, 지원 범위 밖의 복합 입력은 기존 AI 분석과 검증을 따른다. `9시부터 6시`는 확정된 사실로 취급하지 않는다. 사용자 수정값이 우선하며 추정 확인 체크를 해야 저장된다.

## 저장 및 충돌 검사

- `schedules.repeat_days integer[]`만 추가. ISO 요일 1=월요일, 7=일요일. 기존 repeat_rule, 일정 API, RLS, 변경 이력을 재사용한다.
- `20261015100000_schedule_repeat_days.sql` 적용. 기존 값은 빈 배열이며 행 삭제·초기화·새 일정 생성 없이 호환한다. DB가 1~7 범위 및 비주간 일정의 요일 배열을 검사한다. API에서도 선택값 형식 및 중복을 검증한다.
- Scheduling Engine은 선택한 모든 요일을 고정 시간으로 계산한다. 서버 승인 시 최신 스냅샷에 포함된 repeat_days를 다시 검증하며, 기존 revision 잠금 및 원자적 저장을 유지한다.

## 수정 파일

- 공통: `packages/types/src/{recurrence,schedule,index}.ts`
- 분석: `packages/parse/src/{timeRange,weeklyRanges,resolve,index}.ts`
- API·엔진: `packages/api/src/{scheduleRepository,database.generated}.ts`, `packages/scheduling/src/engine.ts`
- UI·프런트 계산: `src/components/schedule/{RepeatPicker,AnalysisReview,MiniCalendar}.tsx`, `src/pages/Schedule/SchedulePage.tsx`, `src/features/ai/review.ts`, `src/types/work.ts`, `src/utils/{work,scheduleDraft}.ts`
- migration: `supabase/migrations/20261015100000_schedule_repeat_days.sql`
- 검증: `tests/{aiAnalysis,scheduling}.test.ts`, `scripts/{ai-browser-test,ai-weekly-edge-test,recurrence-live-test}.mjs`

## 검증 및 배포

- 전체 테스트 170개, lint, 타입 검사 및 프로덕션 빌드 통과.
- 실제 브라우저: 일반 일정 직접 추가, AI 미리보기 요일 선택, 저장 후 반복 요일 유지, 다음 주 Calendar 표시, 540분 계산, 추정 시간 승인 전 차단, 기존 Diary·Reading 이동, 모바일 및 중복 클릭 방지 통과.
- 실제 Supabase: 임시 계정 반복 요일 저장·재조회·수정, 최신 planner_snapshot, 변경 이력, 잘못된 요일 DB 차단, 다른 사용자 조회·수정 차단 통과. 테스트 계정 정리 완료.
- 실제 인증된 OpenAI/parse-schedule 호출: 사용자가 제공한 화·목·금 근로 문장 3개로 분리, 목·금 18:00 추정 표시 통과. 분석 시 일정 쓰기 0건.
- 관련 Edge Function parse-schedule, plan-tasks, approve-plan, replan-tasks 배포. 프런트엔드 호스팅 미배포.

이 문서는 앞선 `ai-weekly-input-fix.md`의 ‘목·금 종료 null’ 동작을 대체한다. 현재는 사용자 확인이 필요한 18:00 추천값을 제공한다.
