# Calendar 확장 — Phase 1

이번 변경은 Phase 1(도메인, 개인 캘린더, 일정 귀속)에 한정한다.
새 Node 서버 없이 `UI → src/services → packages/api → Supabase`를 유지한다.

## 적용 순서와 데이터 보존

1. DB 백업 후 `20261001160000_personal_calendars.sql`을 기존 마이그레이션 다음에 적용한다.
2. 트랜잭션 안에서 `calendar_id`를 nullable로 추가한다.
3. 기존 auth 사용자 전체에 기본 개인 캘린더를 만들고 기존 일정의 `user_id`로 연결한다.
4. 작성자를 기존 `user_id`로 채우고 누락 여부를 검사한 뒤 `calendar_id NOT NULL`을 적용한다.
5. DB 적용 후 새 클라이언트를 배포한다. 새 응답 mapper는 `calendar_id`를 요구한다.

일정 ID, 제목, 날짜, 시각, 상태, 카테고리, 알림, 기존 이력은 보존한다.
`user_id`는 삭제하지 않는다. 이전 클라이언트의 INSERT는 DB trigger가 개인 캘린더를 자동 지정한다.
UPDATE가 캘린더를 지정하지 않으면 원래 캘린더를 유지한다.
작성자는 DB에서 `auth.uid()`로 정하고 이후 변경을 금지한다.
일정 테이블을 잠그므로 데이터가 많은 환경에서는 유지보수 시간에 적용한다.
실패 시 트랜잭션 전체가 롤백된다. 적용 후에는 컬럼을 제거하는 롤백 대신 이전 클라이언트로 되돌린다.

## Phase 1 권한과 삭제

- 개인 캘린더만 생성 가능하다. `shared`, `external` 타입은 도메인에 예약돼 있지만 클라이언트 생성은 RLS로 막는다.
- 본인의 개인 캘린더와 일정만 조회/생성/수정/삭제할 수 있다.
- 일정과 캘린더의 소유자를 복합 FK로 검증한다. 다른 사람의 캘린더 ID를 전달해도 연결되지 않는다.
- 기본 개인 캘린더의 삭제/기본 여부 변경/소유자 변경을 막는다.
- 추가 개인 캘린더는 비어 있을 때만 삭제 가능하다. 관련 일정을 자동으로 지우지 않는다.
- 개인 계정 삭제는 기존 정책대로 개인 데이터를 함께 삭제한다. 공유 캘린더를 활성화하기 전에 이 정책을 바꿔야 한다.
- 기본 캘린더는 사용자당 하나이며, 회원가입 DB trigger가 생성한다.

## 현재 프런트엔드 저장 경로

현재 Schedule 화면의 `LibraryProvider`는 브라우저 저장소를 사용하며 Supabase 일정 Repository에 연결돼 있지 않다.
기존 브라우저 데이터에도 기본 개인 캘린더와 `calendarId`, 작성자를 추가한다.
이 마이그레이션은 반복 실행해도 같은 캘린더 ID를 유지하고 기존 일정 필드를 보존한다.
Home 캡처와 Schedule 추가 모두 개인 캘린더를 자동 배정한다.

브라우저 캘린더 ID는 `local-personal:<userId>`로 명시적으로 분리한다. 이 ID를 서버로 보내면 안 된다.
서버의 UUID와 브라우저 ID는 아직 동기화하지 않는다. 후속 원격 저장 연결 시 기본 개인 캘린더를 조회해 ID를 치환하고,
브라우저 일정의 UUID/샘플 데이터/카테고리도 검증한 뒤 명시적으로 이관해야 한다.
지금은 브라우저 일정을 서버로 업로드하거나 삭제하지 않는다.

## 다음 단계

- **Phase 2:** `calendar_members`, 이메일 invitation, 로그인 후 수락/거절 RPC와 만료 처리.
  owner/editor/viewer 권한을 `auth.uid()` 기반으로 구현한다. 마지막 owner 제거는 캘린더 행 잠금으로 직렬화한다.
  계정 삭제 전에 공유 소유권 이전을 요구한다. 기존 owner RLS와 복합 FK를 membership 정책으로 교체한다.
  `schedule_changes`, 알림, 개인 카테고리의 공유 노출 범위도 함께 검토한다.
  실제 DB에서 네 역할의 SELECT/INSERT/UPDATE/DELETE와 초대 경쟁 조건을 검증한다.
- **Phase 3:** 원격 일정 저장 연결 및 브라우저 데이터 이관, selector/filter, member UI, 사용자별 기본/숨김 preference,
  viewer 편집 차단, calendar 색상과 작성자 상세 표시. 자연어 캘린더 추천은 사용자 확정 후 적용한다.
- **Phase 4:** 별도 Google OAuth와 Calendar 목록. Edge Function에 provider interface와 Google 구현을 둔다.
  OAuth state를 사용자/만료/일회성 사용에 묶고 토큰은 Vault 또는 서버 암호화로 보관한다.
  구현 시 Google 공식 문서에서 실제 사용할 작업의 최소 scope를 확인한다.
- **Phase 5:** Google → App. integration/calendar/event mapping과 원격 ID unique 제약,
  페이지네이션, 증분 sync token, 삭제 이벤트, 재시도, 반복 일정, 수동/시간 경과 동기화를 구현한다.
  disconnect 시 가져온 앱 일정은 보존하고 원격 연결과 credential을 제거한다.
- **Phase 6:** App → Google. 재시도에도 중복이 생기지 않는 외부 ID와 작업 큐를 구현한다.
- **Phase 7:** Two Way. 양쪽 수정 버전과 마지막 동기화 시점을 저장하고 동시 변경은 conflict로 보존한다.
  단순 타임스탬프 비교로 사용자의 수정을 덮어쓰지 않는다.

현재 날짜+시각 필드는 기존 동작을 보존한다. timezone은 Calendar에 추가했지만 기존 시간을 임의로 UTC로 변환하지 않는다.
Google 단계 전에 all-day/date-only와 시간 있는 일정을 구분하고 timezone에 근거한 `timestamptz` 이관을 별도로 검증한다.

## 검증

```sh
npm test
npm run build
supabase start
supabase test db supabase/tests/personal_calendars.sql
```

DB 테스트는 테스트 트랜잭션을 롤백한다. 회원가입 자동 생성, 이전 클라이언트 저장,
작성자, 소유자 CRUD, 타 사용자 접근, 기본 캘린더 보호, 계정 삭제를 검증한다.
공유/Google 시나리오는 해당 Phase에서 추가한다.

2026-10-01 검증 결과: Node 테스트 20개, 프로덕션 빌드, packages 타입 검사,
변경한 구현 파일의 ESLint는 통과했다. 전체 lint는 기존 파일 오류 10개로 실패했다.
실제 DB 테스트는 미실행 상태다. 로컬 Supabase 컨테이너가 없어서 시작을 시도했으나
Docker 이미지 다운로드에서 timeout/지연이 발생했고 PostgreSQL만 시작하는 재시도도 완료되지 않았다.
운영 DB에는 적용하지 않았다. DB 마이그레이션과 pgTAP 검증을 완료한 뒤 배포해야 한다.
