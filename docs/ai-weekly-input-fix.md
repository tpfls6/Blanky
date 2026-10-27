# 주간 근로 입력 502 수정 — 2026-10-15

## 원인과 재현

`화요일 9시부터 13시, 목/금 9시부터 6시 주마다 근로있는데 일정 추가해줘.`의 실제 OpenAI 응답이 원문에 없는 `목요일`, `금요일`을 evidence로 반환했다. 날짜도 해당 요일과 불일치했다. 기존 검증이 응답을 거부하여 AI_RESPONSE_INVALID / HTTP 502가 발생했다. 프롬프트 보완 후에도 날짜를 evidence로 반환하는 사례가 재현되어 프롬프트만으로 해결하지 않았다.

## 변경

- `packages/parse/src/analysisProvider.ts`: 축약 요일, 불명확한 종료 시각, 주간 반복 지침 보완. 검증된 단일 요일 근거의 날짜는 기존 parseKoreanDate로 계산.
- `packages/types/src/aiSchema.ts`: 원문에 독립적으로 있는 축약 요일 근거 허용. 원문에 없는 근거와 잘못된 응답은 계속 거부.
- `packages/parse/src/weeklyRanges.ts`: 전체 문장이 명시적인 주간 요일/시간 범위 목록인 경우에만 동작하는 규칙 모듈. 원문 전체를 읽고 세 항목을 유지한다. 오전/오후 또는 익일 종료를 추측하지 않는다.
- `packages/parse/src/resolve.ts`: 복합 입력은 기존대로 AI 호출. 지원되는 명시적 주간 목록의 날짜/시간은 규칙으로 처리하고 AI_RESPONSE_INVALID 시에도 같은 제한된 규칙으로 복구한다. API 장애나 일반 복합 입력에 대한 대체 저장은 하지 않는다.
- `src/components/schedule/AnalysisReview.tsx`, `src/features/ai/review.ts`, `src/pages/Home/HomePage.tsx`: 분석 원문 유지, 항목별 반복 선택, 명시적 주간 범위 항목에만 매주 기본값. 기존 WorkInput.repeat와 일정 저장 API 재사용.
- `tests/aiAnalysis.test.ts`: 축약 근거/날짜 계산/가짜 근거 차단/주간 반복/AI 오류 복구/장애 차단 테스트.
- `scripts/ai-reproduction.mjs`, `scripts/ai-weekly-edge-test.mjs`: 저장 없는 실제 재현 및 인증된 배포 함수 검증.

## 결과

- 전체 테스트 166개 통과, lint 및 타입 검사/빌드 통과.
- 기존 AI 브라우저 회귀 테스트 통과: 미리보기/저장/날짜 미정/중복 클릭 방지/오프라인 오류/Calendar·Today·Diary·Reading 이동/모바일 레이아웃.
- 임시 로그인 계정으로 배포된 parse-schedule 실제 호출 통과: 화/목/금 3개, 화요일 종료 13:00, 목·금 종료 null, 해당 요일 날짜 확인. 일정 DB 쓰기 0건, 테스트 계정 정리 완료. 기존 사용자 계정 및 일정 변경 없음.
- parse-schedule 배포 완료. DB 스키마 변경 없음. 프런트엔드 호스팅은 배포하지 않음.

## 사용 시 확인

목·금 종료가 오후 6시라면 미리보기에서 18:00으로 지정한 후 저장한다. 첫 날짜와 매주 반복을 사용자가 확인한다. AI가 반환한 임의의 날짜·근거를 그대로 수용하지 않는다. 이번 제한된 주간 목록 외의 부정확한 AI 응답은 계속 차단한다.

구조화 출력에도 의미상 오류가 있을 수 있으므로 앱 검증을 유지한다: [OpenAI 공식 문서](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
