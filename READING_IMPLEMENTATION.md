# Reading Library 구현 보고

검증일: 2026-10-08 (Asia/Seoul)

독서 기록장 MVP 코드를 구현했습니다. 운영 Supabase에 Migration 적용, Book API Secret 설정, Edge Function 배포는 아직 수행하지 않았습니다. 아래 테스트 결과는 실행 범위를 구분해서 기록했습니다.

1. **사용한 Book API**
   Google Books Volumes API를 사용합니다. UI → src/services/reading → packages/api → 인증된 search-books Edge Function → Google Books 순서입니다.
   [검색 API 공식 문서](https://developers.google.com/books/docs/v1/reference/volumes/list)

2. **선택 이유**
   기존 Supabase Edge Function 구조를 그대로 활용할 수 있고, 제목·저자 키워드 및 ISBN 검색, 표지·저자·출판사·출판일·설명·페이지 수를 같은 응답에서 정규화할 수 있어 선택했습니다. 한국어 검색어를 그대로 전달하며, ISBN은 isbn: 검색으로 변환합니다. 언어를 한국어로 강제 제한하지 않아 번역서·외국 도서도 검색할 수 있습니다.
   알라딘의 [검색 API](https://blog.aladin.co.kr/openapi/5353290)와 [OpenAPI 안내](https://blog.aladin.co.kr/openapi/6695306)도 검토했습니다. 이번 MVP에서는 단일 Google 제공자로 구현하고 external_source / external_id를 남겨 제공자 교체·확장을 가능하게 했습니다. **한국 도서의 실제 검색 품질·수록 범위는 API Key를 연결한 운영 환경에서 추가 검증해야 합니다.**

3. **API Key 필요 여부**
   운영 검색에는 Google Books API Key가 필요합니다. 공식 문서는 공개 데이터 요청에도 API Key 또는 OAuth 식별을 요구합니다. search-books는 Secret 미설정 시 설정 안내 오류를 반환합니다.
   [Google 인증 안내](https://developers.google.com/books/docs/v1/using#auth)
   Supabase가 없는 기존 로컬 모드는 키 없는 공개 검색을 시도하지만, 제공자에 따라 실패할 수 있으므로 운영 검색을 대체하지 않습니다.

4. **환경 변수**
   기존 공개 변수 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 유지합니다.
   추가 변수는 **GOOGLE_BOOKS_API_KEY**이며 Supabase Edge Function Secret에만 설정합니다. VITE_ 접두사로 만들거나 프런트엔드 번들에 넣지 않습니다.
   로컬 함수 실행 시 supabase/functions/.env에 설정합니다. .env.example에 빈 예제를 추가했습니다. 실제 Secret은 생성하거나 저장하지 않았습니다.

5. **생성한 파일**

   | 파일 | 용도 |
   | --- | --- |
   | packages/types/src/reading.ts | 도서·개인 기록·책장·문장·메모 타입 및 검증 |
   | packages/api/src/readingRepository.ts | Supabase 독서 CRUD |
   | packages/api/src/bookSearch.ts | Google 응답 정규화·ISBN 검색·시간 제한·오류 처리 |
   | packages/api/src/reading.test.ts | 검색·중복 식별·진행률·입력·소유권 조건 테스트 |
   | src/services/reading/index.ts | 인증 확인·Repository 연결·기존 기록 가져오기 |
   | src/services/reading/local.ts | 기존 로컬 계정 모드의 사용자별 저장 |
   | src/pages/Reading/reading.css | Theme 기반 표지 중심 UI·모바일 스타일 |
   | supabase/functions/search-books/index.ts | 인증·Secret 보호·CORS가 적용된 책 검색 |
   | supabase/migrations/20261007180000_reading_library.sql | 관계형 테이블·RLS·추가 RPC |
   | supabase/tests/reading_library.sql | 실제 DB 실행용 pgTAP 38개 검증 |
   | scripts/reading-smoke.mjs | 로컬 서비스 통합·Theme·SSR 검증 |
   | scripts/reading-preview.mjs | 운영 DB를 사용하지 않는 실제 Vite 실행 |
   | READING_IMPLEMENTATION.md | 이 보고서 |

6. **수정한 파일**
   src/pages/Reading/ReadingPage.tsx, src/App.tsx, packages/api/src/database.generated.ts, packages/api/src/index.ts, packages/types/src/index.ts, packages/types/src/themePackage.ts, package.json, .env.example, supabase/config.toml.
   기존 작업 트리에 있던 다른 기능의 수정은 유지했습니다. 기존 Sidebar의 Reading 항목과 Custom 페이지의 Reading 편집 진입을 재사용합니다.

7. **DB 테이블**
   books(공유 기본 정보), user_books(개인 상태·별점·페이지·진행률·날짜·한줄평·태그), reading_shelves(사용자 책장), reading_shelf_books(책장 연결), reading_highlights(문장), reading_notes(메모).
   기존 custom_records는 범용 기록 템플릿을 위한 테이블이므로 도서 관계 데이터를 억지로 JSON에 저장하지 않았습니다. 태그는 각 개인 기록의 text[]로 저장합니다. 개인 총 페이지 수정은 user_books.total_pages에 저장하여 공유 메타데이터를 바꾸지 않습니다.

8. **Migration 위치**
   supabase/migrations/20261007180000_reading_library.sql.
   트랜잭션으로 적용합니다. 상태·진행률·별점·페이지·책장 순서 제약, 조회 인덱스, 수정일 갱신 트리거를 포함합니다. 적용 후 기존 db:types 명령으로 생성 타입을 다시 만들 수 있습니다.

9. **RLS 정책**
   개인 테이블 5개 모두 authenticated 역할에 auth.uid() = user_id 조건으로 SELECT / INSERT / UPDATE / DELETE를 제한합니다.
   reading_shelf_books는 (shelf_id,user_id)와 (user_book_id,user_id) 복합 외래 키를 사용하므로 자신의 연결 행에 다른 사용자의 책·책장을 끼워 넣는 것도 차단합니다. 문장·메모에도 같은 소유권 외래 키가 적용됩니다.
   books는 로그인 사용자에게 공유 조회만 허용합니다. 직접 쓰기는 차단하며 add_reading_book RPC를 통해 중복 확인 후 생성합니다. RPC는 auth.uid()를 사용하고 호출자가 소유자를 지정할 수 없습니다. PUBLIC 실행 권한은 제거했습니다.

10. **추가한 API**
    readingService(userId)가 다음 Repository 메서드를 서비스 계층에서 제공합니다.
    searchBooks, getMyBooks, getUserBook, addBook, updateBook, removeBook,
    getShelves, createShelf, updateShelf, deleteShelf, addBookToShelf, removeBookFromShelf,
    getHighlights, createHighlight, updateHighlight, deleteHighlight,
    getReadingNotes, createReadingNote, updateReadingNote, deleteReadingNote.
    서버 함수: search-books. DB RPC: add_reading_book.
    원격 작업마다 로그인 사용자 일치를 확인하며 UI에서는 Supabase를 직접 호출하지 않습니다.

11. **화면과 URL**
    /reading: 전체·상태별·사용자 책장별 서재, 제목/저자 검색, 상태 필터, 표지 카드.
    /reading/:bookId: 기록 / 문장 / 메모 / 정보 탭.
    책 검색과 상태·책장 선택, 책장 생성·편집·삭제, 문장·메모 입력은 모달로 제공됩니다. 모달은 Escape, 포커스 이동 제한과 복귀를 지원합니다.
    Desktop은 책장 목록과 서재를 나란히 배치하고, 모바일은 책장 목록을 위에 배치합니다.

12. **사용자 책장**
    이름·설명·아이콘·Theme 색상·순서를 사용자가 지정합니다. 추천 책장은 안내 문구로만 보여주고 DB에 강제로 만들지 않습니다.
    순서는 숫자로 편집할 수 있습니다. Drag & Drop은 구현하지 않았습니다. 색상은 현재 Theme의 기본색·강조색·보조색 중 선택합니다.

13. **한 책을 여러 책장에 넣는 방식**
    reading_shelf_books의 복합 기본 키 (shelf_id,user_book_id)로 many-to-many를 구현하고 중복 연결을 막습니다.
    책 상세에서 여러 책장을 체크할 수 있습니다. 체크 해제는 연결 행만 지웁니다. 책장 삭제도 책과 개인 기록을 유지합니다. 서재에서 책을 삭제하면 해당 연결·문장·메모가 함께 삭제됩니다.

14. **독서 상태**
    want / reading / done / stopped의 별도 시스템 상태입니다. 사용자 책장의 이름·ID와 공유하지 않습니다.
    현재 페이지·총 페이지로 진행률을 계산하며 진행률을 직접 수정할 수도 있습니다. 완독 선택 시 진행률을 100으로 설정합니다. 날짜는 사용자가 입력합니다.
    DB·타입·UI 모두 1~5점과 0.5점 단위를 지원합니다.

15. **Highlight 구조**
    content, page_number(선택), note, tags, source_type, source_url, source_title, created_at, updated_at를 포함합니다.
    UI 신규 입력은 manual로 저장하고, 기존 문장 편집 시 원래 출처를 유지합니다. source_type은 manual / web / pdf / kindle을 지원합니다. 시간순·페이지순 목록을 제공합니다.

16. **향후 Chrome Extension 연결**
    packages/api의 createHighlight는 React 페이지에 종속되지 않습니다. 확장 프로그램에서 Supabase 세션을 사용하고 본인의 user_book_id를 지정해 web 출처와 URL·제목을 함께 저장하는 방식으로 재사용할 수 있습니다.
    이번에는 확장 프로그램 자체나 새 캡처 서버를 만들지 않았습니다.

17. **독서 기능 테스트 결과**
    npm run test:reading 통과: 도서 추가, ISBN 중복 방지, 상태 변경, 진행률·별점·한줄평, 책장 CRUD·순서 데이터, 한 책 여러 책장, 연결 제거 후 책 유지, 문장·메모 CRUD, 저장 후 새 서비스 인스턴스 재조회, 로컬 사용자 격리, 기존 책·날짜별 감상 이관, 이관 중복 방지, 삭제한 이관 책의 재생성 방지, 책 삭제 시 기록 정리, 기본 Theme 4개 변수, Reading Slot 9개, SSR 렌더링.
    packages/api/src/reading.test.ts 5개 통과: 한국어·ISBN 검색 요청과 응답 정규화(모의 HTTP), 검색 서비스 오류, 도서 식별, 진행률·별점 경계값, 소유권 조건, 책장·문장 입력 검증.
    **실제 Google 검색 응답, 운영 Supabase 저장·새로고침, 실제 PostgreSQL RLS는 아직 검증하지 못했습니다.** API Key를 생성하지 않았고 CLI·Docker·PostgreSQL이 설치되어 있지 않습니다. 격리된 테스트 엔진 다운로드도 네트워크 연결 오류로 실패했습니다. SQL 테스트 38개는 준비했지만 실행하지 않았습니다.

18. **기존 기능 회귀·실행 결과**
    npm run build 통과. 현재 작업 트리의 npm test 71개 전체 통과(인증·일정·AI·일기·Theme 및 독서 테스트 포함).
    독서 화면·서비스·타입·API의 선택 lint는 통과했습니다. Edge Function은 기본 ESLint 설정에서 제외되므로 lint 통과로 계산하지 않았습니다.
    npm run lint 전체 실행은 독서 변경 밖의 IconPicker, Sortable, CategoryPicker, Schedule, Theme Package 등에 남아 있는 14개 오류 때문에 실패했습니다. 이 보고서에서는 전체 lint가 통과했다고 주장하지 않습니다.
    실제 Vite 서버를 http://127.0.0.1:5188 에 실행했습니다. /reading, /reading/demo, App·Reading·Home·Schedule·Diary 모듈 모두 HTTP 200이며 Vite 변환 오류가 없었습니다. 실행 증거는 .tmp/reading-runtime-results.json에 있습니다.
    **브라우저 연결이 없어 클릭·스크린샷·모바일 시각 검증은 수행하지 못했습니다.** HTTP 실행·SSR·서비스 테스트는 브라우저 E2E 검증과 구분해야 합니다.

19. **Supabase에서 직접 해야 하는 작업**
    대상 프로젝트에 연결된 CLI가 있는 환경에서 Migration을 검토하고 적용합니다. CLI가 없다면 Supabase SQL Editor에서 해당 Migration 파일을 한 번 실행할 수 있습니다.

    ~~~sh
    supabase db push
    supabase secrets set GOOGLE_BOOKS_API_KEY=실제키
    supabase functions deploy search-books
    ~~~

    실제 키는 이 문서나 버전 관리 파일에 넣지 않습니다. functions.search-books.verify_jwt = true와 함수 내부 getUser 검증을 모두 적용했습니다.
    로컬 Supabase 환경에서는 db reset 후 SQL 테스트를 실행합니다. db reset은 로컬 데이터를 초기화하므로 운영 프로젝트에 사용하는 명령이 아닙니다.

    ~~~sh
    supabase test db supabase/tests/reading_library.sql
    npm run db:types
    ~~~

    운영에서는 두 개의 테스트 계정으로 책 추가·다중 책장·문장·메모·새로고침과 다른 사용자의 ID로 SELECT / INSERT / UPDATE / DELETE가 차단되는지 확인해야 합니다.
    Vite 단독 로컬 미리보기는 node scripts/reading-preview.mjs로 실행할 수 있으며 운영 Supabase 설정을 읽지 않습니다.

20. **아직 구현하지 않은 기능·남은 검증**
    요청대로 Chrome Extension, 웹 드래그/PDF/Kindle 캡처, 전자책 뷰어, AI 요약·질문, 공유·팔로우·고급 통계는 제외했습니다.
    Drag & Drop 책장 재정렬, 별점·책장 조합 필터, 제목/완독일/사용자 지정 책 정렬도 후속 확장 항목입니다. 현재는 내 서재 검색·상태 필터·책장 선택·최근 추가순을 제공합니다.
    한국 도서 실제 검색 품질, 원격 DB 적용과 RLS 실 실행, 브라우저 상호작용·Theme·모바일 시각 확인은 환경을 연결한 뒤 수행해야 합니다.

## 기존 기록 호환

기존 브라우저 책과 날짜별 감상은 Reading 진입 시 새 서재와 메모로 한 번 가져옵니다. 책 제목·저자·표지·상태·페이지·시작일·완독일 및 감상의 날짜·페이지·본문을 유지합니다. 가져오기 표식을 사용자별로 저장하고 이미 이관한 메모 ID를 확인해 중복을 방지합니다. 원래 데이터는 지우지 않으며 가져오기가 실패해도 기존 원격 서재는 표시합니다. 기존 기록의 원래 created_at은 새 DB 행의 생성일로 복사하지 않고, 날짜별 감상 날짜는 메모 본문에 유지합니다.

## Theme 연결

Reading UI에는 새 HEX 색상을 넣지 않았습니다. background/surface/text/primary/card/border/radius 및 Sidebar 토큰을 사용하며 Theme Package의 허용 Slot 목록에 reading-page, reading-sidebar, reading-shelf, reading-book-grid, reading-book-card, reading-book-cover, reading-detail, reading-highlight, reading-note를 등록했습니다. 각 실제 요소의 data-theme-slot에 같은 이름을 적용했습니다.

## 2026-10-08 화면 개선

- 별점을 5개 별 버튼으로 선택하고 초기화할 수 있게 변경했습니다. 기존 소수 별점은 채워진 별로 표시합니다.
- 독서 화면의 진행률·현재 페이지·총 페이지 표시와 입력, 책장 순서 입력칸을 제거했습니다.
- 이모지 2,402개와 Lucide 아이콘 1,854개를 검색·선택할 수 있습니다. 이모지 직접 입력은 OS 이모지 키보드와 가족·직업 등의 조합도 지원합니다. 전체 선형 아이콘은 별도 청크에서 필요할 때 로드합니다.
- 책장 손잡이 드래그 및 방향키로 순서를 지정하고, 전체 탭 책 카드나 손잡이를 책장에 끌어 놓으면 연결을 추가합니다. 원래 서재와 다른 책장 연결은 유지됩니다. 드래그 끝에 순서를 원자적으로 저장합니다.
- Google Books volumeInfo.categories 및 mainCategory를 저장해 종류 필터와 책 정보에 표시합니다. 일반적인 분야명은 한국어로 표시하고 그 밖의 명칭은 원문을 유지합니다. 분류가 없는 책은 분류 없음으로 조회합니다.
- 기존 도서는 분류 정보 불러오기 버튼으로 20권씩 API 정보를 보충할 수 있습니다. 서버에서는 인증 사용자의 서재에 있는 도서만 조회하고 API 응답에서 얻은 분류만 서버 권한으로 갱신합니다. SUPABASE_SERVICE_ROLE_KEY는 Supabase Edge 런타임 기본 Secret을 사용하며 브라우저에 전달하지 않습니다.

### 이번 변경 적용

기존 독서 Migration을 적용한 프로젝트에서는 **supabase/migrations/20261008090000_reading_categories_and_order.sql만 추가 실행**해야 합니다. 처음 적용하는 프로젝트에서는 기존 20261007180000_reading_library.sql 후 새 Migration을 적용합니다. 이미 적용한 첫 Migration을 다시 실행하지 않습니다.

그리고 수정된 함수 코드를 배포합니다.

~~~sh
supabase functions deploy search-books
~~~

API Key는 기존 GOOGLE_BOOKS_API_KEY를 그대로 사용합니다. 추가 사용자 Secret은 필요하지 않습니다.

검증: 빌드·독서 선택 lint 통과, 전체 단위 테스트 81개 및 독서 통합 테스트 통과. 새 테스트는 분류 정규화·조회, 책장 재정렬 영속성·타 사용자 순서 차단, 아이콘·이모지 목록과 조합 입력, 별 버튼 렌더링 및 제거된 입력 항목을 확인합니다. 실제 브라우저 연결은 없어서 드래그 제스처·모바일 화면을 시각 검증하지 못했습니다. PostgreSQL/Supabase 실 실행용 추가 SQL 검증은 supabase/tests/reading_order_categories.sql(8개)에 작성했지만 이 환경에서 실행하지 않았습니다.
