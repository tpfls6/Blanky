# Blanky 3차 — 추천 전용 Scheduling Engine

## 개발 전 검증

- 기존 Intent Router의 `route: planner`에 `intent: PLAN_TASKS`를 명시했다.
  2차 단일/복합 일정 분석 API는 그대로 유지한다.
- 기존 ScheduleAnalysis / AnalysisItem / ParsedSchedule의 제목·종류·카테고리·원문 근거·관계를 재사용한다.
  Scheduling용 메타데이터만 별도 PlanningAnalysis로 확장한다.
- schedules는 date + local start_time/end_time, kind, due_date, end_date, duration_minutes,
  repeat_rule, calendar_id를 저장한다. calendars.timezone으로 실제 시간대를 해석한다.
- schedules, schedule_changes, user_preferences, categories의 소유자 RLS와 calendar 소유자 FK를 확인했다.
  서버는 사용자 JWT로 auth.getUser를 확인하며 서비스 역할 키를 사용하지 않는다.
- 기존 일정 저장과 record_schedule_activity 트리거는 유지한다. 추천 경로에는 쓰기 의존성이 없다.
- 새 테이블·마이그레이션이 필요하지 않다. 추천 결과는 응답으로만 반환한다.
- 개발 전 배포 parse-schedule의 OPTIONS 및 비로그인 차단은 실제 검증했다.
  로그인 사용자 토큰(AI_TEST_USER_TOKEN)이 없어 **인증 사용자 호출 단계에서 차단**되었다.
  따라서 배포 함수 → 사용자 RLS 조회 → OpenAI까지의 인증된 전체 흐름은 검증했다고 주장하지 않는다.
  테스트 계정 생성, 기존 사용자 세션 추출, 운영 데이터 저장을 하지 않았다.

## 역할과 동작

1. `processAiInput`이 공통 Intent Router로 PLAN_TASKS를 선택한다.
2. API가 추천 전용 `plan-tasks` Edge Function을 호출한다.
3. 사용자 인증 후 기존 PreferenceRepository와 ScheduleRepository를 재사용한다.
4. `listForPlanning`은 이전에 시작한 반복·다일·야간 일정과 타임존 경계까지 읽는다.
   500개씩 페이지 조회하고 조회 오류·한도 초과는 빈 일정으로 취급하지 않는다.
5. OpenAI가 작업 의미, 명시/추정 소요시간, 반복 횟수, 우선순위, 분할 추천, 선후 관계만 분석한다.
   AI가 배치 날짜/시각을 생성한 응답은 거부한다. 원문 시간/횟수 근거와 숫자 불일치도 거부한다.
6. 독립 `@blanky/scheduling` 모듈이 작업을 마감일 → 우선순위 → ID 순으로 안정 정렬한다.
   선행 작업이 완료 배치된 작업부터 가장 이른 가용 구간에 배치한다.
7. 기존 일정, 종일/다일/야간 일정, daily/weekly/monthly 반복을 실제 시간 구간으로 확장한다.
   미완료 timed task는 충돌 차단과 하루 작업 한도에 포함한다. 날짜만 있는 backlog는 고정 시간으로 차단하지 않는다.
8. 휴식·요일·작업 가능 범위·일일 한도·최소/최대 블록을 준수해 분할한다.
   분할 불가 작업을 임의 분할하거나 작은 잔여 작업을 버리지 않는다.
9. 완전 배치, 일부 배치, 미배치를 원본 작업·잔여 시간·이유·확인 사항과 함께 반환한다.

엔진은 순수 함수이며 현재 시각도 입력으로 받는다. 같은 정규화 작업·기존 일정·설정·now에는
동일한 결과를 반환한다. OpenAI의 자연어 분석 자체가 항상 동일하다는 보장은 하지 않는다.
탐욕 배치이며 전역 최적화/자동 재배치 엔진이 아니다. 선행 작업이 일부만 배치되면 후속 작업은 배치하지 않는다.

## 기본값과 타임존

| 설정 | 기본값 |
| --- | --- |
| timezone | 저장된 사용자 설정, 없으면 Asia/Seoul |
| 범위 | 현재 로컬 날짜부터 해당 주 일요일까지, 최대 31일 |
| 작업 요일 | 월~일, 요청에서 변경 가능 |
| 작업 가능 시각 | 저장된 설정, 없으면 09:00–21:00 |
| 하루 최대 작업 시간 | 240분, 기존 timed task 포함 |
| 작업 전후 휴식 | 10분 |
| 최소/최대 블록 | 25분 / 90분 |
| 미정 소요시간 | 저장된 기본 소요시간, 없으면 회당 60분; 추정으로 표시 |
| 반복 배치 | 기본적으로 다른 날짜; repeatOnSeparateDays=false로 같은 날짜 허용 |

`PlanTasksRequest.settings`로 변경할 수 있다. `user_preferences.settings.scheduling`의 요일·한도·휴식·블록·반복 설정도 읽는다.
이번 단계는 설정을 저장하지 않는다. 작업 가능 시각은 같은 로컬 날짜 안의 start < end 범위를 지원한다.
날짜 범위는 요청 설정이 기준이며 AI가 시작/종료 범위를 바꾸지 않는다.

기존 temporal-polyfill을 재사용해 UTC instant와 로컬 달력 날짜를 분리한다.
시작/종료 추천값은 UTC offset이 포함된 ISO 문자열이다. DST 중복/없는 작업 시각은 건너뛰고 경고한다.
기존 고정 일정의 시각이 DST로 모호하면 충돌을 무시하지 않고 추천을 중단한다.
달력 날짜의 시작은 첫 유효 시각을 사용하므로 자정 DST 전환도 처리한다.
종료가 미정인 기존 일정은 해당 날짜 끝까지 보수적으로 차단하고 경고한다.
기존 종일 일정은 전체 날짜를 차단한다. 월 반복의 존재하지 않는 월 일자는 건너뛴다.

마감일 미정은 원본 null을 유지하고 추천 범위 끝을 임시 상한으로 사용했다는 확인 사항을 반환한다.
소요시간·마감일·우선순위 추정 여부는 원본 작업과 추천 블록에 보존된다.

## 4차 UI 인터페이스

```ts
import { processAiInput, planTasksFromText } from './src/services/ai/index.ts'

const routed = await processAiInput({
  text: '이번 주에 시험 공부 5시간, 발표자료 수정 3시간, 운동 2번 해야 해. 일정 알아서 짜줘.',
  settings: { maxDailyMinutes: 240, breakMinutes: 10, minBlockMinutes: 25 },
})
if (routed.intent === 'PLAN_TASKS') {
  const { analysis, result } = routed.recommendation
  // result.blocks: sourceTaskId/title/startAt/endAt/durationMinutes/priority/reason/status/confirmationNeeded
  // result.tasks: 원본 PlanningTask, status, remainingMinutes, completedOccurrences, reason
  // result.settings: 실제 적용한 설정과 now
  // result.recommendationOnly === true
}
// 명시적 Planner 호출은 planTasksFromText({ text, settings })
```

공통 타입: PlanTasksRequest → PlanningRecommendation { analysis: PlanningAnalysis, result: SchedulingResult }.
직접 엔진: `scheduleTasks(tasks, existingSchedules, settings)`.
원본 sourceTaskId는 분석 항목 ID를 유지하며 DB schedule.id를 임의로 추측하지 않는다.

UI는 원본/추천 블록/미배치 사유/추정 확인을 표시하고 수정 후 엔진을 다시 실행할 수 있다.
현재 홈 UI의 Planner 안내는 유지하며 Planner UI는 구현하지 않았다.
4차 승인 저장 시에는 최신 일정을 다시 조회해 충돌·권한을 검증하고 기존 저장 API와 이력 구조를 사용해야 한다.
현재 추천 응답은 조회 시점의 스냅샷이며 이후 일정 변경까지 예약하지 않는다.

미배치 reason 코드:
- DEADLINE_PASSED: 추천 범위 전에 마감됨.
- INSUFFICIENT_CAPACITY: 마감/시간 범위/한도/반복/분할 제약 안에 남은 작업을 배치할 수 없음.
- DEPENDENCY_UNSCHEDULED: 선행 작업 미배치 또는 없는 선행 ID.
- DEPENDENCY_CYCLE: 순환 선후 관계에 막힘.
- BELOW_MIN_BLOCK: 원본 소요시간이 최소 블록보다 작음. 임의로 시간을 늘리지 않음.
- RECOMMENDATION_LIMIT: 요청당 최대 5000 추천 블록 한도.

## 실제 연결 및 테스트 (2026-10-13)

- `plan-tasks`를 기존 Blanky Supabase 프로젝트에 배포했다. 사용자 인증과 RLS 읽기를 사용하며 DB 쓰기 없음.
- `OPENAI_API_KEY`는 기존 서버 Secrets를 재사용한다. 새 공개 키나 VITE_ 키를 만들지 않았다.
- 일반 분석 모델 설정은 유지한다. 계획 의미 분석은 `OPENAI_PLANNING_MODEL`로 별도 변경 가능하며 기본값은 gpt-4.1-mini다.
- 실제 OpenAI + 합성 고정 일정 + 엔진 연결: 사용자 예시의 3개 작업, 300분/180분/2회 분석과 충돌 없는 추천 생성 통과.
  초기 응답의 항목/메타데이터 불일치 등은 검증기가 차단했고 모델·프롬프트·배치 대기 계약을 보강했다.
  단일 합성 시나리오의 통과이며 모델 품질 전체를 보증하지 않는다.
- 실제 배포 smoke: CORS 및 비로그인 차단 확인. 인증된 분석/Planner 전체 경로는 사용자 토큰 없음으로 미실행.
- 기본 `npm test`: 128개 통과, 이 중 scheduling 전용 테스트 20개.
  요청한 14개 기준을 포함하며 timezone/DST, 이전 반복 일정, 자정 경계, 조회 실패도 검증한다.
- Scheduling 모듈 및 테스트 별도 strict TypeScript 검사, 변경 파일 ESLint 검사 통과.
- React 프로덕션 빌드 통과. 기존 큰 chunk 경고는 남아 있다.
- 전체 lint는 기존 UI 오류 9개로 실패했다. 이번 엔진·API·타입 변경 코드에는 lint 오류가 없다.
- 프런트엔드 빌드에 실제 OpenAI 키가 포함되지 않음을 확인했다.
- 기존 일정 드래그·지속 저장, AI 입력 브라우저/Calendar·Today·Diary·Reading 이동, Reading 기능 smoke 통과.
- Diary 브라우저 회귀 16개 통과, 브라우저 오류 없음.
- 테스트는 disposable 로컬 브라우저/합성 데이터만 저장한다. 운영 일정·할 일·변경 이력·기록은 수정하지 않는다.

명령:
```text
npm run test:scheduling
npm run test:scheduling-live    # 실제 OpenAI 호출, 합성 일정만 사용
npm run test:scheduling-edge    # 배포 확인; AI_TEST_USER_TOKEN이 있으면 인증된 전체 경로도 검사
npm test
npm run build
```

## 이번 단계 수정/추가 파일

- `packages/scheduling/package.json`, `src/{engine,time,settings,analysis,planner,index}.ts` — 독립 엔진과 추천 오케스트레이션.
- `packages/types/src/{planning,planningSchema}.ts`, `ai.ts`, `aiSchema.ts`, `index.ts` — 공통 요청/분석/추천 타입 및 검증.
- `packages/parse/src/{planningProvider,openAITransport}.ts`, `analysisProvider.ts`, `intentRouter.ts` — AI 의미 분석, 기존 transport 재사용, PLAN_TASKS 분기.
- `packages/api/src/planning.ts`, `scheduleRepository.ts`, `index.ts` — 추천 API, 기존 조회 확장.
- `src/services/ai/index.ts`, `src/features/ai/index.ts` — 4차용 라우팅 서비스.
- `supabase/functions/plan-tasks/{index,handler}.ts`, `deno.json`, `supabase/config.toml` — 인증된 추천 전용 함수.
- `tests/scheduling.test.ts`, `scripts/scheduling-live-test.mjs`, `scripts/scheduling-edge-test.mjs`, `package.json` — Mock/실제 테스트 분리.
- `.env.example`, 이 문서 — 서버 모델 설정과 연결 안내.

1·2차 및 별도 public 자산의 기존 미커밋 변경은 보존했다. 4차 UI·승인 저장·DB 구조 변경은 포함하지 않았다.

참고: [OpenAI 모델의 Structured Outputs 지원](https://developers.openai.com/api/docs/models/gpt-4.1-mini),
[Temporal의 타임존/DST 처리](https://tc39.es/proposal-temporal/docs/zoneddatetime.html).
