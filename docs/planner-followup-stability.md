# Blanky 후속 개선 — 린트·번들, 대규모 재계획, 기기 간 초안

2026-10-14에 요청된 순서대로 세 작업을 완료했다. 프런트엔드 호스팅 배포는 수행하지 않았다.

## 1. 린트와 번들

기존 린트 오류 9개를 규칙 비활성화 없이 수정했다. IconPicker의 최근 아이콘 갱신을 열기 이벤트로 옮기고 기존 IconView를 재사용했다. Sortable의 ref 동기화는 layout effect에서 수행하며, CategoryPicker의 검색/열기 이벤트에서 활성 항목을 초기화한다. Schedule의 효과가 없는 메모화와 사용하지 않는 구조 분해 변수를 정리했다.

화면을 React.lazy/Suspense로 나누고, 테마 미리보기 바를 테마 관리 화면에서 분리했다. React·Supabase 및 Reading 전체 아이콘을 별도 청크로 분리했다. 일반 UI 아이콘과 Lucide 별칭은 초기 화면에 필요한 부분으로 유지하여 전체 아이콘 카탈로그가 초기 화면에 따라 들어오지 않도록 했다. 지연 로딩 실패 시 다시 불러오기 화면도 제공한다. Vite/Rolldown 설정은 [Vite 공식 빌드 안내](https://vite.dev/guide/build.html)와 [Rolldown codeSplitting 문서](https://rolldown.rs/reference/OutputOptions.codeSplitting)를 따랐다.

| 항목 | 이전 | 변경 후 |
| --- | --- | --- |
| 가장 큰 JS 청크 | 약 979KB | 약 241KB |
| 초기 정적 JS 의존 파일 합계 | 기존 단일 진입 파일 약 979KB | 약 727KB |
| 대형 청크 경고 | 있음 | 없음 |
| 전체 린트 | 기존 오류 9개 | 오류·경고 0개 |

크기는 gzip 전 기준이다. 단일 파일 감소와 초기 전송 합계 감소는 서로 다른 지표다. Reading 아이콘 1,854개를 유지했으며, 실제 production build를 브라우저에서 실행해 화면별 이동, 전체 아이콘 로딩, 차단된 화면 청크의 복구를 검증했다.

## 2. 재계획 200개 작업 단위

재계획/재배치의 작업 단위 한도를 20개에서 200개로 확대했다. Scheduling Engine, 내부 추천 스키마, API 경계, 서명 토큰 검증이 같은 범위를 지원한다. 기존 승인 RPC의 최대 200개 원자 저장 한도를 그대로 사용한다.

OpenAI의 원본 의미 분석은 여전히 최대 20개 활동으로 제한한다. 원본 활동을 반복·분할해 만든 내부 작업 단위가 최대 200개인 구조이며, AI 응답 검증을 느슨하게 만든 변경이 아니다. 원본 작업 ID와 기존 승인 키, 선후 관계, 반복 그룹, 마감 및 사용자 수정값을 유지한다. 201개 이상 또는 1MB를 넘는 서명 토큰은 이유를 안내하고 거부한다.

UI는 20개씩 페이지를 나눈다. 페이지를 바꿔도 수정값과 제외 여부를 유지하며, 전체 적용은 모든 페이지의 선택 항목을 한 번에 승인한다. 200개 생성·검증과 199개 선택 승인(Mock), 실제 OpenAI 분석에서 파생한 30개 작업의 인증된 재계획을 확인했다.

## 3. 기기 간 초안 동기화

기존 Home의 활성 Planner 미리보기 하나를 사용자별 비공개 `planner_drafts`에 저장한다. 원문, 서버가 서명한 추천, 수정값, 포함 여부, 추정 확인 상태를 이어받는다. 입력 중 비어 있는 제목·날짜·시간 등 미완성 필드도 초안으로 보존하며, 실제 일정 승인에는 기존의 엄격한 검증을 사용한다.

수정은 약 1초 지연 후 합쳐서 저장한다. 화면 진입, 창 활성화, 활성 화면의 20초 주기 조회로 다른 기기의 변경을 확인한다. 빈 기기에서는 서버 초안을 복원한다. 로컬 수정과 다른 기기의 초안이 다르면 자동 덮어쓰기 대신 ‘다른 기기 초안 불러오기’ 또는 ‘이 기기의 초안으로 저장’을 선택하게 한다. 네트워크 실패 시 sessionStorage와 현재 수정값을 유지하고 재시도를 제공한다.

동시 수정은 서버 revision의 compare-and-set으로 차단한다. 요청을 직렬화하고 타이핑 중 최신 값만 저장한다. 취소는 행 삭제 대신 revision을 올린 null tombstone을 기록하여 늦게 도착한 저장 요청이 초안을 되살리지 못하게 한다. 다른 기기의 새 변경과 취소가 충돌하면 해당 변경을 보호하며, 명시적으로 서버 초안을 닫을 수 있다. 취소해도 원문과 이미 승인한 일정은 유지한다.

승인 완료 여부는 클라이언트 주장이 아니라 최신 소유 일정에서 계산한다. 재배치는 승인 메타데이터의 preview/block 식별자를 사용한다. 다른 기기에서도 이미 승인한 카드는 잠겨 중복 승인을 피하며, 최종 승인 API의 멱등성과 최신 충돌 검사도 그대로 적용된다.

## DB와 배포

- `20261014100000_planner_drafts.sql`: 사용자별 활성 초안 테이블, owner SELECT RLS, 서비스 역할 전용 쓰기 RPC, revision 잠금, 2MB 크기 제한.
- `20261014110000_planner_draft_validation.sql`: 잘못된 빈 객체 등 초안 구조 거부. 실제 연동에서 발견한 공통 JSON 변환기의 null→{} 동작은 초안 전송 경로에서 null을 명시적으로 보존하도록 수정했다. 공통 변환기의 다른 사용처는 변경하지 않았다.
- `planner-draft`를 새로 배포하고 `plan-tasks`, `replan-tasks`, `approve-plan`을 갱신했다. 두 migration도 실제 프로젝트에 적용했다.
- 클라이언트의 테이블 쓰기와 RPC 직접 호출은 허용하지 않는다. Edge Function이 로그인 사용자, 서명 소유권, 작업 ID, 초안 구조를 검증하고 사용자 ID를 서버에서 정한다.
- 기존 일정·기록 데이터는 초기화하거나 변경하지 않았다. 실제 검증은 표시된 테스트 계정만 사용하고 소유 확인 후 테스트 일정·이력·계정을 정리했다. 기존 migration baseline 이력 정리는 이전 단계에서 남은 운영 과제다.

## 검증 결과

| 구분 | 결과 |
| --- | --- |
| 전체 단위/Mock | npm test **163개 통과** |
| 린트 | npm run lint 통과, 오류·경고 없음 |
| 타입·빌드 | tsc -b, Edge/테스트 추가 strict 타입 검사, Vite 빌드 통과 |
| 대규모 UI Mock | 200개 페이지 표시, 페이지 간 제목 수정·제외 유지, 승인 전 무저장, 모든 페이지 199개 일괄 승인 통과 |
| 실제 OpenAI/API | 30회 작업 분석 → 30개 재계획, 안정적인 작업 ID, 독립 인증 세션의 제목·제외 여부 공유 통과 |
| 실제 사용자 격리 | 타 사용자 초안 읽기, 테이블 쓰기, 서비스 전용 RPC, 다른 사용자의 서명 사용 차단 통과 |
| 실제 초안 취소 | revision 충돌 방지, DB 기준 승인 상태 복원, null tombstone 및 오래된 저장 재시도 차단 통과 |
| 실제 브라우저 두 탭 | 새 sessionStorage 상태에서 복원, 양방향 수정, 명시적 충돌 선택, 승인 상태 공유, 취소 및 저장 일정 보존 통과 |
| production 브라우저 | Home·Schedule·Settings·Diary·Theme·Reading, 아이콘 1,854개, 청크 실패 안내와 재시도 통과 |
| 기존 Planner/일정 | 기존 Mock Planner UI, 일정 드래그·소요시간·새로고침 유지 통과 |
| 기록·커스터마이징 | Diary 브라우저 16개, Reading smoke, Theme smoke 통과 |
| 보안·형식 | 클라이언트 산출물 OpenAI 키 미포함, git diff --check 통과 |

실제 호출과 Mock 결과를 구분했다. 긴 시간 수치를 포함한 초기 실제 입력에서는 모델 응답 검증 거부도 관측했다. 이 경우 잘못된 결과를 저장하지 않았다. 최종 실제 확장/동기화 검증은 명시적인 30회 반복 입력으로 통과했다. 실제 연동에서 발견한 취소 오류는 수정·재배포 후 API와 두 탭에서 다시 통과했다.

화면 검토 자료: `.tmp/ai-tests/planner-draft-devices.png`. 테스트용 browser profile과 인증 계정은 정리했다.

## 이번 요청의 수정 파일

- 린트: `src/components/common/IconPicker.tsx`, `src/components/drag/Sortable.tsx`, `src/components/schedule/CategoryPicker.tsx`, `src/pages/Schedule/SchedulePage.tsx`
- 번들/화면 로딩: `src/App.tsx`, `vite.config.ts`, `src/components/common/RouteLoadBoundary.tsx`, `src/components/layout/AppLayout.tsx`, `src/pages/Themes/ThemePages.tsx`, `ThemePreviewBar.tsx`, `useThemeAction.ts`
- 재계획 계약: `packages/scheduling/src/engine.ts`, `replanning.ts`, `packages/types/src/aiSchema.ts`, `planningSchema.ts`, `supabase/functions/_shared/plannerToken.ts`
- 초안 계약/API: `packages/types/src/plannerDraft.ts`, `index.ts`, `packages/api/src/plannerDraft.ts`, `index.ts`, `database.generated.ts`
- 초안 UI: `src/features/ai/draftSync.ts`, `usePlannerDraftSync.ts`, `src/components/schedule/PlannerPreview.tsx`, `src/pages/Home/HomePage.tsx`
- 서버/DB: `supabase/functions/planner-draft/{handler,index}.ts`, `deno.json`, `supabase/functions/approve-plan/handler.ts`, `supabase/config.toml`, 위 migration 두 파일
- 검증/실행: `tests/plannerDraft.test.ts`, `tests/personalization.test.ts`, `scripts/planner-large-browser-test.mjs`, `planner-drafts-live-test.mjs`, `planner-drafts-browser-test.mjs`, `production-browser-test.mjs`, `package.json`

이전 단계의 미커밋 변경과 기존 manifest/icons 변경은 보존했다. 커밋·푸시·프런트엔드 호스팅 배포는 수행하지 않았다.

## 현재 한계

사용자당 활성 초안 하나를 지원한다. 오프라인 편집은 해당 기기에 유지되며, 여러 기기의 변경을 자동 병합하지 않는다. 주기 조회 방식으로 동기화하므로 실시간 푸시가 아니다. 작업 단위 200개, 서명 1MB, 초안 2MB, 기존 계획 기간 30일의 명시적 제한이 있다. 만료된 추천은 초안으로 복원할 수 있지만 저장하려면 새 추천을 받아야 한다. 모델이 스키마를 충족하지 못한 입력은 기존 정책대로 오류로 안내한다.
