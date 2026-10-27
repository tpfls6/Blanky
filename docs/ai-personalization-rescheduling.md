# Blanky 5차 — 개인화 설정과 승인 재배치

## 기능과 기존 구조 재사용

`/settings/planning`에 기본 설정(요일, 작업 시작/종료, 일일 한도, 기본 소요시간)과 접을 수 있는 고급 설정(집중 시간대, 빠른 시간/집중 시간 우선 배치, 휴식, 분할, 직접 수정 이력 참고)을 추가했다. 기존 preference repository와 `user_preferences`의 설정 JSON을 사용한다. 저장 실패를 안내하고 초안을 유지하며, 로그인 후 서버에서 읽은 설정도 화면에 반영한다. 기존 타임존을 유지한다.

엔진은 저장된 사용자 설정을 요청 및 AI 추정보다 우선한다. 집중 시간은 가능한 경우 먼저 사용하고, 부족하면 작업 가능 범위 내 다른 시간을 사용한다. 명시한 작업 소요시간과 우선순위는 유지한다. 소요시간이 불명확하면 사용자 기본값을 사용하고 추정임을 표시한다. 분할 금지 시 긴 작업을 임의로 나누지 않는다.

수정 이력 참고는 기본적으로 꺼져 있다. 켜면 최근 변경 이력 100개 중 같은 제목을 두 번 이상 직접 수정한 작업의 최근 소요시간·우선순위를 참고한다. 일반 수동 수정과 Planner 승인 중 사용자가 수정한 값만 대상으로 삼는다. AI 생성/자동 재배치 결과를 사용자 수정으로 취급하지 않는다. 명시한 입력값은 이력으로 덮어쓰지 않으며, 참고 정보는 확인 대상으로 표시한다. 통계적 자동 학습 기능은 구현하거나 주장하지 않는다.

Home과 Schedule의 일정 데이터가 갱신되면 서버에서 AI 승인 일정의 실제 시간 충돌을 확인한다. Home에서 재배치 추천을 열거나 자연어로 재배치를 요청할 수 있다. 이미 승인된 AI 일정만 이동 대상으로 선택하고, 직접 만든 일정은 고정 제약으로 둔다. 영향받은 선후 작업도 함께 고려한다. 기존 데이터와 Scheduling Engine으로 대체 시간을 계산하므로 재배치에는 추가 OpenAI 호출이 필요하지 않다.

Planner에 이전 시각과 추천 시각, 영향 사유, 미배치 작업을 표시한다. 미리보기·취소는 일정 DB를 변경하지 않는다. 승인 시 기존 approve-plan API와 approve_planner RPC를 재사용해 **기존 일정 ID를 유지한 UPDATE**를 수행한다. Calendar/Today 반영과 변경 이력도 기존 경로를 사용한다.

부분 승인 후에는 승인 카드와 남은 카드가 구분된다. ‘남은 작업 다시 계획하기’는 서버의 실제 승인 키를 조회해 저장 완료한 작업을 제외하고, 원래 작업 단위 ID와 요청 ID를 유지한다. 제목·소요시간·우선순위 수정값을 이어받고 기존 승인 일정은 빈 시간 계산에 포함한다. 새 미리보기에서는 이전 승인 목록과 남은 개수를 표시한다. 승인 유효기간이 끝나도 서명과 사용자 소유권을 확인한 뒤 남은 작업의 새 추천은 만들 수 있으며, 만료된 추천 자체로 저장할 수는 없다.

## 저장·검증·DB 변경

- 서버 인증 → 서명/사용자 소유권 확인 → 최신 일정 및 설정 조회 → 수정값·시간 충돌·마감·휴식·일일 한도·반복·선후 관계 검증 → 기존 원자 저장 RPC 순서다.
- 추천 이후 사용자 설정이 바뀌면 저장을 중단하고 새 설정으로 다시 추천하도록 안내한다. 재배치 대상의 삭제·완료·변경 및 검사 중 경합도 차단한다.
- 기존 사용자별 advisory lock과 revision 검사를 재사용한다. 재배치에는 대상 ID, 불변 승인 키, 예상 updated_at을 서명에 포함한다. 트랜잭션의 어떤 행이라도 실패하면 UPDATE와 이력을 모두 롤백한다.
- 같은 저장 요청은 payload 해시로 판별해 기존 ID를 반환한다. 다른 미리보기의 오래된 UPDATE는 최신 시각 검사에서 거부한다. 재계획도 원래 승인 키를 재사용하여 중복 INSERT를 방지한다.
- `20261013180000_planner_personalization.sql`은 schedules에 nullable `planner_metadata` JSONB 하나를 추가하고 기존 잠금/승인 함수를 확장한다. 선후 관계, 마감, 반복 그룹, 사용자 수정 여부를 보존한다. 새 설정 테이블은 없다. 기존 데이터 초기화·삭제·일괄 변경은 하지 않았다.
- RLS와 서비스 역할 전용 RPC를 유지한다. 일반 클라이언트는 승인 키/메타데이터/해시를 위조할 수 없다. OpenAI 키는 서버에만 있으며 빌드 산출물 키 검사도 통과했다.

## 이번 단계 수정 파일

| 영역 | 파일 |
| --- | --- |
| 설정 UI | src/pages/Settings/PlanningPreferences.tsx, SettingsPage.tsx |
| Home·Schedule·Planner | src/pages/Home/HomePage.tsx, src/pages/Schedule/SchedulePage.tsx, src/components/schedule/PlannerPreview.tsx, src/features/ai/usePlannerConflicts.ts |
| 프런트 설정·서비스 | src/services/preferences/index.ts, src/services/ai/index.ts, src/types/records.ts |
| 엔진 | packages/scheduling/src/settings.ts, engine.ts, planner.ts, approval.ts, preferences.ts, replanning.ts, index.ts |
| 공통 타입·검증 | packages/types/src/planning.ts, planningSchema.ts, plannerApproval.ts |
| 기존 API 확장 | packages/api/src/planning.ts, index.ts |
| Edge | supabase/functions/plan-tasks/index.ts, approve-plan/index.ts, approve-plan/handler.ts, _shared/plannerToken.ts, replan-tasks/index.ts, replan-tasks/handler.ts, replan-tasks/deno.json |
| DB·설정 | supabase/migrations/20261013180000_planner_personalization.sql, supabase/config.toml |
| 테스트·실행 | tests/personalization.test.ts, scripts/personalization-live-test.mjs, scripts/personalization-browser-test.mjs, package.json |

기존 1~4차의 미커밋 변경과 manifest/icons 변경은 보존했다. 위 목록은 5차에서 추가 또는 수정한 파일이다.

## 테스트 결과

| 검증 | 결과 및 구분 |
| --- | --- |
| 전체 단위/Mock | npm test **151개 통과**, 그중 5차 15개 |
| 선호 설정 | 실제 Supabase 저장·재조회 및 로그아웃/재로그인 후 유지 통과 |
| 작업 가능 시간·집중 시간·한도·분할 | 단위/Mock 통과. 실제 OpenAI 추천에서도 저장 설정 우선과 집중 시간 반영 확인 |
| 수정 이력 구분 | 단위/Mock으로 사용자 직접 수정·Planner 수정·AI 자동 변경 구분 및 명시 입력 우선 확인 |
| 충돌·고정 일정 보호 | 실제 테스트 계정의 새 고정 일정으로 충돌 탐지, 고정 행 불변 확인 |
| 재배치 미리보기 | Mock 및 실제 브라우저 전후 비교 표시 통과. 승인 전 행/이력 변경 없음 |
| 최신 검증 | 실제 API에서 승인 직전 추가 충돌 및 설정 변경 차단 통과 |
| 승인 반영 | 실제 API/브라우저에서 같은 일정 ID UPDATE, 변경 이력, Calendar/Today 갱신 통과 |
| 부분 승인·남은 작업 | 실제 API/브라우저에서 한 작업 승인 후 남은 한 작업만 재계획, 수정 제목·우선순위 및 원래 키 유지 통과 |
| 중복·원자성 | 승인/재배치 재시도 동일 ID, 중복 없음. 두 번째 UPDATE 실패 시 첫 UPDATE까지 롤백하는 실제 DB 검증 통과 |
| 사용자 격리 | 별도 두 테스트 계정으로 타 사용자 일정·설정 읽기 차단, 외부 서명 거부, 서비스 전용 RPC 및 메타데이터 위조 차단 통과 |
| 기존 Planner UI | Mock 브라우저 편집·제외·추정 확인·오류 보존·이중 클릭·모바일 검사 통과 |
| 기존 기록 기능 | Diary 브라우저 16개, Reading smoke, Theme smoke 통과 |
| 타입·빌드 | tsc -b, Edge handler/엔진/테스트 추가 strict 타입 검사, Vite 빌드 통과 |
| 린트 | 변경 기능 대상 통과. 전체 린트는 기존 IconPicker 2개, Sortable 1개, CategoryPicker 1개, SchedulePage 5개 오류 유지 |

실제 테스트는 명시적으로 표시한 임시 계정에서 수행했다. 계정 이메일·소유 메타데이터 확인 후 테스트 일정·이력·계정만 정리했다. 기존 사용자의 데이터는 수정하지 않았다. 브라우저 화면은 `.tmp/ai-tests/personalization-reschedule.png`에서 시각적으로 확인했다.

## 배포 상태와 남은 개선 사항

plan-tasks, approve-plan, replan-tasks Edge Function을 실제 프로젝트에 배포했고 5차 migration을 적용했다. 프런트엔드 호스팅은 별도 작업으로 남겼다. 원격 DB의 migration baseline 이력 정리는 이전 단계와 동일한 후속 배포 과제다.

- 재계획/재배치는 한 번에 최대 20개 작업 단위를 지원한다. 대규모 계획의 페이지 처리와 작업 단위 추가 분할은 후속 개선 사항이다. 분할을 끈 상태에서 이전에 나뉜 여러 조각이 남아 있으면 임의로 분할 저장하지 않고 안내한다.
- 추천 기간은 엔진의 최대 30일 범위를 따른다. 이미 시작한 일정, 직접 반복 설정한 일정, 종일 AI 일정은 안전하게 자동 재배치하지 않고 직접 수정을 안내한다. DST 모호 시각은 기존 정책대로 거부한다.
- 4차 이전에 승인해 선후 관계 메타데이터가 없는 일정은 관계가 없다고 확정하지 않고 확인 안내를 제공한다. 삭제된 선행 작업은 미해결로 처리한다.
- 미승인 초안은 해당 브라우저의 sessionStorage에 유지한다. 기기 간 초안 동기화와 다른 기기의 변경에 대한 실시간 푸시 알림은 구현하지 않았다. 페이지 진입·앱 내 일정 갱신·승인 시 최신 서버 데이터를 확인한다.
- 집중 시간은 선호 조건이며 작업 가능 시간·마감·충돌·한도는 필수 제약이다. 수정 이력은 동일 제목 기반의 명시적 참고 규칙으로, 습관 학습이나 완전 자동 재배치를 의미하지 않는다.
- 기존 대형 번들 경고와 전체 린트의 기존 오류 정리가 남아 있다.

추후 기능은 `replanTasks({ mode: 'inspect' | 'reschedule' | 'remaining', token?, edits? })`, 기존 `approvePlanner({token, blocks})`, `PlanningRecommendation.changes/progress` 계약을 재사용할 수 있다. 시간 계산과 실제 저장 권한은 계속 서버/엔진에 둔다.
