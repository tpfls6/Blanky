# Theme Package Engine 구현 보고서

2026-10-08 기준. 기존 Theme MVP 위에 패키지 계층을 추가했다. 원격 Supabase에 migration을 실행하지 않았다.

## 1. 유지한 기존 MVP 구조

기존 ThemeConfig, normalizeThemeConfig, themeVariables, ThemeProvider/ThemeContext, 사용자별 active/preview 상태, 기본 테마 4종의 고정 ID를 유지했다. themes / user_themes / user_theme_settings / theme_reviews 및 install_theme RPC를 재사용한다. 생성·저장·적용·임시 미리보기·스토어·무료 설치·내 테마·제작자 페이지의 기존 경로와 기능을 유지했다. 기존 theme_config는 계속 독립적인 Config Theme으로 사용할 수 있다.

## 2. 추가한 Theme Package 구조

BlankyTheme에 선택적인 themeType, package, packageUrl, installedVersion 필드를 추가했다. package가 없으면 기존 config로 적용한다.

~~~text
my-theme.blanky-theme (ZIP)
├ manifest.json
├ theme.json              # 기존 ThemeConfig
├ style.css               # 제한된 슬롯 CSS
├ assets/                 # 이미지, SVG 아이콘, WOFF2 폰트
└ preview/                # 사용자가 업로드한 미리보기 이미지
~~~

내부 ThemePackage는 manifest / config / customCss / files로 구성한다. 로컬 파일은 검증된 MIME과 base64 데이터, 서버 파일은 검증된 MIME과 Storage 객체 경로를 가진다. 파일 데이터는 테마 설정 JSON과 분리하여 IndexedDB 또는 Storage에 보관한다.

## 3. 생성한 파일

- packages/types/src/themePackage.ts
- src/theme/package/limits.ts
- src/theme/package/zip.ts
- src/theme/package/ThemeLoader.ts
- src/theme/package/ThemeValidator.ts
- src/theme/package/ThemeSanitizer.ts
- src/theme/package/ThemeAssetResolver.ts
- src/theme/package/ThemeRuntime.tsx
- src/theme/package/runtimeCss.ts
- src/theme/package/runtimeContext.ts
- src/theme/package/features.ts
- src/theme/ThemeIcon.tsx
- src/services/themes/localPackages.ts
- src/services/themes/packageStorage.ts
- src/pages/Themes/PackageControls.tsx
- tests/themePackage.test.ts
- tests/themeRepositoryPackage.test.ts
- scripts/theme-package-browser-test.mjs
- docs/theme-package-manifest.schema.json
- supabase/migrations/20261007170000_theme_packages.sql
- supabase/tests/theme_packages.sql
- THEME_PACKAGE_IMPLEMENTATION.md

실행 결과와 화면 캡처는 .tmp/theme-package-tests/에 기록한다. 이 폴더의 다운로드 파일은 브라우저 검증 과정에서 생성한 파일이다.

## 4. 수정한 파일

- packages/types/src/theme.ts, index.ts: 기존 타입에 선택적 패키지 필드 추가 및 export.
- packages/api/src/themeRepository.ts, database.generated.ts: 패키지 데이터 읽기·쓰기, basic 초기화 시 이전 패키지 필드 제거.
- src/theme/ThemeProvider.tsx: 기존 상태를 유지하며 ThemeRuntime을 추가. Import 미리보기에서 적용하면 먼저 개인 사본을 저장.
- src/services/themes/index.ts: 검증·업로드·IndexedDB 저장·삭제 연결.
- src/pages/Themes/ThemePages.tsx: 패키지 제작, 가져오기, 내보내기, 상세 포함 요소, 타입 구분.
- src/components/layout/Sidebar.tsx, MobileNav.tsx, AppLayout.tsx: 메뉴 아이콘 fallback, sidebar/page 슬롯, 앱 배경 표시.
- src/components/schedule/MiniCalendar.tsx, WorkCard.tsx, CategoryPicker.tsx: 캘린더·카드·공유 입력 슬롯.
- src/components/tasks/TaskCheckbox.tsx: 체크박스 이미지 슬롯.
- src/components/common/EmptyState.tsx, TextField.tsx, InlineName.tsx, IconPicker.tsx, ConfirmDialog.tsx: 빈 화면·입력·버튼·모달 슬롯.
- src/pages/Schedule/SchedulePage.tsx: 일정·할 일 카드, 제목·시간·입력·버튼 슬롯 및 주요 액션 아이콘.
- src/pages/Diary/DiaryPage.tsx: 다이어리 페이지·목록·기록 슬롯, 검색·추가·즐겨찾기·삭제 아이콘.
- src/pages/Home/HomePage.tsx, Memo/MemoPage.tsx: 공통 카드·입력·버튼 슬롯과 주요 아이콘.
- src/pages/Reading/ReadingPage.tsx: 빌드에서 발견한 union 속성 두 곳의 number/string 타입 검사를 보완. 읽기 기능을 변경하지 않았다.
- src/styles/index.css: 패키지 배경, 업로드 UI, CSS 편집기, Import 리뷰, 오른쪽 sticky 미리보기.
- scripts/theme-smoke.mjs: ConfirmProvider 테스트 환경 보완 및 패키지 저장·공유·스토어 설치 회귀 검증.
- package.json: 신규 테스트 명령 추가. ZIP 관련 외부 의존성을 추가하지 않았다.
- THEME_IMPLEMENTATION.md: 이 추가 보고서 링크.

작업 전에 존재한 다른 기능의 수정 사항은 유지했다.

## 5. Theme Runtime 구조

~~~text
파일 / 기존 테마 객체
→ ThemeLoader (ZIP, manifest, config, stylesheet)
→ ThemeValidator (형식·참조·크기·파일 내용)
→ ThemeSanitizer (SVG / CSS)
→ Storage hydrate / ThemeAssetResolver
→ 이미지 디코딩 확인
→ ThemeRuntime
  ├ 기존 CSS Variables
  ├ 슬롯 asset 스타일
  ├ Icon Context + 기본 아이콘 fallback
  └ 범위를 지정한 Custom CSS / font-face
~~~

패키지 처리 오류는 Blanky Default 스타일로 복구하고 앱 Provider에 안내를 전달한다. 적용된 DB active ID를 미리보기나 오류 복구 과정에서 변경하지 않는다. 오류 상태의 테마를 지우거나 기본 테마를 적용할 수 있는 메뉴는 유지한다.

## 6. Theme Slot 목록

~~~text
app
sidebar / sidebar-item / sidebar-icon
page / page-header
calendar / calendar-header / calendar-day / calendar-today / calendar-selected
schedule-card / schedule-time / schedule-title
task-card / task-checkbox
diary-page / diary-list / diary-entry
card
button / button-primary / button-secondary
input / modal / empty-state
~~~

지원 목록은 THEME_SLOTS에서 관리한다. Runtime은 테마마다 data-theme-scope를 만들고 중첩 미리보기 영역을 제외한다. 테마 제작·가져오기·복구 버튼 영역은 data-theme-protected로 Custom CSS 적용에서 제외한다. 기존 컴포넌트 클래스 변경에 의존하지 않는다.

## 7. manifest schema

문서용 JSON Schema: docs/theme-package-manifest.schema.json. 실제 검증은 ThemeValidator.validateManifest가 수행하며 경로·참조·내용을 추가 검사한다.

~~~json
{
  "formatVersion": 1,
  "id": "cherry-blossom",
  "name": "Cherry Blossom",
  "description": "Soft pink diary theme",
  "author": "serin",
  "version": "1.0.0",
  "entry": { "theme": "theme.json", "stylesheet": "style.css" },
  "assets": {
    "background": "assets/background.png",
    "sidebar": "assets/sidebar.svg",
    "calendarBackground": "assets/calendar.png",
    "scheduleBackground": "assets/schedule.png",
    "checkbox": "assets/checkbox.svg"
  },
  "iconPack": { "home": "assets/icons/home.svg" },
  "previews": ["preview/preview-1.png"],
  "fonts": { "body": "assets/body.woff2", "heading": "assets/heading.woff2" }
}
~~~

formatVersion은 현재 1만 지원한다. version은 숫자 세 부분과 선택적인 prerelease 형식이다. theme entry는 JSON, stylesheet는 CSS여야 한다. manifest.json을 theme entry로 지정할 수 없다. CSS를 추가한 패키지에 stylesheet entry가 없으면 style.css를 설정해 Export 시 누락을 방지한다. 기존 ThemeConfig 필드로 색상·카드·폰트를 설정하고, 이미지 연결은 manifest mapping, 추가 장식은 슬롯 CSS로 설정한다. 요청 예시의 별도 background.asset 같은 확장 필드에 의존하지 않는다.

## 8. Asset 처리

지원 mapping: background, sidebar, pageBackground, calendarBackground, scheduleBackground, taskBackground, checkbox, buttonBackground, emptyState, diaryBackground, pattern. CSS용 추가 asset 이름도 manifest에 정의할 수 있다.

PNG/JPEG/WebP의 실제 파일 시그니처·크기·이미지 치수를 확인한다. SVG는 제한된 문법으로 검증한다. 파일은 assets/ 또는 preview/ 아래에 있어야 한다. 이미지 최대 5MB, SVG/아이콘 최대 500KB, 폰트 최대 2MB, 이미지 최대 32메가픽셀이다. 브라우저 Runtime은 이미지 디코딩 성공도 확인한다.

asset://name은 외부 주소로 취급하지 않는다. 검증된 패키지 파일을 Blob으로 만들어 Object URL에 연결한다. Storage 파일도 지정된 theme-assets 버킷에서 인증 다운로드 후 재검증하여 Object URL로 사용한다. 외부 URL을 manifest asset으로 저장할 수 없다.

## 9. Icon Pack

home / today / calendar / task / diary / memo / store / custom / settings / search / add / favorite / delete / edit을 지원한다. 메뉴와 주요 일정·다이어리 액션에 ThemeIcon을 연결했다. schedule 메뉴는 calendar로 매핑한다. 해당 키가 없거나 이미지 표시가 실패하면 원래 Lucide 컴포넌트를 보여준다. 카테고리 고유 표식은 유지한다. 사용자 SVG는 img로 표시하며 HTML에 삽입하지 않는다.

## 10. Custom CSS 처리

제작기에 기본 편집 / 고급 편집을 추가했다. CSS 초안은 실시간 미리보기에 전달하고, 검증 오류를 표시하며 잘못된 CSS는 저장·Export할 수 없다. 허용 선택자는 목록에 있는 단일 [data-theme-slot="..."]뿐이다. CSS 적용 전 다시 검증하고 Runtime 범위를 붙인다.

~~~css
[data-theme-slot="schedule-card"] {
  border-radius: 20px;
  backdrop-filter: blur(12px);
}
[data-theme-slot="sidebar"] {
  background-image: url("asset://sidebar");
}
~~~

## 11. CSS 보안

속성 whitelist와 값 whitelist를 모두 검사한다. 배경·색·테두리·그림자·폰트·여백·일부 작은 transform·backdrop-filter를 지원한다. 숫자 값도 제한한다: 여백/모서리 최대 32px, 테두리 최대 4px, 폰트 12~32px, opacity 최소 0.65, line-height 1~2.

전체/HTML/body 선택자, 조합 선택자, pseudo 선택자, @import 및 기타 at-rule, CSS escape/주석, !important, 외부 URL, data URL, javascript URL, var/attr/expression/image-set 등을 거부한다. position/z-index/display/visibility/pointer-events를 허용하지 않는다. 텍스트 color:transparent를 차단하고 filter는 none만 허용한다. app/page/sidebar/modal의 opacity 변경이나 transform을 차단하여 복구 UI가 흐려지거나 이동하는 것을 막는다.

테마 파일의 사용자 JavaScript는 실행하지 않는다. 실행 파일·스크립트·HTML을 import하지 않으며 eval/Function/테마 이벤트 핸들러를 사용하지 않는다. 테마가 인증·일정·메모 데이터를 읽는 API를 제공하지 않는다.

## 12. SVG 보안

svg/g/path/rect/circle/ellipse/line/polyline/polygon, 제한된 defs/gradient/clipPath 및 title/desc만 지원한다. 속성도 allowlist로 검사한다. script/foreignObject/style/image/use, 이벤트 속성, href, 외부 URL, XML 엔티티/DOCTYPE, 잘못된 닫힘 태그, 중첩 svg 등을 거부한다. 내부 gradient 참조 url(#id)만 허용한다. 검증된 SVG를 재직렬화하고 Blob 이미지로 표시한다. 위험한 파일을 부분적으로 유지하지 않는다.

## 13. Import 방식

내 테마의 '테마 가져오기'에서 .blanky-theme만 선택할 수 있다. 압축/비압축 ZIP 파일을 메모리에서 읽고 디스크에 해제하지 않는다. 총 패키지·압축 해제 합계 최대 20MB, 파일 최대 128개를 검사한다. STORE와 DEFLATE를 지원한다. ZIP64/분할/암호화 ZIP은 지원하지 않는다.

경로 traversal/절대 경로/백슬래시/빈 경로 부분/대소문자 중복을 거부한다. 헤더·중앙 목록·파일 범위·CRC32와 실제 압축 해제 크기를 확인한다. JSON은 파일당 최대 256KB, CSS는 최대 100KB다. 허용 파일 내용과 확장자가 일치해야 한다.

검사 후 이름·원저자·버전·포함 요소·실제 미리보기를 보여준다. 설치하면 새 UUID의 개인 비공개 사본으로 저장한다. 원저자 표시는 유지하되 소유권은 가져온 사용자에게 부여한다. 설치 전에는 active theme을 변경하지 않는다. 취소 시 임시 미리보기를 종료한다.

## 14. Export 방식

제작기, 본인이 만든 테마, 보유한 상세 테마에서 '테마 파일로 내보내기'를 제공한다. Storage 파일은 인증 다운로드·재검증 후 포함한다. manifest.json / theme config / style.css / assets / 업로드한 preview를 ZIP STORE 방식으로 작성하고 확장자는 .blanky-theme으로 다운로드한다. 생성한 다운로드 Object URL은 바로 정리한다.

저장 전 변경한 이름·설명·config도 반영한다. 원저자와 버전은 유지한다. stylesheet entry가 없는 패키지에 CSS를 추가해도 Export → Import에서 보존된다. 패키지 크기가 제한을 넘으면 내보내기를 거부한다.

## 15. DB 변경

themes에 theme_type(default basic), format_version(default 1), package_version(default 1.0.0), manifest, custom_css, theme_package, package_url, preview_images를 추가한다. theme_config 및 기존 가격·카운터·소유권 필드는 유지한다. package JSON의 shape/manifest/version/CSS 일치와 metadata 크기를 DB constraint로 검사한다. 클라이언트의 세부 SVG/CSS 검증은 Runtime에서도 수행한다.

user_themes에 installed_package_version을 추가한다. 기존 설치 RPC를 바꾸지 않고 insert trigger가 설치 시 버전을 기록한다. 기존 설치 행은 현재 package_version으로 채운다. 설치한 테마는 이후 비공개 전환되어도 설치자에게 읽기 권한을 유지한다.

## 16. Storage 변경

theme-assets / theme-previews / theme-packages를 없을 때만 만든다. 전부 private다. 파일 크기와 MIME을 제한한다. 기존 같은 이름의 버킷은 덮어쓰지 않는다.

경로: uploader UUID / theme UUID / version-revision UUID / asset 또는 package 파일. 인증 사용자만 접근하며 업로드는 자신의 prefix에만 가능하다. 다른 제작자의 테마 prefix로 업로드할 수 없다. 공개 테마의 asset/preview는 설치 전 미리보기를 위해 읽을 수 있다. 유료 원본 패키지 archive 다운로드에는 소유권이 필요하다. 실제 유료 구매는 기존처럼 준비 중이다.

객체 update 정책을 제공하지 않아 업로드한 경로를 덮어쓸 수 없다. 실패한 업로드는 현재 테마가 참조하지 않는 자기 revision만 rollback한다. 사용자가 설치 제거할 때 제작자의 원본 파일은 삭제하지 않는다. 서버에서 회수할 이전 revision은 별도 관리 대상이다.

## 17. Migration 위치

supabase/migrations/20261007170000_theme_packages.sql

기존 20261007150000_theme_store.sql 다음에 적용한다. 테스트는 supabase/tests/theme_packages.sql의 pgTAP 17개다. 이 환경에서는 SQL을 실행하지 않았다.

## 18. 스토어 변경

목록에 Config/Package 타입을 표시한다. 상세에 이미지·아이콘·CSS·폰트·일정·캘린더 등 포함 요소 및 패키지 버전을 표시한다. 기존 무료 설치와 적용 버튼을 유지한다. 제작기 저장은 패키지/asset/preview 업로드 후 기존 저장 repository에 metadata를 보낸다. 업로드 또는 저장 실패를 성공으로 처리하지 않는다. 보유 테마의 파일 내보내기를 지원한다.

## 19. 신규 테스트

- tests/themePackage.test.ts: 22개. 기본 4종 호환, 패키지/아이콘, CSS/SVG 공격, manifest/version/asset 오류, 파일 타입·크기, traversal/중복/CRC, DEFLATE/압축 폭탄, 이미지 치수, asset 캐시·버전·해제, Export/Import, CSS entry 보완, 저장 전 metadata 반영.
- tests/themeRepositoryPackage.test.ts: 1개. 스토어 package payload/읽기, 기존 설치 RPC/활성화, basic으로 초기화 시 package metadata 제거.
- scripts/theme-smoke.mjs: 사용자별 패키지 영속화, 공개 패키지 설치, 다른 사용자 공유, 제거 후 원본 보존, 기존 5페이지 렌더.
- scripts/theme-package-browser-test.mjs: 실제 Vite/Chromium/독립 계정/임시 프로필에서 11개 시나리오.
- supabase/tests/theme_packages.sql: 스키마, private bucket, 버전, 권한, 유료 archive, 설치자 읽기, immutable asset, 원본 보존 17개. 작성했으며 실행하지 못했다.

## 20. 테스트 결과

| 검사 | 결과 |
| --- | --- |
| npm run build | TypeScript + Vite 성공 |
| npm test | 총 79개 통과, 실패 0 |
| 신규 단위 테스트 | 23개 통과 |
| npm run test:themes | 기존 5페이지 렌더 및 서비스/패키지 회귀 통과 |
| npm run test:theme-package-browser | 실제 브라우저 11개 통과, JS 오류 0 |
| npm run test:diary-browser | 기존 다이어리 12개 통과, JS 오류 0 |
| 테마 엔진/서비스/UI/타입/repository/신규 테스트 ESLint | 통과 |
| npm run lint | 기존 파일 오류 9개로 실패, 아래 24번 참고 |
| Supabase/Storage SQL 실실행 | 미실행: CLI 및 Docker 없음 |

## 21. 기존 기능 회귀

기본 테마 4종, legacy config 변환, 기본 테마 삭제 차단, 가격/카운터 보호, 무료 중복 설치, 비소유 적용 차단, 사용자별 분리, 저장·적용·삭제·Creator 렌더를 검사했다. 기존 다이어리 저장·수정·검색·즐겨찾기·삭제·새로고침·모바일·Dark·Soft Pink도 실제 브라우저에서 통과했다.

패키지 브라우저 검사는 다음을 확인한다: 기존 Soft Pink 적용, 제작 이미지/SVG/체크박스/CSS 실시간 미리보기, 위험 CSS 저장 차단, IndexedDB 저장, 실제 일정 화면 적용 및 새로고침, 임시 Dark preview 종료 후 패키지 복구, 실제 파일 다운로드, 다른 계정 Import/설치/동일 적용, 모바일 overflow 없음, 삭제 후 Object URL 해제와 원본 보존, asset 누락 시 Default 복구 및 메뉴 유지.

화면 캡처도 확인했다. .tmp/theme-package-tests/editor-package.png, schedule-package.png, import-review.png, mobile-library.png, corrupt-package-fallback.png에 결과가 있다.

## 22. Supabase에서 직접 적용할 작업

1. 연결된 프로젝트에 기존 theme_store migration이 적용되어 있는지 확인한다.
2. 새 migration을 Supabase SQL Editor에서 한 번 실행하거나, 연결된 CLI 환경에서 supabase db push로 적용한다.
3. 기존에 같은 이름의 bucket이 있었다면 private/MIME/크기 설정이 요구사항과 맞는지 확인한다. migration은 기존 bucket 설정을 덮어쓰지 않는다.
4. 로컬 Supabase를 갖춘 환경에서 supabase test db로 기존 theme_store와 신규 theme_packages pgTAP을 실행한다.
5. 두 실제 계정으로 공개/비공개 package 업로드, 다른 계정 미리보기·무료 설치·적용, 유료 archive 차단, 설치 제거 후 원본 보존을 확인한다.
6. 필요하면 실제 적용된 DB 기준으로 타입을 재생성한다. 기존 npm run db:types는 로컬 DB 대상이다.

새 환경 변수나 Service Role Key는 추가하지 않았다. 기존 Supabase URL/Anon Key를 사용한다. 원격 DB/Storage 저장 E2E와 RLS 검증은 로컬 모드 브라우저 성공만으로 검증됐다고 볼 수 없다.

## 23. 미구현 또는 의도적인 제한

- 스토어 새 버전 감지/업데이트 버튼/버전 선택 및 설치 버전 snapshot 고정은 미구현이다. 데이터/manifest/캐시가 버전을 인식한다. 현재 스토어 테마 수정은 최신 row를 읽어 반영한다.
- 이전 Storage revision의 자동 GC·회수 작업은 미구현이다. 설치 제거가 제작자 원본을 지우지 않게 보존한다.
- 미리보기 스크린샷 자동 생성은 미구현이다. 패키지 preview에는 사용자가 업로드한 이미지가 포함된다. 설치 전 실제 UI 미리보기는 구현했다.
- 임의 전체 CSS/레이아웃 편집/애니메이션 at-rule/외부 웹폰트/JavaScript/HTML은 지원하지 않는다. 폰트는 시스템 스택과 패키지 WOFF2다.
- 모든 Lucide 사용처를 교체하지 않았다. 주요 메뉴와 일정·다이어리의 지원 액션은 교체하며, 지원하지 않은 위치는 원래 아이콘을 유지한다.
- actual payment, 리뷰·판매자 정산 등 기존 MVP의 별도 미래 기능은 추가하지 않았다.

## 24. 발견한 문제 및 검증 한계

- 첨부 요청의 테스트 42개보다 현재 작업 트리의 테스트가 늘어나 있었으며, 최종 검사에는 기존 56개 + 신규 23개 = 79개가 통과했다.
- 기존 smoke 스크립트에 ConfirmProvider가 없어 내 테마 렌더가 실패했다. 테스트 wrapper를 보완했다.
- ReadingPage의 union 속성을 그대로 렌더링하는 두 타입 오류를 number/string 검사로 수정했다.
- npm run lint는 IconPicker(2), Sortable(1), CategoryPicker(1), SchedulePage(5)의 기존 hooks/ref/memoization/미사용 변수 오류 9개가 남는다. 테마 전용 검사에는 오류가 없다.
- Vite가 500kB 이상 JS 청크 경고를 출력한다. 빌드는 성공한다.
- Supabase CLI/Docker가 없어 신규 migration/Storage policy/pgTAP의 실제 실행 결과는 없다. 실서비스 배포 전 22번 작업이 필요하다.
- DEFLATE Import는 현대 브라우저의 DecompressionStream('deflate-raw')를 사용한다. ZIP64/암호화 패키지는 안내 오류를 표시한다.
- 로컬 패키지 파일은 해당 브라우저 IndexedDB에 있으므로 브라우저 데이터를 지우면 사라진다. 브라우저가 IndexedDB를 지원하지 않으면 패키지 저장 오류를 표시한다. 파일 Export 또는 Supabase 저장으로 별도 공유할 수 있다.
