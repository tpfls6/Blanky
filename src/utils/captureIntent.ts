import { parseDueDate, parseKoreanDate, parseKoreanTime, parseScheduleText } from '../../packages/parse/src/parse.ts'
import { extractIntents, hasScheduleSignal, normalizeUtterance } from '../../packages/parse/src/intents.ts'
import type { ResolvedType } from '../types/records.ts'

export type CaptureIntent = { type: ResolvedType | 'conversation'; needsConfirmation: boolean }

/** An empty analysis is a memo only when nothing in the words talks about a schedule. */
export function shouldSaveAnalysisAsMemo(items: readonly unknown[], text = ''): boolean {
  return items.length === 0 && !hasScheduleSignal(text)
}

export { hasScheduleSignal }

export function captureIntent(content: string): CaptureIntent {
  // Colloquial spellings (낼, 담주, 금욜, 잇어) read like their standard forms.
  const text = normalizeUtterance(content)
  const result = (type: CaptureIntent['type'], needsConfirmation = false): CaptureIntent => ({ type, needsConfirmation })
  // "아이디어: 계획 세워 주는 앱" is a memo even though it mentions planning.
  const explicit = /^(?:(?:오늘|어제)\s*)?(일기|메모|독서|아이디어)(?:\s*기록)?\s*[:：]/.exec(text)
  if (explicit) return result(explicit[1] === '일기' ? 'diary' : explicit[1] === '독서' ? 'reading' : 'memo')
  if (/(?:레시피|조리법|요리법|재료\s*[:：])/.test(text)) return result('memo')
  if (/(?:바꿔|변경해|미뤄|당겨|늦춰|연기|취소|캔슬|휴강|수정해|완료해|완료 처리|삭제해|지워|빼줘|옮겨|남겨|남기|중복|겹치|뭐 있어|보여줘|조회해|알려줘|재배치|계획.*(?:세워|짜|만들)|일정.*(?:짜줘|정리해)|delete|remove|duplicate|overlap|reschedule)/i.test(text)) return result('conversation')
  if (/(?:메모|기억해\s*둘|참고\s*자료|준비물)|아이디어\s*[:：]/.test(text)) return result('memo')
  const today = new Date()
  const leftover = parseScheduleText(text, { today }).draft.title.trim()
  const hasDateCue = Boolean(parseKoreanDate(text, today) || parseDueDate(text, today))
  // A repeat rule with a clock ("매주 월수금 아침 7시 필라테스", "매월 20일 오후 2시 상담") is a schedule
  // even without a calendar date, and even when the activity is 일기 쓰기.
  const repeating = /매일|매주|매달|매월|격주|평일마다|주말마다|[월화수목금토일]+\s*마다|\d{1,2}\s*일마다/.test(text) && Boolean(parseKoreanTime(text) || /아침|저녁|밤|점심/.test(text)) &&
    !/(?:었|았|였|했|웠)(?:다|어|음|네|지|어요|습니다)(?=\s*$|[\s.!?,])/.test(text)
  if (repeating) return result('conversation')
  const timeOnly = Boolean(parseKoreanTime(text)) && !hasDateCue && !leftover
  if (timeOnly) return result('memo')
  // Several things to do in one line ("컴활 풀기, 논문 읽고 …까지 올리기, …") are split and saved one by one.
  const listed = /[,，;\n]/.test(text) && extractIntents(text, today).intents.filter(intent => intent.kind === 'create_task' || intent.kind === 'create_event').length >= 2
  if (listed) return result('conversation')
  const reflection = /(?:일기|기분|감정|느꼈|느낀|힘들|피곤했|지쳤|슬펐|아쉬웠|설렜|즐거웠|행복|뿌듯|속상|우울|감사|재밌었|만났|다녀왔|먹었)/.test(text)
  // A reading record says what was read; "논문 읽기", "읽고 … 올리기", "읽어야" only plan it.
  const past = /(?:었|았|였|했|웠)(?:다|어|음|네|지|어요|습니다)(?=\s*$|[\s.!?,])/.test(text)
  // 독서모임·독서실 are places and gatherings, not a reading log; a date "12/12" is not a page count.
  const reading = /(?:독서(?!\s*(?:모임|실|동아리|토론))|완독|읽었|읽은|읽음|\d+\s*페이지|\d+\s*쪽|\d+\s*\/\s*\d+(?!\d|\s*(?:오전|오후|저녁|아침|밤|\d{1,2}\s*시)))/.test(text) || (/읽고/.test(text) && past)
  const plannedReading = /(?:읽어야|읽기|읽을|읽으려|읽자|까지|해야|[가-힣]기(?=\s*$|\s*[(,]))/.test(text) && !/(?:읽었|읽음|완독|\d+\s*(?:쪽|페이지)까지\s*읽은)/.test(text)
  if (reading && !plannedReading) return result('reading')
  if (reflection) return result(/(?:내일|모레|다음\s*주).*(?:해야|예정|회의|약속|제출|운동)/.test(text) ? 'memo' : 'diary')
  const activity = /(?:일정|회의|약속|예약|미팅|수업|강의|운동|공부|병원|진료|면접|제출|과제|출근|퇴근|근무|알바|등교|하교|끝나고|데이트|모임|만나|만남|여행|식사|요리|장보기|읽기|할\s*일|해야|하기|숙지|올리기|만들기|풀기)/.test(text)
  if (activity) return result('conversation')
  if (hasDateCue && leftover && !/(?:참고|내용|목록|았다|었다|이다|가능하다)/.test(leftover)) return result('conversation')
  return result('memo')
}
