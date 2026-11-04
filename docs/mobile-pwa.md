# 모바일 · PWA 설치 가이드

Blanky는 같은 웹 앱을 PC와 모바일에서 함께 사용합니다. 휴대폰 홈 화면에 설치하면 주소창 없는 독립 실행 화면(standalone)으로 열립니다. 계정과 데이터는 같은 Supabase 프로젝트를 쓰므로 PC와 모바일이 자동으로 같은 데이터를 봅니다.

## 구성

| 항목 | 파일 |
| --- | --- |
| Manifest | `public/manifest.webmanifest` |
| 아이콘(일반·마스커블·iOS) | `public/icons/` (`npm run icons:pwa`로 `public/logo.svg`에서 다시 생성) |
| Service Worker | `src/pwa/serviceWorker.js` → 빌드 시 `/sw.js`로 생성(`vite.config.ts`의 `serviceWorker()` 플러그인) |
| 등록 · 업데이트 알림 | `src/pwa/register.ts`, `src/components/layout/AppStatusNotice.tsx` |

캐시 정책은 다음과 같습니다.

- **화면 이동(HTML)**: 네트워크를 먼저 사용합니다. OAuth로 돌아올 때나 새로 배포했을 때 이전 화면이 남지 않습니다. 오프라인이면 캐시해 둔 앱 화면을 엽니다.
- **`/assets/*`(해시가 붙은 빌드 파일)**: 캐시를 먼저 사용합니다.
- **Supabase · Google · Edge Function 요청**: 캐시하지 않습니다. 일정·기록 데이터는 항상 서버에서 받아옵니다. 오프라인에서는 저장하지 못하며, 화면 상단에 오프라인 안내가 표시됩니다.
- **업데이트**: 새 버전을 배포하면 앱에 "새 버전이 준비됐어요 · 새로고침" 안내가 뜹니다. 사용자가 누를 때만 새 버전으로 바뀌므로 작성 중인 입력이 사라지지 않습니다. 앱이 다시 화면에 나타날 때 자동으로 업데이트를 확인합니다.
- Service Worker는 production 빌드에서만 등록합니다. `npm run dev`에서는 등록하지 않습니다.

## 실제 휴대폰에서 테스트하기

Service Worker와 설치 기능은 **HTTPS** 또는 **localhost**에서만 동작합니다. 같은 Wi-Fi의 `http://192.168.x.x` 주소로는 화면은 확인할 수 있지만 설치와 오프라인 기능은 동작하지 않습니다.

### 방법 A. 배포 주소 사용 (권장, Android · iOS 공통)

1. Vercel, Netlify, Cloudflare Pages 등 HTTPS 정적 호스팅에 배포합니다.
   - Build command: `npx vite build` (현재 `npm run build`의 `tsc -b`는 기존 타입 오류로 실패합니다. 오류를 고친 뒤에는 `npm run build`를 사용합니다.)
   - Output: `dist`
   - 환경 변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - SPA 경로 처리: 모든 경로를 `/index.html`로 보내도록 설정합니다(Vercel·Netlify의 SPA rewrite).
   - `/sw.js`에 긴 캐시를 걸지 않습니다(`Cache-Control: no-cache` 권장). 대부분의 호스팅은 기본값으로 충분합니다.
2. 아래 **Supabase · Google 설정**에 배포 주소를 추가합니다.

### 방법 B. PC에서 실행하고 HTTPS 터널로 연결

```bash
npm run preview:mobile                       # 빌드 후 http://0.0.0.0:4173 으로 실행
cloudflared tunnel --url http://localhost:4173   # 또는 ngrok http 4173
```

터널이 알려 주는 `https://xxxx.trycloudflare.com` 주소를 휴대폰에서 엽니다. `vite.config.ts`에서 `.trycloudflare.com`, `.ngrok-free.app` 호스트를 허용해 두었습니다. 터널 도구는 프로젝트 의존성이 아니므로 별도로 설치합니다. 주소가 바뀔 때마다 Supabase Redirect URLs에 추가해야 합니다(와일드카드 `https://*.trycloudflare.com/**` 사용 가능).

### 방법 C. Android + USB (HTTPS 없이)

```bash
npm run preview:mobile
adb reverse tcp:4173 tcp:4173
```

휴대폰 Chrome에서 `http://localhost:4173`을 열면 localhost로 인식되어 설치·오프라인 기능까지 테스트할 수 있습니다. PC Chrome의 `chrome://inspect`에서 휴대폰 화면을 디버깅할 수 있습니다. Supabase Redirect URLs에 `http://localhost:4173/**`를 추가합니다.

### 화면만 빠르게 확인 (설치 기능 제외)

```bash
npm run dev:mobile    # 같은 Wi-Fi에서 http://<PC IP>:5173
```

Windows 방화벽에서 Node.js 연결을 허용해야 할 수 있습니다. 이 방법으로 Google 로그인을 하려면 `http://<PC IP>:5173/**`를 Redirect URLs에 추가합니다.

## Supabase · Google 설정

Google 로그인은 Supabase OAuth를 거쳐 `현재 주소/`로 돌아옵니다. 테스트할 주소마다 다음을 설정합니다.

1. Supabase → Authentication → URL Configuration → **Redirect URLs**에 테스트 주소를 추가합니다(예: `https://blanky.example.com/**`). 목록에 없으면 Site URL로 돌아가서 다른 주소에서 로그인됩니다.
2. Google Cloud OAuth 클라이언트의 Authorized redirect URI는 Supabase 콜백(`https://<project>.supabase.co/auth/v1/callback`) 하나로 충분합니다. 앱 주소가 바뀌어도 바꿀 필요가 없습니다.
3. Google Calendar 연동은 연결을 시작한 주소로 돌아옵니다. Edge Function의 `GOOGLE_CALENDAR_REDIRECT_URI` 설정은 그대로 둡니다.

## 홈 화면에 설치

### Android (Chrome)

1. Chrome에서 Blanky 주소를 엽니다.
2. 메뉴(⋮) → **앱 설치** 또는 **홈 화면에 추가**를 누릅니다. 주소창에 설치 아이콘이 보이면 그것을 눌러도 됩니다.
3. 홈 화면의 Blanky 아이콘으로 실행하면 독립 실행 화면으로 열립니다. 아이콘을 길게 누르면 일정·일기·메모 바로가기가 표시됩니다.

### iOS / iPadOS (Safari)

1. **Safari**에서 Blanky 주소를 엽니다. iOS 16.4 이상에서는 Chrome의 공유 메뉴도 사용할 수 있습니다.
2. 공유 버튼 → **홈 화면에 추가** → **추가**를 누릅니다.
3. 홈 화면 아이콘으로 실행합니다.

iOS 참고 사항:

- 홈 화면 앱은 Safari와 저장 공간이 분리되어 있습니다. **설치한 앱 안에서 한 번 더 로그인**해야 합니다. 데이터는 서버 계정 기준이라 로그인하면 그대로 보입니다.
- 이메일 가입 확인 링크는 Safari에서 열립니다. 확인한 뒤 홈 화면 앱으로 돌아와 로그인합니다.

## 실제 기기 점검 목록

- [ ] 설치 후 주소창 없이 열리고, 상태 표시줄·하단 홈 인디케이터에 화면이 가리지 않는다
- [ ] Google 로그인 → 앱으로 돌아와 로그인 상태가 유지된다(Android, iOS 각각)
- [ ] 일정 추가·수정·완료·삭제 후 PC에서 새로고침하면 같은 내용이 보인다
- [ ] 홈 입력창에서 AI 입력(예: "내일 오후 3시 회의")을 보내 일정이 만들어진다
- [ ] 입력창을 눌러도 화면이 확대되지 않는다(iOS)
- [ ] 하단 내비게이션 **더보기**에서 설정·스토어·커스터마이징·휴지통으로 이동한다
- [ ] 테마 적용 후 PC와 모바일 모두 같은 테마가 보인다
- [ ] 비행기 모드에서 앱을 열면 화면과 오프라인 안내가 보인다
- [ ] 새 버전 배포 후 앱을 다시 열면 업데이트 안내가 뜨고, 새로고침하면 바뀐다

## 자동 테스트

```bash
npm run test:mobile-browser   # 모든 주요 화면 375·320·1440px 가로 넘침, 더보기 시트·확인창·색상 팝오버
npm run test:pwa-browser      # 빌드 → 설치 가능 여부(Chromium), 아이콘, 오프라인 실행, 업데이트 안내
```

결과와 스크린샷은 `.audit/runs/mobile-layout`, `.audit/runs/pwa`에 저장됩니다. 두 테스트 모두 로컬 계정(Supabase 미연결)으로 실행하므로 실제 Google 로그인과 서버 동기화는 검증하지 않습니다.
