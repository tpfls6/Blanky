# Google 로그인 연결

로그인 버튼은 `signInWithGoogle` → 기존 Auth service → `packages/api` → Supabase OAuth로 연결됩니다. 현재 브라우저의 origin(`/`)으로 돌아오며 Supabase SDK가 세션을 복원합니다.

서버 공개 인증 설정을 직접 조회했을 때 `external.google = false`였습니다. 코드 연결과 별개로 서버 제공자 설정이 필요합니다.

1. Google Cloud의 Google Auth Platform에서 OAuth 클라이언트를 **Web application**으로 만듭니다.
2. Authorized JavaScript origins에 실제 Blanky 주소를 등록합니다. 개발 기본 주소는 `http://localhost:5173`이며 다른 포트를 사용한다면 실제 주소를 입력합니다.
3. Authorized redirect URIs에 `https://drqauskbpizxjnfquktz.supabase.co/auth/v1/callback`을 등록합니다.
4. Supabase 프로젝트 Authentication → Sign In / Providers → Google에서 Client ID와 Client Secret을 입력하고 Google 로그인을 활성화해 저장합니다. Secret은 Supabase 관리 화면에 입력합니다.
5. Supabase Authentication → URL Configuration에서 Site URL을 앱 주소로 지정하고, Redirect URLs에 실제 앱 반환 URL(예: `http://localhost:5173/`)을 추가합니다. 운영 주소와 개발 주소를 함께 사용한다면 각각 추가합니다.
6. Google 앱이 Testing 상태라면 Audience에서 로그인할 계정을 Test users에 추가합니다.
7. Blanky 로그인 화면에서 **Google로 계속하기**를 눌러 로그인합니다.

Google에서 되돌아오면 기존 Auth 세션 구독을 통해 서버 계정으로 로그인됩니다. Google 제공자가 꺼져 있거나 설정 조회에 실패하면 앱에서 오류를 보여주고 이동을 중단합니다. 인증 취소도 앱 로그인 화면에 표시합니다.

공식 설정 문서: https://supabase.com/docs/guides/auth/social-login/auth-google

코드 및 모의 API 테스트는 확인했지만 실제 Google 계정의 동의 화면을 거치는 로그인은 실행하지 않았습니다. 서버 제공자 설정도 자동으로 변경하지 않았습니다.
