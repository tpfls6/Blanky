import { parseDueDate, parseKoreanDate, parseKoreanTime, parseScheduleText } from '../../packages/parse/src/parse.ts'
import type { ResolvedType } from '../types/records.ts'

export type CaptureIntent = { type: ResolvedType | 'conversation'; needsConfirmation: boolean }

export function shouldSaveAnalysisAsMemo(items: readonly unknown[]): boolean {
  return items.length === 0
}

export function captureIntent(content: string): CaptureIntent {
  const text = content.trim()
  const result = (type: CaptureIntent['type'], needsConfirmation = false): CaptureIntent => ({ type, needsConfirmation })
  const explicit = /^(일기|메모|독서)(?:\s*기록)?\s*[:：]/.exec(text)
  if (explicit) return result(explicit[1] === '일기' ? 'diary' : explicit[1] === '독서' ? 'reading' : 'memo')
  if (/(?:레시피|조리법|요리법|재료\s*[:：])/.test(text)) return result('memo')
  if (/(?:바꿔|변경해|미뤄|수정해|완료해|완료 처리|삭제해|지워|빼줘|옮겨|중복|겹치|뭐 있어|보여줘|조회해|알려줘|재배치|계획.*(?:세워|짜|만들)|일정.*(?:짜줘|정리해)|delete|remove|duplicate|overlap|reschedule)/i.test(text)) return result('conversation')
  if (/(?:메모|기억해\s*둘|참고\s*자료|준비물)|아이디어\s*[:：]/.test(text)) return result('memo')
  const today = new Date()
  const leftover = parseScheduleText(text, { today }).draft.title.trim()
  const hasDateCue = Boolean(parseKoreanDate(text, today) || parseDueDate(text, today))
  const timeOnly = Boolean(parseKoreanTime(text)) && !hasDateCue && !leftover
  if (timeOnly) return result('memo')
  const reflection = /(?:일기|기분|감정|느꼈|느낀|힘들|즐거웠|행복|뿌듯|속상|우울|감사|재밌었|만났|다녀왔|먹었)/.test(text)
  const reading = /(?:독서|완독|읽었|읽고|읽은|읽음|\d+\s*페이지|\d+\s*쪽|\d+\s*\/\s*\d+)/.test(text)
  if (reading && !/(?:읽어야|읽기|읽을\s*예정)/.test(text)) return result('reading')
  if (reflection) return result(/(?:내일|모레|다음\s*주).*(?:해야|예정|회의|약속|제출|운동)/.test(text) ? 'memo' : 'diary')
  const activity = /(?:일정|회의|약속|예약|미팅|수업|운동|공부|병원|제출|과제|출근|퇴근|여행|식사|요리|장보기|읽기|할\s*일|해야|하기)/.test(text)
  if (activity) return result('conversation')
  if (hasDateCue && leftover && !/(?:참고|내용|목록|았다|었다|이다|가능하다)/.test(leftover)) return result('conversation')
  return result('memo')
}
