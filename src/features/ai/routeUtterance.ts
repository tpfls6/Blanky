import { routeInput } from '../../../packages/parse/src/intentRouter.ts'
import { findDatePhrases, parseKoreanTime } from '../../../packages/parse/src/parse.ts'
import { hasScheduleSignal, normalizeUtterance } from '../../../packages/parse/src/intents.ts'
import { captureIntent } from '../../utils/captureIntent.ts'

export type RecordKind = 'memo' | 'diary' | 'reading'
export type RecordPart = { type: RecordKind; text: string }

/**
 * One routing decision per message, made in one place and in a fixed order:
 * 1. a record (memo, diary, reading) the whole message is about
 * 2. records mixed with schedules ("데미안 50쪽 읽었고 내일 3시 회의"): records saved, the schedule part continues
 * 3. a planning or reschedule request
 * 4. everything else goes to the schedule pipeline (conversationIntent → intents → analysis)
 * `text` is the normalized utterance every later step reads; records keep the user's own words.
 */
export type UtteranceRoute =
  | { kind: 'record'; type: RecordKind; original: string }
  /** `rest` is the schedule part in the user's own words (for retry); `text` is it normalized. */
  | { kind: 'mixed'; records: RecordPart[]; text: string; rest: string; original: string }
  | { kind: 'planner' | 'reschedule'; text: string; original: string }
  | { kind: 'schedule'; text: string; original: string }

export type RouteOptions = {
  /** The capture type the user picked; only 'auto' lets the router file records. */
  type?: string
  /** A follow-up to an open question (dedupe, conflicts) is never sent to the planner. */
  pending?: boolean
  today?: Date
}

// Sentence ends, line breaks, commas, and past-tense connectors ("읽었고", "다녀왔는데") end a part.
const PART_BOUNDARY = /[.!?。\n]+\s*|[,，;]\s*|\s+[/|]\s+|(?<=(?:었|았|였|했|웠|왔|갔|봤|났|됐)(?:고|는데|지만|다|어|음)[ㅋㅎㅠㅜ~!]*)\s+|(?<=(?:읽음|완독))\s+/g
const EXPLICIT_MEMO = /메모|아이디어\s*[:：]|기억해\s*둘|레시피|조리법|요리법/
const PAST_ENDING = /(?:었|았|였|했|웠|났|봤|갔|왔|됐)(?:다|어|음|네|지|어요|습니다|는데|고|지만)?\s*[.!?]*$/
// Past form that still announces something ahead: "내일 회의 잡혔다".
const BOOKED = /잡혔|잡았|생겼|정해졌|예약했|하기로\s*했|가기로\s*했/

function splitParts(text: string): string[] {
  const parts: string[] = []
  let last = 0
  for (const match of text.matchAll(PART_BOUNDARY)) {
    const index = match.index ?? 0
    const piece = text.slice(last, index).trim()
    if (piece) parts.push(piece)
    last = index + match[0].length
  }
  const rest = text.slice(last).trim()
  if (rest) parts.push(rest)
  return parts
}

type PartClass = 'record' | 'schedule' | 'neutral'

function classifyPart(part: string, today: Date): { kind: PartClass; type?: RecordKind } {
  const capture = captureIntent(part).type
  if (capture === 'diary' || capture === 'reading') return { kind: 'record', type: capture }
  if (capture === 'memo' && EXPLICIT_MEMO.test(part)) return { kind: 'record', type: 'memo' }
  if (capture !== 'conversation' || !hasScheduleSignal(part, today)) return { kind: 'neutral' }
  // A schedule part names a day or a clock and is not a story about the past.
  const normalized = normalizeUtterance(part)
  const placed = findDatePhrases(normalized, today).length > 0 || Boolean(parseKoreanTime(normalized))
  if (!placed) return { kind: 'neutral' }
  if (PAST_ENDING.test(normalized) && !BOOKED.test(normalized)) return { kind: 'neutral' }
  return { kind: 'schedule' }
}

/**
 * Records and schedules in one message. Returns null unless at least one part is clearly a record
 * and one clearly a schedule; neutral parts stay with the part before them.
 */
export function splitMixed(original: string, today = new Date()): { records: RecordPart[]; schedule: string } | null {
  const parts = splitParts(original)
  if (parts.length < 2) return null
  const groups: { kind: PartClass; type?: RecordKind; texts: string[] }[] = []
  for (const part of parts) {
    const found = classifyPart(part, today)
    const previous = groups.at(-1)
    if (previous && (found.kind === 'neutral' || (found.kind === previous.kind && found.type === previous.type))) previous.texts.push(part)
    else groups.push({ ...found, texts: [part] })
  }
  // A leading neutral part joins the group after it.
  if (groups.length > 1 && groups[0].kind === 'neutral') groups[1].texts.unshift(...groups.shift()!.texts)
  const records = groups.filter(group => group.kind === 'record')
  const schedules = groups.filter(group => group.kind === 'schedule')
  if (!records.length || !schedules.length) return null
  return {
    records: records.map(group => ({ type: group.type!, text: group.texts.join(' ') })),
    schedule: schedules.map(group => group.texts.join(', ')).join(', '),
  }
}

export function routeUtterance(input: string, options: RouteOptions = {}): UtteranceRoute {
  const original = input.trim()
  const auto = (options.type ?? 'auto') === 'auto'
  const today = options.today ?? new Date()
  if (auto) {
    // An explicit prefix ("일기:", "메모:", "독서:", "아이디어:") files the message as written, up to a hard break:
    // after a line break or " / " a part that is clearly a schedule is its own ("메모: 비번 … / 목요일 10시 미팅").
    // A comma stays inside the record.
    const capture = captureIntent(original)
    const explicit = /^(?:(?:오늘|어제)\s*)?(일기|메모|독서|아이디어)(?:\s*기록)?\s*[:：]/.test(original.trim())
    if (explicit && (capture.type === 'memo' || capture.type === 'diary' || capture.type === 'reading')) {
      const hard = /\s*\n+\s*|\s+[/|]\s+/.exec(original)
      const head = hard ? original.slice(0, hard.index).trim() : ''
      const tail = hard ? original.slice(hard.index + hard[0].length).trim() : ''
      if (head && tail && classifyPart(tail, today).kind === 'schedule') {
        return { kind: 'mixed', records: [{ type: capture.type, text: head }], text: normalizeUtterance(tail), rest: tail, original }
      }
      return { kind: 'record', type: capture.type, original }
    }
    const mixed = splitMixed(original, today)
    if (mixed) return { kind: 'mixed', records: mixed.records, text: normalizeUtterance(mixed.schedule), rest: mixed.schedule, original }
    if (capture.type === 'memo' || capture.type === 'diary' || capture.type === 'reading') return { kind: 'record', type: capture.type, original }
  }
  const text = normalizeUtterance(original)
  const route = routeInput(text).route
  if (!options.pending && (route === 'planner' || route === 'reschedule')) return { kind: route, text, original }
  return { kind: 'schedule', text, original }
}
