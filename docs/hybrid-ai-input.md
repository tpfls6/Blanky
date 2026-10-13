# 하이브리드 AI 1차: 입력 처리

`packages/parse/src/intentRouter.ts`의 `routeInput`을 웹 서비스와 서버 파서가 공유한다.
반환 타입 `InputRoute`는 `packages/types`에 정의한다.

분류 순서는 계획 요청 → 복합 문장 → 기존 파서 신뢰도다.

| 입력 예 | 경로 | 처리 |
| --- | --- | --- |
| 내일 오후 3시 회의 | parser | 기존 규칙 파서, AI provider 미호출 |
| 오늘 오후 3시부터 5시까지 회의 | parser | 단일 시간 범위 유지 |
| 내일 오후 3시 회의하고 5시 운동 | ai | 신뢰도와 무관하게 기존 AI provider 호출 |
| 이번 주 공부 계획 세워줘 | planner | 일정으로 변환하지 않고 Planner 경계로 전달 |

`resolveParse`는 기존 `ParsedSchedule` 계약을 유지한다. Planner 요청은
`PlannerRequiredError` (`PLANNER_REQUIRED`)로 분리한다. Edge Function은 이를
HTTP 422 오류로 반환하며 API도 호출 전에 같은 코드로 분리한다. 기존 대화 UI는
준비 중 안내를 표시하고 일정을 생성하지 않는다. Planner 실행은 후속 단계다.

AI 키 미설정, provider 오류 또는 유효하지 않은 응답은 기존 규칙 파서 결과로
돌아가는 동작을 유지한다. 복합 입력 분류는 한국어 규칙 기반이며 모든 자연어를
판별하는 모델은 아니다. 여러 일정의 생성·계획 실행·자동 재배치는 구현하지 않았다.

기존 Supabase schedules/schedule_changes, categories,
user_classification_rules와 소유자 RLS를 저장소 마이그레이션 및 생성 타입에서
확인했다. 개인 규칙과 카테고리 로딩은 유지하며 DB 변경은 없다.
원격 DB 연결 및 실제 AI 호출/Edge 배포는 이 검증에 포함하지 않는다.

검증: `npm run test:input`, `npm test`, `npm run build`.
