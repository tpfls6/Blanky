# Blanky 4차 — Planner 미리보기와 승인 저장

## 구현 결과

Home의 기존 자연어 입력에서 PLAN_TASKS를 별도로 처리한다. 기존 processAiInput → planTasksFromText → plan-tasks → Scheduling Engine 흐름을 재사용하며, 승인 전에는 일정을 저장하지 않는다. RESCHEDULE은 추후 기능 안내로 종료한다. 단순 입력과 복합 입력의 기존 처리 흐름을 유지했다.

Planner는 원문, 분석한 작업, 날짜별 추천, 시간·소요시간·우선순위, 추정 정보 확인, 미배치 이유를 표시한다. 제목·날짜·시각·소요시간·우선순위·포함 여부를 수정할 수 있고, 개별 또는 선택 전체 적용을 지원한다. 수정 시 기존 일정 및 선택한 추천끼리의 충돌을 즉시 검사한다. 취소·오류·로그인 화면 이동에도 원문과 수정 초안을 유지한다. 이미 일부 저장한 계획의 재생성은 중복 작업 추천을 막기 위해 비활성화한다.

## 저장과 보안

서버가 사용자 ID에 묶인 2시간 유효 서명 추천을 발급한다. approve-plan은 로그인 확인, 서명 검증, 최신 planner_snapshot 조회, 사용자 수정값과 원본 작업 검증, 충돌·마감·작업 시간·휴식·일일 한도·선후 관계 검사를 수행한다. 사용자의 수정값은 AI 값보다 우선하되 하드 제약을 충족해야 한다. 추정 정보는 명시적 확인이 필요하다.

approve_planner RPC는 사용자별 advisory lock과 최신 revision 검사를 사용한다. 같은 잠금에 일반 일정·캘린더·사용자 설정 변경도 참여하여 검사 이후 경합을 차단한다. 선택 일정과 기존 변경 이력 트리거가 한 트랜잭션에서 처리되므로 일부 실패 시 전부 롤백한다. 사용자·미리보기·블록 키와 정규화한 저장값의 해시로 재시도를 판별하고 같은 요청은 기존 ID를 반환한다. 해당 RPC는 서비스 역할만 호출할 수 있고, 일반 클라이언트는 Planner 승인 메타데이터를 직접 설정할 수 없다.

기존 저장 테이블과 변경 이력을 재사용했다. 새 계획 테이블 없이 schedules에 nullable 승인 키·해시 두 컬럼과 인덱스/함수/트리거만 추가했다. 기존 데이터를 초기화하거나 삭제하지 않았다. API 키와 서명 비밀은 서버에만 있다. 응답은 기존 mapScheduleRow에서 한 번만 공통 타입으로 변환한다. 저장 성공 후 라이브러리에 반환 일정을 반영하고 기존 조회 API로 Calendar·Today와 이력을 갱신한다.

## 주요 수정 파일

- UI/연결: src/components/schedule/PlannerPreview.tsx, src/pages/Home/HomePage.tsx, src/features/ai/plannerEdits.ts, src/services/ai/index.ts, src/state/library.tsx, src/state/useLibrary.ts
- 공통 계약/API: packages/types/src/planning.ts, planningSchema.ts, plannerApproval.ts, schedule.ts, index.ts; packages/api/src/plannerApproval.ts, planning.ts, scheduleRepository.ts, database.generated.ts, index.ts
- 라우팅: packages/parse/src/intentRouter.ts, intentRouter.test.ts, resolve.ts; src/features/ai/conversation.ts
- 엔진: packages/scheduling/src/approval.ts, engine.ts, index.ts
- 서버: supabase/functions/_shared/plannerToken.ts, supabase/functions/plan-tasks/{handler,index}.ts, supabase/functions/approve-plan/{handler,index}.ts 및 deno.json, supabase/config.toml
- DB: supabase/migrations/20261013160000_planner_approval.sql
- 검증: tests/plannerApproval.test.ts, tests/fixtures/planner.ts, scripts/planner-{browser-test,approval-live-test,live-browser-test,test-user}.mjs, scripts/ai-browser-test.mjs, package.json

작업 디렉터리에는 이전 1~3차 변경도 함께 남아 있다. 기존 manifest/icons 변경은 보존했다.

## 검증 결과

| 구분 | 결과 |
| --- | --- |
| 전체 단위/Mock 테스트 | npm test: 136개 통과 |
| Planner 단위 테스트 | 8개 통과: 서명, 수정 검증, 충돌, 최신 조회, 응답 매핑, 로그인 만료, 재시도 등 |
| Mock 브라우저 | 승인 전 무저장, 수정·제외·추정 확인·미배치, 즉시 충돌, API/인증 오류 시 초안 유지, 이중 클릭, 모바일 통과 |
| 인증된 실제 API | 실제 OpenAI 추천, 승인 전 0건, 최신 충돌 차단, revision 경합 차단, 정상 저장·이력, 재시도 동일 ID, 일반 사용자 RPC 접근 거부, 배치 원자성 롤백 통과 |
| 인증된 실제 브라우저 | 로그인 폼 → Home → Router → plan-tasks → RLS 조회 → OpenAI → 엔진 → Planner → approve-plan → Calendar/Today 통과 |
| 실제 브라우저 저장 | 테스트 일정 2건·이력 2건, 승인 전 0건, 이중 클릭 중복 없음, 닫기 후 원문 유지 |
| 기존 기능 | Home AI 입력, 일정 드래그/저장, Diary 16개, Reading, Theme 회귀 검사 통과 |
| 타입/빌드 | tsc -b 및 추가 scheduling/approval strict 검사 통과, Vite 빌드 통과 |
| 린트 | 변경 기능 대상 통과. 전체 린트는 기존 IconPicker 2개, Sortable 1개, CategoryPicker 1개, SchedulePage 5개 오류가 남음 |

실제 테스트는 별도 생성한 인증 계정에서 수행했다. 테스트 소유 메타데이터와 이메일을 확인한 뒤 테스트 일정·이력·계정을 정리했으며 기존 사용자 데이터는 변경하지 않았다. Mock 결과를 실제 OpenAI 호출 결과와 구분했다.

## 배포와 다음 단계

plan-tasks와 approve-plan Edge Function을 실제 프로젝트에 배포했고 승인 migration도 적용했다. 프런트엔드 호스팅 배포는 수행하지 않았다. 원격 프로젝트에는 migration 이력 테이블이 없어 이번 SQL 파일만 명시적으로 적용했으며, 다음 DB 배포 전 baseline 이력을 정리해야 한다.

미리보기는 2시간 유효하며 한 승인 요청은 최대 200개 블록이다. 같은 날의 작업 시간만 지원하며 DST의 모호한 현지 시각은 안전하게 거부한다. 삭제된 승인 일정의 영구 중복 방지 기록은 별도로 유지하지 않는다. 부분 승인 후 남은 작업만 재생성하는 기능, 더 큰 배치 지원, 번들 분할(현재 빌드 용량 경고), 다양한 실제 문장 품질 평가가 후속 개선 사항이다. 습관 학습과 자동 재배치는 구현하지 않았다.

5차 UI는 기존 processAiInput의 planning 결과와 approvePlanner({token, blocks}) 계약을 재사용할 수 있다. PlannerEdit는 id/title/date/startTime/endTime/durationMinutes/priority/included/confirmed를 제공하고 승인 응답은 schedules와 applied[{blockId,scheduleId}]를 반환한다. 이후 재배치 기능도 승인·최신 snapshot·원자 저장 경계를 유지해야 한다.
