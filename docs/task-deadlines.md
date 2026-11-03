# Task deadline implementation

기존 `dueDate` / `due_date`를 유지하고 선택적 `dueTime` / `due_time`을 추가했다. 날짜만 있는 마감은 시각을 `null`로 유지한다. 기존 브라우저 데이터·AI 분석에 이 필드가 없어도 읽을 수 있다. 일정의 `date/startTime/endTime`과 마감의 의미를 분리하며, 자연어 미리보기는 마감만 있는 입력의 일정 날짜를 자동 확정하지 않는다. 기존 필수 날짜는 사용자가 미리보기에서 확인한다.

`까지`, `전까지`, `마감`, `제출 기한`은 기존 날짜·시각 규칙 파서를 활용한다. 복합 문장은 기존 AI 경로에서 여러 항목으로 분리하고 구조화 스키마, 원문 근거, 마감 시각 일치 여부를 검증한다. 단순한 모호한 마감은 AI로 임의 확정하지 않고 미리보기에서 확인한다. 마감이 모호하면 수정 또는 해제 후 확인 체크가 필요하다. AI의 실제 원격 응답 품질은 이번 로컬 테스트 범위에 포함하지 않았다.

서울 기준으로 날짜만 있는 마감은 다음 날부터 기한 초과다. 시각이 있으면 해당 시각 이후 기한 초과다. 오늘 마감과 향후 3일 이내 마감을 별도 표시하며, 완료 작업은 강조·기한 초과 대상에서 제외한다. 마감 없는 카드에는 배지를 추가하지 않는다. Planner 추천·승인·재계획에서도 마감 시각을 보존하고 넘지 않도록 검증한다.

## 변경 파일

타입·검증:

- `packages/types/src/schedule.ts`
- `packages/types/src/ai.ts`
- `packages/types/src/aiSchema.ts`
- `packages/types/src/planning.ts`
- `packages/types/src/planningSchema.ts`
- `src/types/work.ts`
- `packages/api/src/database.generated.ts`

파싱·계획:

- `packages/parse/src/deadline.ts` (신규)
- `packages/parse/src/parse.ts`
- `packages/parse/src/resolve.ts`
- `packages/parse/src/provider.ts`
- `packages/parse/src/analysisProvider.ts`
- `packages/parse/src/planningProvider.ts`
- `packages/scheduling/src/engine.ts`
- `packages/scheduling/src/approval.ts`
- `packages/scheduling/src/replanning.ts`
- `src/features/ai/conversation.ts` (마감 변경 패치에 시각 포함; 기존 수정 보존)
- `src/features/ai/review.ts`

저장·UI:

- `packages/api/src/scheduleRepository.ts`
- `packages/api/src/ai.ts`
- `src/services/schedule/index.ts`
- `src/utils/parseQuick.ts`
- `src/utils/scheduleDraft.ts`
- `src/utils/work.ts`
- `src/utils/entries.ts`
- `src/utils/deadline.ts` (신규)
- `src/features/schedule/seriesEdit.ts` (기존 파일의 마감 해제·시각 복사 보완)
- `src/components/tasks/DeadlineFields.tsx` (신규)
- `src/components/tasks/DeadlineBadge.tsx` (신규)
- `src/components/schedule/AnalysisReview.tsx`
- `src/components/schedule/WorkCard.tsx`
- `src/components/schedule/ScheduleTimeline.tsx`
- `src/pages/Schedule/SchedulePage.tsx`

DB·Edge·테스트:

- `supabase/migrations/20261029120000_task_deadline_time.sql` (신규)
- `supabase/functions/approve-plan/handler.ts`
- `supabase/functions/replan-tasks/handler.ts`
- `tests/deadline.test.ts` (신규)
- `supabase/tests/task_deadline.sql` (신규)
- `scripts/deadline-browser-test.mjs` (신규)
- `package.json`
- `docs/task-deadlines.md` (이 보고서)

`parse-schedule`와 `plan-tasks`는 수정된 공용 파서·스키마·계획 엔진을 사용하므로 핸들러 중복 구현은 추가하지 않았다. 기존 저장·조회·완료 처리와 RLS를 유지한다. 새 라이브러리는 추가하지 않았다.

## 검증 결과

- 관련 회귀 테스트 113개 통과. 새 데드라인 테스트 15개 포함: 날짜만/날짜+시각/상대·특정 날짜/복합 입력/모호·잘못된 날짜/시각 추정 거부/수정·해제/서울 날짜 경계/완료 상태/Planner·재계획.
- 브라우저 테스트 통과: 실제 할 일 목록의 기한 초과 표시, 날짜·시각 수정, 새로고침 후 유지, 마감 해제, 390px 모바일 편집 화면 가로 넘침 없음.
- 전체 `npm test`: 311개 중 310개 통과. 기존 중복 일정 후속 대화 테스트 1개 실패 (`conversation.test.ts:93`, `dedupe` 기대값에 `conflicts` 반환). 관련 없는 기존 대화 변경은 되돌리지 않았다.
- 신규 핵심 파일 ESLint 및 변경 공백 검사 통과.
- 전체 빌드는 기존 캘린더 연동 타입 오류, 앱에 포함된 Node 테스트 타입 오류, Home 호출 인자 오류 등으로 실패한다. 빌드 로그에서 이번 기능의 변경 파일에 타입 오류가 없음을 확인했다.
- Supabase CLI가 설치되지 않아 SQL 테스트는 실행하지 못했다. 테스트 SQL은 트랜잭션 롤백을 사용하며 날짜만/시각 저장/제약/완료/해제/타인 조회 차단 8개 검증을 포함한다.

## 적용

실제 DB와 Edge Function에는 배포하지 않았다. DB 마이그레이션을 먼저 적용하고 `parse-schedule`, `plan-tasks`, `approve-plan`, `replan-tasks`를 갱신한 다음 웹을 배포해야 한다. 공용 스키마가 확장되므로 이 함수들을 함께 갱신한다. 기존 행은 `due_time = null`을 유지한다.

재실행:

```sh
npm run test:deadline
npm run test:deadline-browser
supabase test db supabase/tests/task_deadline.sql
```
