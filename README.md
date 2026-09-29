# Blanky

자연어로 적는 개인 일정·기록 관리 웹 서비스입니다.

해야 할 일이나 일정을 대충 입력하면 AI가 날짜, 시간, 카테고리, 우선순위, 예상 소요 시간으로 정리하고, 그 결과를 캘린더·타임라인·표로 보여 주는 것이 목표입니다. 지금은 그 기능을 붙이기 전의 개발 환경과 화면 골격입니다.

## 기술 스택

- Frontend: React, TypeScript, Vite
- Styling: Tailwind CSS
- Routing: React Router
- Backend / Database: Supabase PostgreSQL
- Authentication: Supabase Auth
- Calendar: FullCalendar 7 (`@fullcalendar/react`와 daygrid / timegrid / interaction 진입점)
- Icons: Lucide
- Package manager: npm
- AI: Supabase Edge Function `parse-schedule`를 통해 OpenAI API 또는 Gemini API 연결. 키는 클라이언트에 두지 않습니다.
- 이후 모바일: React Native + Expo. 공유 코드는 `packages/`에 있습니다.

## 디렉터리

웹 앱은 저장소 루트의 `src/`에 그대로 있습니다. 화면과 분리된 공통 코드만 패키지로 나눴습니다.

```text
src/                  웹 UI, 라우팅, Vite 환경변수 연결
packages/types/       Schedule, Category, UserPreference 등
packages/api/         Supabase 조회와 AI 호출
packages/utils/       날짜와 짜투리 시간 계산
supabase/functions/   Edge Function
supabase/migrations/  공통 PostgreSQL 스키마
```

웹 컴포넌트는 Supabase를 직접 호출하지 않습니다. `src/services/schedule`, `src/services/auth`, `src/services/ai`가 `packages/api`를 감쌉니다.

## React Native + Expo 추가

앱 화면은 아직 없습니다. 데이터를 다시 정의하지 않고 붙이려면 다음 순서로 진행합니다.

1. `apps/mobile`에 Expo 앱을 만듭니다.
2. Metro가 `packages/types`, `packages/utils`, `packages/api`를 보도록 `watchFolders`를 설정합니다.
3. 모바일에서는 `EXPO_PUBLIC_SUPABASE_URL`과 `EXPO_PUBLIC_SUPABASE_ANON_KEY`를 `createSupabaseClient`에 넘깁니다. Vite 전용 `import.meta.env`는 웹의 `src/services/supabase/client.ts`에만 있습니다.
4. 일정 조회, 저장, AI 정리는 `@blanky/api`의 repository와 `parseScheduleFromText`를 그대로 호출합니다.
5. 화면, 내비게이션, 캘린더 UI, 푸시 알림 등록은 앱에서 새로 만듭니다. FullCalendar와 React Router는 웹 전용입니다.

나중에 루트 웹 앱을 `apps/web`으로 옮기면 npm workspaces 모노레포가 됩니다. 그 전까지는 지금 구조로 웹을 실행합니다.

## PWA

매니페스트만 연결해 두었습니다. 서비스 워커와 오프라인 캐시는 아직 없습니다. 홈 화면 설치를 붙일 때는 `public/`의 매니페스트와 아이콘을 확장하면 되고, 라우팅이나 데이터 계층을 바꿀 필요는 없습니다.

## 설치 방법

```bash
npm install
```

## 실행 방법

개발 서버:

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 을 엽니다.

프로덕션 빌드:

```bash
npm run build
```

린트:

```bash
npm run lint
```

## 환경변수 설정 방법

1. `.env.example`을 복사해 `.env`를 만듭니다. 저장소에는 빈 `.env`가 포함되어 있지 않으며, `.env`는 Git에 올라가지 않습니다.
2. [Supabase](https://supabase.com)에서 프로젝트를 만든 뒤 아래 값을 채웁니다.

| 변수 | 넣는 값 |
| --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → anon public key |

`anon` 키는 브라우저에 노출되는 공개 키입니다. `service_role` 키는 넣지 마세요.

OpenAI 또는 Gemini API 키는 프론트엔드 `.env`에 두지 않습니다. 모델 호출은 이후 Supabase Edge Function이나 별도 서버에서 처리합니다. 키가 없으면 앱은 뜨고, Supabase가 필요한 기능만 연결 전까지 동작하지 않습니다.

값을 바꾼 뒤에는 개발 서버를 다시 시작하세요.

## 현재 구현된 기능

- React + TypeScript + Vite 개발 환경
- Tailwind CSS
- 사이드바 레이아웃. 태블릿 이상에서는 사이드바, 모바일에서는 하단 메뉴와 서랍
- Home의 자연어 입력창과 빈 일정 상태 (AI 미연결)
- Calendar 페이지의 FullCalendar 렌더링
- 웹과 모바일이 함께 쓸 타입, API, 유틸
- Supabase 스키마와 `parse-schedule` Edge Function 초안

## 향후 구현 예정 기능

- 자연어 일정 입력
- AI 일정 구조화
- 우선순위 자동 지정
- 카테고리 자동 분류
- 일정 시간 자동 배정
- Calendar / Timeline / Table 연동
- 사용자 수정 패턴 반영
- 짜투리 시간 추천
- History
- Journal
- Reading Log
- Project Management
