# 하이브리드 AI 2차: 분석 및 검증

사용자 요청에 따라 실제 provider를 Gemini에서 **OpenAI**로 변경했다.
Gemini 키를 사용하거나 Gemini로 요청하지 않는다. 기존 단일 provider API는
호환성을 위해 남겨 두되 웹 분석과 Edge Function은 새 검증 경로를 사용한다.

## 흐름

홈/일정 입력 → `analyzeSchedules` → API `analyzeScheduleFromText` →
Supabase `parse-schedule` → `resolveScheduleAnalysis` → 기존 Intent Router.

- parser: 기존 규칙·개인 규칙 파서로 1개 항목 생성. OpenAI 호출 없음.
- ai: 서버 전용 `createOpenAIAnalysisProvider`가 Responses API를 호출.
- planner: `PLANNER_REQUIRED` (HTTP 422). 생성·저장·자동 배치 없음.

서버와 클라이언트 모두 `ScheduleAnalysis`를 사용하며 각 항목의
`type/confidence/source/draft`는 기존 `ParsedSchedule`와 동일하다.
기존 `parseScheduleFromText`는 단일 항목만 반환하고 복수 항목을 자르지 않는다.
이전 Edge 응답 계약도 단일 항목에서는 유지하며 복수 입력은 오류로 분리한다.

## 분석 계약

`packages/types/src/ai.ts`, `aiSchema.ts`가 공통 타입·JSON Schema·검증기를 제공한다.
JSON Schema를 OpenAI strict Structured Outputs에 전달하고 서버 및 API에서 다시 검증한다.

- 1~20개의 일정/할 일, 날짜·시각·마감일·종료 날짜·카테고리.
- 항목 ID와 before / depends_on 관계. 미존재 ID·자기 참조·순환 참조 거부.
- 원문 날짜/시간 근거 `evidence`, 카테고리 추천 이유, 불확실한 정보와 경고.
- 필수 필드 누락, 추가 속성, 미지원 버전·유형, 잘못된 달력 날짜·시각,
  범위·순서 오류, 알 수 없는 카테고리 ID, 근거 없는 날짜·시각을 거부.
- API 키·원문·provider 응답 본문은 서버 오류 로그에 기록하지 않는다.
  로그에는 requestId, 오류 코드, 항목 수, 지연 시간, 입력 길이만 남긴다.

규칙 파서의 오늘/선택일 fallback은 분석에서 확정 날짜로 간주하지 않는다.
AI 분석에 없는 날짜·시각은 null로 유지한다. 마감일을 작업 예정일로 복사하지 않는다.
실제 자연어의 의미까지 스키마만으로 보증할 수 없으므로 항목별 확인 화면을 제공한다.
모델의 confidence는 보정된 확률이 아니다.

## 실패 및 저장 정책

네트워크·30초 timeout·인증·한도·잘못된 JSON·refusal·truncated 출력·검증 실패 시
분석을 중단하고 사용자에게 오류를 표시한다. 복합 입력을 단일 규칙 결과로 대체하지 않는다.
분석 함수는 DB 쓰기를 하지 않는다. 인증된 사용자가 항목별 확인 후 기존 commitWork로 저장한다.

날짜가 없으면 사용자가 지정해야 한다. 시각 없는 event는 시간 없음 확인이 필요하다.
종료 시각이 없으면 저장 시 기본 1시간을 추가하지 않는다. 각 항목의 저장 완료와 실패를
독립 표시하며 중복 클릭을 차단한다. 관계는 화면에만 표시하고 DB 배치 엔진으로 실행하지 않는다.
AI와 불확실한 결과는 자동 저장하지 않는다. 기존 자동 저장 설정은 확실한 단일 parser 결과에 적용한다.
기존 수동 입력·수정, Calendar/Today, Diary, Reading 저장 구조를 유지한다.

## 서버 설정 / 배포

- 서버 Secrets: `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`.
- 로컬 Edge: gitignored `supabase/functions/.env`. 키는 VITE_ 변수로 지정하지 않는다.
- `AI_PROVIDER=local`은 AI 호출 비활성화. 복합 입력은 설정 오류로 알린다.
- Supabase 프로젝트 Blanky (`drqauskbpizxjnfquktz`)에 Secrets 설정 및 parse-schedule 배포 완료.
- verify_jwt=true 유지. 함수 안에서도 auth.getUser로 실제 사용자 인증을 확인한다.
- DB 스키마·데이터 초기화·마이그레이션 없음. 프런트엔드 호스팅은 배포하지 않았다.

## 검증 결과 (2026-10-13)

| 구분 | 결과 |
| --- | --- |
| Mock/기존 단위 테스트 | npm test: 108개 통과 (새 분석 테스트 13개 포함) |
| 프로덕션 빌드 | 통과, 기존 큰 chunk 경고 |
| OpenAI 실제 호출 | 두 합성 시나리오 통과: 일정/할 일/마감일 분리, 날짜 없는 작업/순서 분석 |
| 실제 호출 중 발견한 오류 | 원문 근거를 변환 날짜로 반환한 응답은 검증기가 차단. 원문 근거 및 순서 예시를 프롬프트에 추가한 후 재검증 통과 |
| 배포 Edge smoke | 실제 URL OPTIONS 204 및 비로그인 호출 AUTH_REQUIRED 401 통과 |
| 인증 후 배포 Edge → OpenAI | 사용자 토큰이 없어 미실행. 테스트용 계정이나 사용자 데이터 생성 없음 |
| Gemini 실제 호출 | 사용자 변경 요청으로 미실행 |
| AI 브라우저 | 확인 후 저장, 날짜 미정 차단, 종료 시각 null 유지, offline 오류, Planner 비저장, 복수 항목 Mock, 중복 클릭 방지, 모바일 통과 |
| 일정 브라우저 | 일정/할 일 드래그, 소요 시간 유지, 재접속 후 저장 유지 통과 |
| Diary 브라우저 | 작성·자동 저장·검색·메타데이터·모바일·테마 등 16개 항목 통과 |
| Reading smoke | 저장·중복 방지·진행/평점·서가·메모·사용자 분리·마이그레이션·렌더링 통과 |
| lint | 새 파일 및 변경된 분석 코드 오류 없음. 전체 lint는 기존 IconPicker, Sortable, CategoryPicker, SchedulePage 오류 9개로 실패 |
| 키 노출 확인 | 빌드된 dist/assets에 실제 OpenAI 키가 포함되지 않음을 확인 |

명령: `npm run test:ai`, `npm run test:ai-live`, `npm run test:ai-edge`,
`npm run test:ai-browser`. 실제 호출은 명시적으로 실행하는 별도 테스트이며
기본 `npm test`에서 외부 API를 호출하지 않는다.
`AI_TEST_USER_TOKEN`을 설정하면 `test:ai-edge`가 인증 후 단순/복합/Planner 요청도
합성 문장으로 검증한다. 어떤 테스트도 운영 일정 데이터를 저장하지 않는다.

후속 범위: Planner 실행, 자동 배치, 관계 DB 영속화, 모델 품질/회귀 데이터 확대.
키 교체 시 Supabase Secrets와 로컬 ignored env를 함께 갱신해야 한다.

## 수정/추가 파일

- 공통 타입: `packages/types/src/ai.ts`, `aiSchema.ts`, `index.ts`.
- 파서: `packages/parse/src/analysisProvider.ts`, `intentRouter.ts`, `resolve.ts`, `model.ts`, `index.ts`, `intentRouter.test.ts`.
- API: `packages/api/src/ai.ts`, `index.ts`.
- 서비스: `src/services/ai/index.ts`, `src/services/schedule/index.ts`.
- 대화/확인 로직: `src/features/ai/conversation.ts`, `review.ts`.
- 화면: `src/components/schedule/AnalysisReview.tsx`, `src/pages/Home/HomePage.tsx`, `src/pages/Schedule/SchedulePage.tsx`.
- 저장 호환: `src/state/library.tsx`, `src/utils/work.ts`.
- Edge: `supabase/functions/parse-schedule/index.ts`, `handler.ts`.
- 테스트: `tests/aiAnalysis.test.ts`, `scripts/ai-live-test.mjs`, `scripts/ai-edge-test.mjs`, `scripts/ai-browser-test.mjs`.
- 설정/문서: `.env.example`, `.gitignore`, `package.json`, 이 문서.
- 키는 gitignored `supabase/functions/.env`와 Supabase Secrets에만 보관한다.

작업 중 별도로 변경된 `public/manifest.webmanifest`, `public/icons/`는 이 개발에서 수정하지 않았다.

참고: [OpenAI Structured Outputs 공식 문서](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
