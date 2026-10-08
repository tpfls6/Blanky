# Blanky 커스텀 테마 MVP 구현 보고서

## 1. 생성한 파일
- packages/types/src/theme.ts: 공유 ThemeConfig/BlankyTheme, 입력 정규화, 기본 테마 4종.
- packages/api/src/themeRepository.ts: Supabase 데이터 접근.
- packages/api/src/theme.test.ts: 설정 안전성, 기본 테마, 저장 payload/RPC 테스트.
- src/services/themes/index.ts: UI 서비스, Supabase/사용자별 로컬 모드.
- src/theme/context.ts: useTheme 및 상태 계약.
- src/theme/variables.ts: 검증된 ThemeConfig를 CSS 변수로 변환.
- src/theme/ThemeProvider.tsx: 사용자별 현재 테마와 임시 미리보기 상태.
- src/pages/Themes/ThemePages.tsx: 스토어, 상세, 제작, 내 테마, Creator, 미리보기 배너.
- supabase/migrations/20261007150000_theme_store.sql: 테이블/RLS/무료 설치 함수/기본 테마 seed.
- supabase/tests/theme_store.sql: 17개 RLS 및 권한/설치 테스트 SQL.
- scripts/theme-smoke.mjs: 실제 서비스 실행과 5개 React 페이지 서버 렌더 검사.
- THEME_IMPLEMENTATION.md: 이 보고서.

## 2. 수정한 파일
- packages/types/src/index.ts, packages/api/src/index.ts: 공개 export.
- packages/api/src/database.generated.ts: 신규 테이블과 RPC의 체크인 타입 확장.
- src/App.tsx: 로그인 보호 아래 ThemeProvider 및 신규 라우트.
- src/constants/routes.ts, src/constants/navigation.ts: 경로와 메뉴.
- src/components/layout/Sidebar.tsx, MobileNav.tsx: 스토어/내 테마 진입점.
- src/components/layout/AppLayout.tsx: 임시 미리보기 배너.
- src/components/schedule/MiniCalendar.tsx: 캘린더 배경/평일/주말/선택/오늘/hover 토큰.
- src/components/schedule/WorkCard.tsx: 일반 카드 스타일 토큰.
- src/pages/Schedule/SchedulePage.tsx: 일정/할 일 스타일, 카테고리 색상 유지.
- src/pages/Settings/SettingsPage.tsx: 기존 Appearance와 테마 설정 우선순위 안내.
- src/styles/index.css: 범위가 지정된 테마 CSS 및 반응형 스토어/제작기.
- package.json: theme 단위 테스트 및 test:themes 스크립트.

작업 시작 전에 이미 있던 수정 사항은 유지했다. 로그인, 자연어 파서, 일정 CRUD, 기존 사용자 설정 데이터 형태는 교체하지 않았다.

## 3. 추가한 DB 테이블
| 테이블 | 역할 |
| --- | --- |
| themes | 제작자, 공개 여부, 무료/유료, 가격, theme_config JSONB, 다운로드/평점 메타데이터 |
| user_themes | 보유 테마; 사용자/테마 복합 기본키로 중복 설치 방지 |
| user_theme_settings | 사용자별 현재 테마 ID; 기존 user_preferences와 분리 |
| theme_reviews | 추후 리뷰 확장용; 현재 클라이언트 쓰기 정책 없음 |

RLS는 공개 테마를 authenticated 사용자에게만 공개하고 private 테마는 제작자에게만 허용한다. 수정/삭제는 제작자만 허용하고 creator_id가 NULL인 기본 테마는 일반 클라이언트가 수정/삭제할 수 없다. user_themes와 현재 설정은 자기 데이터만 접근한다. 가격/공개 여부는 무료 설치 RPC에서 검증하고, 소유권 없는 유료 테마 활성화 및 purchase 행 직접 삽입을 차단한다. 다운로드/평점 카운터는 제작자가 임의 변경할 수 없다. 테마 삭제 시 FK가 현재 설정을 비우고, 설치 제거 시 trigger가 해당 현재 설정을 비운다.

## 4. 추가한 migration
supabase/migrations/20261007150000_theme_store.sql

기존 migration 다음에 한 번 실행한다. Blanky Default, Soft Pink, Ocean Blue, Dark 4개를 고정 UUID로 seed한다. 기존 테이블을 변경하지 않는다.

## 5. 추가한 API
createThemeRepository(client)의 메서드:
- getThemes(), getThemeById(id), getMyThemes(userId)
- saveTheme(theme): 생성/수정을 통합한 upsert
- deleteTheme(id), uninstallTheme(userId, id)
- installTheme(id): public.install_theme(p_theme_id) RPC
- getActiveTheme(userId), setActiveTheme(userId, id | null)

화면은 src/services/themes만 호출하고, 실제 Supabase 접근은 packages/api/themeRepository를 통해 진행한다. src/services/themes는 loadThemes, saveTheme, installTheme, setActiveTheme, removeTheme을 제공한다. 실제 결제 없이 유료 설치/구매는 안내 오류를 반환한다. Service Role Key를 추가하거나 사용하지 않았다.

## 6. 추가한 화면 및 URL
| URL | 화면 |
| --- | --- |
| /store | 검색, 추천/인기/신규/무료/유료, 이미지 중심 목록 |
| /store/themes/:themeId | 상세 정보, 대표 이미지, 미리보기, 무료 설치/적용, 유료 안내 |
| /customize/theme | 색상/캘린더/일정/할 일/카드/사이드바/폰트/아이콘 제작 |
| /customize/theme?id=:themeId | 본인이 만든 테마 수정 |
| /customize/theme?id=:themeId&publish=1 | 스토어 등록 폼 |
| /settings/themes | 사용 중/설치한/내가 만든 테마, 기존 Appearance 설정 복귀 |
| /creator/:userId | 제작자 이름/프로필 표식, 등록 테마/다운로드/평점 집계 |
| /creator/blanky | 기본 제공 테마 제작자 페이지 |

테마/템플릿은 별도 개념이다. 스토어의 템플릿 표시는 준비 중이며 기존 페이지 구조 편집 기능을 테마에 섞지 않는다. 등록 폼은 이름, 설명, HTTPS 대표 이미지 URL, 카테고리, 쉼표로 구분한 태그, 공개 여부, 무료/유료, 가격을 지원한다. 무료 가격은 0이고 유료 가격은 양의 정수다.

## 7. Theme 적용 방식
SessionProvider → LibraryProvider → ThemeProvider → 앱 화면.

현재 사용자 ID가 바뀌면 ThemeProvider를 다시 생성해 이전 사용자의 테마/미리보기를 분리한다. 저장된 active theme을 읽어 하나의 Theme 객체에서 CSS 변수를 생성하고 앱 wrapper에 적용한다. 기존 --bg/--surface/--fg/--line/--accent-color와 새로운 --blanky-* 변수를 연결한다. 페이지 새로고침 없이 state 변경으로 즉시 반영된다.

적용한 테마가 없으면 기존 light/dark/system 및 accent 설정을 사용한다. 내 테마에서 “기존 Appearance 설정 사용”을 누르면 active theme을 NULL로 지워 기존 설정으로 복귀한다.

제작기 미리보기는 자체 wrapper에만 변수를 적용한다. 스토어의 “내 일정으로 미리보기”는 저장 없이 preview state만 바꾸고 /schedule로 이동한다. 종료는 기존 테마로 돌아간다. 미리보기 배너의 적용하기만 보유/무료 설치 확인 후 현재 설정을 저장한다. 유료 미보유 테마는 적용하지 않는다.

카테고리 자체 색상을 변경하지 않고 일정의 왼쪽 색상 표시와 기존 아이콘/표식을 유지한다. 폰트는 system-ui/sans-serif/serif/monospace의 안전한 시스템 스택만 허용한다. 아이콘은 기존 Lucide 자산에 default/rounded/outline/filled 스타일을 적용한다. 임의 CSS, URL 배경, 임의 폰트/그림자는 정규화 단계에서 차단한다.

## 8. Supabase에서 별도로 실행할 작업
1. 연결된 프로젝트에 기존 migration이 모두 적용되어 있는지 확인한다.
2. Supabase CLI 환경에서 supabase db push를 실행하거나 새 migration SQL을 SQL Editor에서 실행한다.
3. 적용 후 npm run db:types로 실제 스키마 타입을 재생성할 수 있다(기존 스크립트는 로컬 DB 기준).
4. 로컬 Supabase 및 pgTAP 환경에서 supabase test db을 실행한다.
5. 서로 다른 두 계정으로 공개/비공개 조회, 작성자 수정 제한, 무료 설치, 유료 차단, 현재 테마 저장을 브라우저에서 확인한다.

이 작업에서는 원격 DB migration을 실행하지 않았다. 이 환경에 Supabase CLI와 Docker가 없어 DB 및 RLS SQL의 실제 실행 검증을 수행하지 못했다. 원격 데이터 또는 production 설정을 변경하지 않았다.

## 9. 환경 변수
추가할 변수는 없다. 기존 VITE_SUPABASE_URL 및 VITE_SUPABASE_ANON_KEY를 사용한다. Supabase 미설정 모드에서는 기존 앱처럼 사용자별 로컬 저장을 사용하며, 사용자 간 실제 공유/판매에는 Supabase 설정과 migration 적용이 필요하다.

## 10. 아직 구현하지 않은 확장 기능
실제 PG 결제, 구매 영수증 검증, 판매자 정산/수수료, 리뷰 작성/집계, 팔로우, 신고, 환불, 템플릿 스토어, 대표 이미지 파일 업로드, 전용 아이콘 파일팩/외부 웹폰트, 추천 알고리즘, 대규모 스토어 서버 페이지네이션은 미구현이다. 현재 대표 이미지는 HTTPS URL로 등록한다. 추천은 기본 테마 우선 정렬이며 인기는 다운로드 수, 신규는 제작일을 사용한다.

## 11. 직접 테스트한 기능
- npm run build: TypeScript 및 Vite 프로덕션 빌드 통과.
- npm run test: 기존 39개 + 신규 테마 3개 = 총 42개 통과.
- npm run test:themes: 사용자별 로컬 데이터 분리, 생성/저장/삭제, 현재 테마 영속화, 비소유 테마 적용 차단, 무료 중복 설치 방지, 유료 설치 차단, 기본 테마 삭제 차단, 미리보기 변수 생성 시 저장 상태 유지 검증 통과.
- 신규 5개 페이지의 실제 React 서버 렌더 실행 통과(스토어/상세/제작기/내 테마/Creator).
- 신규 테마 소스 및 테스트의 ESLint 검사 통과.
- Vite 개발 서버를 실제 실행하고 http://127.0.0.1:5173 응답 확인.

## 12. 발견된 오류 및 주의사항
- 이 세션에 사용 가능한 브라우저가 없어 화면 배치, 실제 클릭, 로그인 및 Supabase 저장 흐름의 브라우저 E2E 검증은 수행하지 못했다. React 서버 렌더와 서비스 검증은 시각적 검증을 대체하지 않는다.
- 신규 migration을 실행하기 전 Supabase 모드의 테마 저장/설치/적용은 작동하지 않는다. 오류를 숨기거나 로컬 저장 성공으로 위장하지 않는다.
- npm run lint는 기존 파일의 11개 오류 때문에 실패한다: IconPicker.tsx(2), Sortable.tsx(1), CategoryPicker.tsx(1), SchedulePage.tsx(5), Settings/bits.tsx(1), state/library.tsx(1). 주로 React hooks/기존 미사용 변수 규칙이며 신규 테마 파일에는 오류가 없다.
- Vite가 500 kB 이상 청크 경고를 출력한다. 빌드는 성공하지만 추후 라우트별 코드 분할이 필요할 수 있다.
- 비공개로 전환한 테마는 요구된 private 정책에 따라 제작자 외에는 조회되지 않는다. 기존 설치자도 해당 디자인을 읽을 수 없고 기존 Appearance로 돌아간다. 이미 배포한 버전을 보유자에게 계속 제공하려면 향후 별도 버전/권한 모델이 필요하다.
- 테마/원본 삭제에는 복구함이 없다. UI에서 확인 후 삭제하고 기본 테마는 삭제 버튼을 제공하지 않는다.

## Theme Package 확장

기존 MVP 위에 추가한 패키지 엔진·Import/Export·보안·Storage·테스트의 상세 보고서는 [THEME_PACKAGE_IMPLEMENTATION.md](THEME_PACKAGE_IMPLEMENTATION.md)를 참고한다.
