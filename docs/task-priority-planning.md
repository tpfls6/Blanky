# 할 일 우선순위와 기존 할 일 시간 추천

## 기존 기능 재사용

- `Schedule.priority`와 저장소 CRUD, 기존 할 일 ID 및 `commitWork`를 그대로 사용한다. DB 마이그레이션이나 라이브러리 추가는 없다.
- `scheduleTasks`가 작업 가능 시간, 마감 날짜·시각, 우선순위, 선행 작업, 기존 일정·반복·타임존, 휴식과 하루 작업량을 계산한다.
- `PlannerPreview`, `validatePlannerEdits`, 소요시간 수정 로직과 추정값 확인 UI를 공유한다.

## 추가한 동작

- 일정 페이지 직접 생성·편집 및 홈 상세 카드에 높음·보통·낮음 선택과 작은 배지를 추가했다. 할 일 목록은 카테고리 안에서 우선순위 정렬 및 필터가 가능하다.
- AI 분석 계약에 선택적 `priorityRecommendation`과 한국어 이유를 추가했다. 이전 응답·초안도 읽을 수 있다. 명시한 긴급도·중요도·미뤄도 되는 표현을 반영하고, 가까운 마감만으로 높음으로 올리지 않는다. 규칙 파서 결과도 같은 검토 UI에서 추천을 확인하고 수정한다.
- 할 일 자동 분류의 자동 저장을 우회해 우선순위 검토를 거치게 했다. 추천은 기존 할 일의 저장된 우선순위를 추론해서 변경하지 않는다.
- 일정 페이지의 ‘시간 배정 추천’에서 미배정·미완료 할 일을 여러 개 선택하고 선행 작업을 지정할 수 있다. 선행 작업은 함께 선택해야 한다.
- 추천은 읽기 전용이다. 기존 할 일은 하나의 시간대에 연결하므로 분할하지 않는다. 연속 작업 한도를 넘거나 마감 전 빈 시간이 부족하면 미배정 이유와 조정 방법을 표시한다.
- 적용 직전 서버의 최신 일정 및 선택한 할 일을 다시 조회하고 충돌·휴식·마감·사용자 변경을 검증한다. 기존 ID를 수정하며 완료 상태·마감·반복·설명은 보존한다. 재시도 시 이미 적용한 ID를 건너뛴다.
- 추정값 확인 체크를 한 항목의 시간·소요시간·우선순위는 다시 추천해도 유지하고 다른 작업은 그 주위를 배치한다. 제외 및 우선순위 수정도 유지한다.

## 검증

- `npm run test:task-priority`: 새 회귀 테스트 10개 통과.
- AI 분석·마감·배정·승인·초안과 새 테스트 합계 84개 통과.
- `npm run test:task-priority-browser`: 실제 로컬 앱에서 우선순위 저장/재로딩/필터, AI 추천 수정 후 저장, 승인 전 미저장, 추정 소요시간 수정, 확정값 재추천 유지, 기존 ID 적용, 중복 적용 차단 및 1440px/390px 화면 통과.
- 화면: `.audit/runs/task-priority/desktop.png`, `mobile.png`.
- 변경한 새 UI/추천 코드 ESLint 통과. `vite build` 통과.
- 전체 기존 테스트는 320개 중 319개 통과. 기존 `packages/parse/src/conversation.test.ts:100`의 dedupe/conflicts 분류 실패가 남아 있다. 해당 구현은 변경하지 않았다.
- 전체 TypeScript 빌드는 기존 calendarSync, HomePage 호출 인자, 테스트의 Node 타입 및 library 매핑 타입 오류로 실패한다. 이번에 추가한 코드에서 보고된 타입 오류는 없다.

## 검증 범위

브라우저 검증은 외부 계정·일정에 쓰지 않는 로컬 모드에서 실행했다. 실제 Supabase/AI 모델 호출과 동시 서버 쓰기는 검증하지 않았다. 적용 전 최신 읽기와 검증은 하지만 서버 전체를 잠그는 트랜잭션은 아니므로 다른 기기가 검증 직후 새 일정을 쓰는 경쟁까지 원자적으로 차단하지는 않는다. 여러 개를 적용하다 네트워크가 실패하면 먼저 저장된 항목은 유지되며, 같은 화면에서 재시도하면 해당 항목은 건너뛴다.

## 수정 파일

- UI: `src/pages/Schedule/SchedulePage.tsx`, `src/components/tasks/Priority.tsx`, `src/components/schedule/{AnalysisReview,PlannerPreview,WorkCard,ExistingTaskPlanner}.tsx`
- 추천·검토: `src/features/ai/{existingTaskPlanning,review}.ts`, `src/utils/scheduleDraft.ts`
- AI 계약: `packages/types/src/{ai,aiSchema}.ts`, `packages/parse/src/{priority,analysisProvider,planningProvider}.ts`
- 기존 데이터 조회: `packages/api/src/scheduleRepository.ts`
- 테스트·기록: `tests/taskPriorityPlanning.test.ts`, `scripts/task-priority-browser-test.mjs`, `package.json`, 이 문서 및 `.audit/runs/task-priority/` 캡처
