# Google Calendar 연결

Settings → Google Calendar의 **Google Calendar 연결**은 로그인과 별개입니다. `signInWithGoogle`은 계정만 만듭니다. Calendar 권한은 나중에 Settings에서 받습니다.

브라우저가 Google에 직접 쓰지 않습니다. `createCalendarSyncClient`가 `google-calendar` Edge Function을 호출하고, Google OAuth 코드는 `google-calendar-oauth`로 돌아옵니다. Client ID와 Client Secret은 Edge Function Secret에만 둡니다. 저장소에 값을 넣지 마세요.

1. Google Cloud에서 Calendar용 OAuth 클라이언트를 **Web application**으로 만듭니다. 로그인용 클라이언트와 나눠도 됩니다.
2. Authorized redirect URIs에 `https://<project-ref>.supabase.co/functions/v1/google-calendar-oauth`를 등록합니다. 로컬 Functions를 쓰면 `http://127.0.0.1:54321/functions/v1/google-calendar-oauth`도 추가합니다.
3. Google Calendar API를 해당 프로젝트에서 사용 설정합니다.
4. Consent screen의 범위에 `https://www.googleapis.com/auth/calendar.events`와 `https://www.googleapis.com/auth/calendar.calendarlist.readonly`를 넣습니다.
5. 앱이 Testing이면 Audience의 Test users에 연결할 Google 계정을 추가합니다.
6. Supabase Edge Function Secrets에 아래 값을 넣습니다. 로컬이면 `supabase/functions/.env`에 같은 키를 복사합니다. 그 파일은 gitignore입니다.

```
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=
```

`GOOGLE_CALENDAR_REDIRECT_URI`를 비우면 함수가 `{SUPABASE_URL}/functions/v1/google-calendar-oauth`를 씁니다. 브라우저용 `VITE_` 변수에 Calendar 비밀을 두지 마세요.

7. `google-calendar`와 `google-calendar-oauth`를 원격에 배포합니다. 배포하지 않으면 Settings는 `GOOGLE_FN_MISSING`을 보여 줍니다.

```
npx supabase link --project-ref <project-ref>
npx supabase functions deploy google-calendar
npx supabase functions deploy google-calendar-oauth
npx supabase secrets set GOOGLE_CALENDAR_CLIENT_ID=... GOOGLE_CALENDAR_CLIENT_SECRET=...
```

8. Blanky에 로그인한 뒤 **Settings → Google Calendar**에서 **Google Calendar 연결**을 누릅니다. Google 동의 후 `/settings/google-calendar`로 돌아옵니다. 캘린더와 첫 가져오기 방향을 고르면 연결이 준비됩니다.

비밀이 없으면 함수는 `503`과 `GOOGLE_ENV_MISSING`을 반환합니다. 함수가 없으면 게이트웨이 `404`를 `GOOGLE_FN_MISSING`으로 읽습니다. 설정 화면은 그 코드를 보고 안내를 바꿉니다.

공식 문서: https://developers.google.com/workspace/calendar/api/guides/auth

코드 테스트는 확인했습니다. 실제 Google Cloud 클라이언트, Edge Function Secret, 동의 화면, 그리고 라이브 동기화는 실행하지 않았습니다.
