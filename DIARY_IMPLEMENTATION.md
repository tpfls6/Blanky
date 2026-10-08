# 다이어리 개선 결과

Blanky의 기존 다이어리를 목록과 작성 영역이 함께 있는 기록형 메모장으로 개선했습니다. 기존 Sidebar, Routing, PageCanvas 및 Theme Provider를 그대로 사용합니다.

## 1. 수정한 파일

- `src/pages/Diary/DiaryPage.tsx`: 기록/즐겨찾기 필터, 검색, 새 기록, 노트형 편집, 날짜·기분·날씨·태그, 즐겨찾기, 삭제 확인, 자동저장과 오류 상태.
- `src/types/records.ts`: 기존 DiaryEntry에 선택적 title, mood, weather, isFavorite 필드 추가. 기존 데이터와 홈 입력 호환.
- `src/state/library.tsx`: 비동기 다이어리 저장/삭제, 초기 서버 조회, 기존 로컬 기록 이전, 계정 변경 검사, 순차 저장 큐, 홈에서 생성한 다이어리 연동.
- `src/state/useLibrary.ts`: commitDiary, eraseDiary, diaryLoading, diaryError 계약 추가.
- `packages/api/src/index.ts`: 다이어리 repository·타입·제목/매핑 함수 export 추가.
- `package.json`: 다이어리 API 테스트를 npm test에 포함하고 test:diary-browser 명령 추가.
- `.gitignore`: 다이어리 테스트 스크린샷 경로 제외.
- `src/services/reading/index.ts`: 작업 중 추가된 독서 서비스의 nullable 도서 생성 결과를 확인하는 가드 한 줄 추가(전체 빌드 오류 해소).

작업 시작 시 이미 수정되어 있던 다른 기능의 변경 사항은 유지했습니다.

## 2. 생성한 파일

- `packages/api/src/diaryRepository.ts`: 기존 recordRepository를 사용하는 다이어리 저장 어댑터.
- `packages/api/src/diary.test.ts`: 빈 데이터·오류·기존 기록 보존·제목·메타데이터·삭제 API 테스트 7개.
- `src/services/diary/index.ts`: 인증 계정 확인, 서버 조회/저장/삭제, 임시 기록 보관, 이미 동기화한 ID 추적.
- `src/pages/Diary/diary.css`: 기존 테마 변수 기반의 목록/편집 화면과 반응형 스타일.
- `scripts/diary-browser-test.mjs`: 별도 계정·브라우저 프로필·로컬 Vite 환경에서 실제 앱을 검증하는 브라우저 테스트.
- `DIARY_IMPLEMENTATION.md`: 이 결과 보고서.

테스트 산출물은 `.tmp/diary-tests/`에 생성됩니다. Light/Dark/Soft Pink 데스크톱 화면과 모바일 목록/편집 화면, results.json이 포함됩니다.

## 3. DB 변경 사항

새 테이블, 컬럼, SQL 마이그레이션은 없습니다. 기존 `custom_record_types`, `custom_records`, 소유자 RLS를 재사용합니다.

Supabase 사용 시 최초 내용 저장 또는 기존 기록 이전 시 계정당 하나의 시스템 다이어리 템플릿을 생성합니다. 템플릿은 description의 `blanky:system:diary:v1`로 식별합니다. 계정 UUID에서 유도한 안정적인 템플릿 UUID로 여러 탭에서 중복 생성되는 것을 방지합니다. 빈 목록 조회와 빈 새 기록은 DB 데이터를 생성하지 않습니다.

기록 제목은 `custom_records.title`, 나머지 데이터는 `values` JSON에 저장합니다. 기존 로컬 기록의 ID와 작성 시각을 보존하며, 서버 기록을 우선 사용합니다. 이미 동기화한 기록 ID는 계정별로 추적해 서버에서 삭제된 기록을 오래된 로컬 캐시가 재생성하지 않도록 합니다.

실제 연결된 Supabase에 스키마 변경이나 테스트 기록 쓰기는 수행하지 않았습니다.

## 4. API 변경 사항

흐름: UI → Library 상태 → src/services/diary → packages/api/diaryRepository → 기존 recordRepository → Supabase.

- getDiaryRecords(userId): 해당 계정의 다이어리 조회.
- saveDiaryRecord(userId, entry): ID를 기준으로 생성 또는 수정. 존재 여부 조회 오류를 생성 요청으로 잘못 처리하지 않습니다.
- deleteDiaryRecord(userId, id): 해당 다이어리 유형임을 확인한 후 삭제.
- commitDiary(entry), eraseDiary(id): UI에서 사용하는 순차 처리 및 캐시 갱신 인터페이스.

UI는 Supabase를 직접 호출하지 않습니다. 저장 완료 상태는 Promise 성공 후 표시하며, 오류가 나면 재시도할 수 있습니다.

## 5. 페이지 및 URL

새 URL은 없습니다. 기존 `/diary`를 개선했습니다. Custom의 기존 다이어리 PageCanvas 미리보기/레이아웃 편집도 유지합니다. Sidebar 및 Routing 변경은 없습니다.

## 6. 기분/날씨 데이터

기분은 happy, good, neutral, sad, angry, tired, excited 문자열 중 선택합니다. 날씨는 sunny, partly-cloudy, cloudy, rain, snow, wind입니다. 각 선택은 취소할 수 있으며, 버튼의 이름과 선택 상태를 접근성 속성으로 제공합니다.

values에는 mood, weather, tags, isFavorite, date, body, manualTitle, createdAt, weatherSource를 저장합니다. 날씨 출처는 현재 manual이며, 추후 API 데이터 필드를 JSON에 확장할 수 있습니다. 직접 입력한 제목이 없으면 본문 첫 문장을 최대 48자로 잘라 목록 및 DB 제목에 사용합니다.

## 7. 자동저장

입력 후 900ms 동안 변화가 없으면 저장합니다. 기분·날씨·태그·즐겨찾기도 동일하게 저장합니다. 한국어 IME 조합 중에는 중간 저장을 피하고 조합 종료 후 저장합니다.

기존 autoSaveAfterClassify 설정은 일정 분류 전용이므로 변경하지 않았습니다. 새 기록은 제목이나 본문이 있을 때 저장합니다. 이미 저장한 기록의 내용은 비울 수 있습니다.

입력 직후 계정별 임시 기록을 localStorage에 보관합니다. 저장 성공 후 제거하며, 새로고침 또는 페이지 이동 후 남아 있는 임시 기록을 복원합니다. 기록 전환은 진행 중인 저장을 기다립니다. 삭제 확인이 열리면 자동저장을 멈추고, 삭제 중 저장이 다시 실행되는 것을 차단합니다.

Supabase 미설정 시 기존 로컬 계정 모드의 계정별 Library 저장을 사용합니다. Supabase 설정 시 서버 응답 이후 목록 및 계정별 캐시를 갱신합니다.

## 8. 즐겨찾기

작성 영역의 별 버튼으로 isFavorite을 변경하고 자동저장합니다. 목록에는 작은 별을 표시하며, 즐겨찾기 필터는 해당 기록만 보여줍니다. 본문/제목/태그 검색과 함께 적용됩니다.

## 9. 반응형

넓은 화면은 목록 1 : 작성 영역 2의 비율이며, 목록 최소 너비는 290px입니다. 900px 이하에서는 목록과 작성 화면을 하나씩 보여주고 목록으로 돌아가는 버튼을 제공합니다. 모바일에서는 가로 넘침 없이 기분/날씨 선택이 줄바꿈됩니다.

배경·표면·텍스트·구분선·포인트·반경은 기존 CSS 테마 변수를 사용합니다.

## 10. 직접 실행한 테스트

- `npm run build`: 다이어리 구현 후 통과했으나, 마지막 재검증에서는 작업 중 새로 생성된 `src/theme/package/ThemeSanitizer.ts`의 문자열/정규식 구문 오류로 실패했습니다.
- `npm test`: 49개 통과(기존 42개 + 다이어리 API 7개).
- 변경한 TypeScript 및 테스트 스크립트의 ESLint: 통과.
- `npm run test:diary-browser`: 실제 Chromium에서 12개 시나리오 통과, JavaScript 예외 0개.

브라우저에서 확인한 내용:

1. 빈 새 기록이 저장되지 않음.
2. 본문 입력으로 기록 생성 및 자동저장.
3. 기분·날씨·즐겨찾기·중복 제거된 태그 저장.
4. 본문 첫 문장으로 자동 제목 표시.
5. 즐겨찾기 탭, 기록 선택 및 본문 수정.
6. 제목/본문 검색 및 검색 결과 없음.
7. 새로고침 후 저장 데이터 유지.
8. 390px 모바일 목록/작성 전환 및 가로 넘침 없음.
9. Appearance 다크 모드 반영.
10. 삭제 확인/취소 및 새로고침 후 삭제 유지.
11. 새로고침 직전 입력 보존 및 중복 생성 없음.
12. Theme Provider의 Soft Pink 표면과 포인트 색상 반영.

브라우저 테스트는 실제 앱의 별도 로컬 모드에서 실행했으며, 실제 Supabase 사용자 계정의 CRUD/RLS 통합 테스트는 실행하지 않았습니다. API 저장 로직은 테스트용 repository 응답으로 검증했습니다.

재실행 명령: `npm run test:diary-browser`. 설치되어 있는 Playwright Chromium 캐시를 사용합니다. 해당 실행 파일이 없으면 DIARY_TEST_CHROMIUM 환경 변수에 설치된 Chromium 실행 파일을 지정합니다. 테스트용 Vite는 기본 5174 포트를 사용하며, 실제 .env는 수정하지 않습니다.

## 11. 아직 구현하지 않은 부분

추후 확장 항목인 월별/태그 전용 탭, 정렬 선택 UI, 자동 날씨 API, AI 기반 제목 생성, 별도 감성 스티커는 구현하지 않았습니다. 현재는 최신순 정렬과 태그 입력/검색을 제공합니다. 여러 기기에서 같은 기록을 동시에 편집할 때의 충돌 병합과 실시간 동기화는 포함하지 않았습니다.

## 12. 발견된 문제 및 한계

프로젝트 전체 `npm run lint`에는 이번 작업에서 수정하지 않은 기존 파일의 오류 9개가 있습니다:

- IconPicker.tsx: effect의 동기 상태 갱신, 렌더 중 컴포넌트 생성(2개).
- Sortable.tsx: 렌더 중 ref 접근(1개).
- CategoryPicker.tsx: effect의 동기 상태 갱신(1개).
- SchedulePage.tsx: 메모이제이션 규칙 및 미사용 변수(5개).

다이어리 구현 시점의 프로덕션 빌드는 통과했으며 500kB를 넘는 번들 경고가 있었습니다. 최종 재검증 시에는 작업 중 추가된 `src/theme/package/ThemeSanitizer.ts` 35·61·63행의 구문 오류가 전체 빌드를 막고 있습니다. 이 테마 패키지 파일은 이번 다이어리 작업에서 수정하지 않았습니다. 전체 린트 오류 목록도 신규 테마/독서 기능 변경 전 확인한 결과입니다. 실제 Supabase의 배포된 스키마/권한 상태와 사용자 인증을 포함한 서버 통합 검증은 남아 있습니다. 초기 서버 조회 실패 시 페이지에서 오류 및 다시 불러오기 버튼을 제공합니다.

## 2026-10-08 오류 수정

실제 로그의 custom_records id=diary-seed 요청(400)을 확인해, 이전 브라우저 문자열 ID를 계정별로 안정적인 UUID에 매핑하도록 수정했습니다. 원래 기록의 본문/작성 시각은 보존하며, 재시도 시 중복 생성하지 않습니다. 저장 성공 후 원본 ID와 새 ID를 동기화 목록에 함께 표시하고 상태의 이전 행도 교체합니다. 삭제도 이전 ID를 받을 수 있습니다. 다이어리 테스트 9개, 변경 코드 ESLint 및 전체 빌드가 통과했습니다.

로그의 themes/user_themes/user_theme_settings 404는 별도 테마 기능의 미적용 스키마 또는 API 캐시 문제입니다. 테마 스토어와 테마 패키지 마이그레이션은 실제 연결 DB에 직접 적용하지 않았습니다.

## 2026-10-08 목록·태그·달력 개선

- 목록의 모든 기록에 독립적인 별 버튼을 추가했습니다. 기록 선택 버튼과 중첩하지 않으며, 선택한 기록의 미저장 본문도 보존하면서 즐겨찾기를 저장합니다.
- 태그 입력란의 강한 사각 포커스 테두리를 둥근 배경과 은은한 포커스 표시로 바꿨습니다. 기분/날씨 선택도 테두리 대신 부드러운 배경으로 표시합니다.
- 헤더 우측 버튼으로 목록/달력 보기를 전환합니다. 월 이동, 오늘, 이 달 전체, 날짜별 필터, 기록이 있는 날짜 표시를 제공합니다. 검색과 즐겨찾기 필터는 달력에도 적용합니다.
- 선택한 달력 날짜에서 새 기록을 만들면 그 날짜로 시작합니다. 모바일은 달력/목록에서 기록을 선택해 작성 화면으로 이동합니다.
- 신규 파일: src/pages/Diary/DiaryCalendar.tsx. 수정: DiaryPage.tsx, diary.css, scripts/diary-browser-test.mjs. DB 및 API 스키마 변경은 없습니다.
- 전체 빌드 및 변경 코드 린트 통과. 실제 Chromium 시나리오 16개 통과(목록 별 버튼, 미저장 수정 보존, 태그 포커스, 월/날짜 조회, 모바일 달력 포함).
