import { addDays, formatISODate } from '../../utils/src/date.ts'
import { findDatePhrases } from './parse.ts'

/**
 * Rule layer of intent analysis: one utterance → several intents (create, change, cancel, record).
 * It only reads the text. Finding the existing schedule an intent points at, and deciding whether a
 * change may run without confirmation, happens in the app with the user's saved items.
 */
export type IntentKind = 'create_event' | 'create_task' | 'modify' | 'cancel' | 'memo' | 'diary' | 'anchor'
/** Routines usually named by what happens at their edge (퇴근 → work ends) rather than by title. */
export type RoutineFamily = 'work' | 'school'
/** A clock as said. `explicit` is false for "1시" (01:00 or 13:00) and true for 오후 1시 / 13:00. */
export type ClockHint = { hour: number; minute: number; explicit: boolean }
export type IntentScope = 'this' | 'future' | 'all'
export type MissingInfo = 'date' | 'time' | 'target' | 'change'

export type UserIntent = {
  id: string
  kind: IntentKind
  /** The words this intent came from. */
  clause: string
  /** Create: the item title. Others: null. */
  title: string | null
  /** Words naming an existing item; empty when only a routine verb names it. */
  targetTerms: string[]
  family: RoutineFamily | null
  /** The day the clause is about: the new item's day, or the day of the occurrence to change. */
  date: string | null
  dateInherited: boolean
  /** Destination day of a move. */
  newDate: string | null
  start: ClockHint | null
  end: ClockHint | null
  /** Change only one edge: 퇴근/끝나 → end, 출근/등교 → start. */
  boundary: 'start' | 'end' | null
  shiftMinutes: number | null
  scope: IntentScope
  /** The intent this one follows in time ("퇴근하고 데이트"). */
  afterId: string | null
  missing: MissingInfo[]
  source: 'rule' | 'ai'
  /** Context kept off the title: a parenthetical or a situation without a clock ("집 가서", "퇴근 후"). */
  note?: string | null
}

export type IntentExtraction = {
  text: string
  intents: UserIntent[]
  /** Clauses with schedule signals the rules could not classify; the AI layer reads these. */
  unresolved: string[]
  questions: string[]
  source: 'rule' | 'ai'
}

// --- Normalization: colloquial spellings and frequent typos ---

const FIXES: [RegExp, string][] = [
  [/(?<![가-힣])낼\s*모레(?=\s|$|은|도|에|부터|까지)/g, '모레'],
  [/(?<![가-힣])낼(?=\s|$|은|도|에|부터|까지)/g, '내일'],
  // 모래 (sand) stays unless a clock, part of day or particle follows: "모래 3시", "모래까지".
  [/(?<![가-힣])모래(?=\s*(?:오전|오후|아침|점심|저녁|밤|새벽|\d)|$|에|는|도|까지|부터)/g, '모레'],
  [/(?<![가-힣])담\s*주/g, '다음 주'],
  [/(?<![가-힣])담\s*달/g, '다음 달'],
  [/(?<![가-힣])담\s*날/g, '다음 날'],
  [/이번\s*쭈|이번\s*쥬/g, '이번 주'],
  [/([월화수목금토일])욜/g, '$1요일'],
  [/(\d{1,2})\s*시반/g, '$1시 반'],
  [/(\d{1,2})\s*씨(?=\s|$|에|로|부터|까지)/g, '$1시'],
  // 나구/가구 only after a stem (만나구, 나가구); a bare 가구 is furniture.
  [/(하|끝나|마치|(?<=[가-힣])나|(?<=[가-힣])가)구(?=\s)/g, '$1고'],
  [/됬|됫/g, '됐'],
  [/잇(?=어|음|다|는|고|대)/g, '있'],
  [/(미뤄|바꿔|옮겨|당겨|늦춰|지워|빼|넣어|추가해|취소해)\s*(?:죠|쥬|조|주라|줘요|주세요|주셈|줭)/g, '$1줘'],
  [/(?<![가-힣])(\d{1,2})\s*시\s*(?=퇴근|출근|하교|등교)/g, '$1시 '],
]

export function normalizeUtterance(text: string): string {
  let out = text.trim()
  for (const [pattern, replacement] of FIXES) out = out.replace(pattern, replacement)
  return out.replace(/[ \t]+/g, ' ')
}

// --- Vocabulary. Families and verbs describe meaning, not particular sentences. ---

export const FAMILY_TERMS: Record<RoutineFamily, string[]> = {
  work: ['근로', '근무', '출근', '퇴근', '회사', '직장', '알바', '아르바이트', '업무', '야근', '오피스', '일하기'],
  school: ['수업', '강의', '학교', '등교', '하교', '학원', '교양', '전공', '과외', '레슨'],
}
const FAMILY_VERBS: [RegExp, RoutineFamily][] = [
  [/퇴근|출근|조퇴|야근|근무|근로|알바|회사|직장/, 'work'],
  [/하교|등교|수업|강의|학교|학원/, 'school'],
]
const MEMO = /메모|기록해|기록\s*좀|적어\s*(?:둬|놔|줘|두기|놓기)|기억해\s*(?:둬|줘)|잊지\s*않게/
const CANCEL = /취소|캔슬|cancel|없어졌|없어짐|없던\s*일|휴강|휴무|안\s*(?:가게|하게|하기로|가기로)|못\s*가게|빠지게|빠졌|쉬기로|빼\s*줘|지워\s*줘|삭제/i
const MOVE = /미뤄|미루|연기|늦춰|늦게|당겨|앞당|일찍|옮겨|바꿔|변경|바뀌|바뀜|바꼈|조정/
const END_VERB = /퇴근|조퇴|하교|끝나|끝났|끝난|끝내|마치|마쳐|마친|마침|종료|파하|파해|끝(?=\s*$|\s*(?:이야|이래|임|나고|난))/
const START_VERB = /출근|등교|시작\s*시간|시작(?:을|이)\s/
const TASK_STRONG = /해야|할\s*일|제출|마감|까지|끝내야|완성|사야|챙겨야|신청해야|보내야|내야/
const EVENT = /약속|데이트|회의|미팅|모임|만나|만남|예약|진료|병원|치과|면접|수업|강의|여행|파티|생일|회식|공연|영화|콘서트|레슨|상담|발표|행사|결혼식|식사|스터디|동아리|있어|있음|있다|있대|있네|있어요|잡혔|잡혀|가기로|보기로|만나기로/
const TASK_WEAK = /[가-힣]기(?=\s*$|\s*(?:로|를|도))|하기|할\s*거/
// Work done on something: "발표 숙지" is preparing for a talk, not attending one.
export const TASK_ACTION = /숙지|준비|연습|복습|예습|공부|정리|작성|제작|만들기|만들어|풀기|풀어|조성|구축|세팅|설치|디벨롭|개발|구현|올리기|올려|공유|보내기|읽기|찾기|알아보기|신청|등록|검토/
// A situation that places a task without giving a clock. It is kept as a note and never becomes a time.
const SITUATION = /(?:집\s*(?:에\s*)?(?:가서|가면|와서|오면|들어가서|도착하면)|(?:퇴근|하교|수업|알바|근무|회의)\s*(?:끝나고|끝나면|후에?|하면|길에)|(?:아침|점심|저녁|밥)\s*(?:먹고(?:\s*나서)?|먹은\s*후에?)|자기\s*전에?|일어나서|출근\s*전에?)(?=\s+\S)/
const PAST = /(?:었|았|였|했|웠|났|봤|갔|왔|됐|먹었)(?:다|어|음|네|지|어요|습니다)(?=\s*$|[\s.!?,])/
const FUTURE_SCOPE = /앞으로|계속|부터\s*쭉|이후로?\s*(?:전부|다|계속)|매주\s*(?:바꿔|변경)|다음부터/
const ALL_SCOPE = /전부|모든|항상|매번|반복\s*일정\s*(?:전체|다)/
const REFERENCE = /그거|그것|방금|그\s*일정|이\s*일정|그\s*할\s*일/
const SCHEDULE_SIGNAL = new RegExp([MOVE, CANCEL, END_VERB, START_VERB, TASK_STRONG, EVENT].map(pattern => pattern.source).join('|'), 'i')

// --- Clauses ---

/** `connector` is the verbal ending the clause was cut after ("하고" → "고"); titles drop it. */
type Segment = { text: string; sequential: boolean; connector: string }

const CONJUNCTION = /^(?:그리고|그다음에?|그 다음에?|그러고\s*나서|그 후에?|이후에?)$/
const SEQUENTIAL_CONJUNCTION = /그다음|그 다음|그러고|후|이후/
// Cut after verbal connectors ("퇴근하고 ", "끝난 후 ") so the verb stays with its clause.
const SPLIT = /[,，;\n]+\s*|[.!?]+\s+|\s+(?:그리고|그다음에?|그 다음에?|그러고\s*나서|그 후에?|이후에?)\s+|(?<=(?:하|되|끝나|마치|나|가|오|보|먹|있|없|됐|했|갔|왔|봤|이|만나|쉬|취소되|취소하|(?:옮겨|바꿔|미뤄|당겨|늦춰|지워|빼|넣어|추가해|취소해)\s*주))(?:고\s*나서|고|면|는데|지만|며)\s+|(?<=[가-힣](?:한|난|친|본|간|온|된|은|는))\s*(?:다음|뒤|후)에?\s+/g

function splitClauses(text: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  let sequential = false
  for (const match of text.matchAll(SPLIT)) {
    const raw = match[0]
    const index = match.index ?? 0
    // "(IRIS, 초파리 연구)" describes the clause before it; a comma inside it is not a boundary.
    const before = text.slice(0, index)
    if ((before.match(/[(（]/g) ?? []).length > (before.match(/[)）]/g) ?? []).length) continue
    const verbal = /^(?:고|면|는데|지만|며|\s*(?:다음|뒤|후))/.test(raw)
    const cut = verbal ? index + raw.length : index
    const piece = text.slice(last, cut).trim()
    if (piece) segments.push({ text: piece, sequential, connector: verbal ? raw.trim() : '' })
    const word = raw.trim()
    sequential = verbal ? /나서|면|다음|뒤|후/.test(raw) || /^고/.test(raw) : CONJUNCTION.test(word) && SEQUENTIAL_CONJUNCTION.test(word)
    last = index + raw.length
  }
  const rest = text.slice(last).trim()
  if (rest) segments.push({ text: rest, sequential, connector: '' })
  return segments
}

// --- Clocks ---

type ClockMention = { hint: ClockHint; index: number; length: number; role: 'dest' | 'from' | 'until' | 'plain' }

const AM = /오전|아침|새벽/
const PM = /오후|낮|저녁|밤/
const RANGE = /(오전|오후|아침|새벽|낮|저녁|밤)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:시)?\s*[~〜–-]\s*(오전|오후|아침|새벽|낮|저녁|밤)?\s*(\d{1,2})(?::(\d{2}))?\s*시?/g
const CLOCK = /(오전|오후|아침|새벽|낮|저녁|밤)?\s*(\d{1,2})\s*시(?!간)(?:\s*(반)|\s*(\d{1,2})\s*분)?|(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])|(정오|자정)/g

function hintFrom(meridiem: string | undefined, hour: number, minute: number): ClockHint | null {
  if (hour > 24 || minute > 59) return null
  if (meridiem && AM.test(meridiem)) return hour > 12 ? null : { hour: hour === 12 ? 0 : hour, minute, explicit: true }
  if (meridiem && PM.test(meridiem)) {
    // 밤 12시 is midnight; 낮/오후 12시 is noon.
    if (hour === 12) return { hour: /밤/.test(meridiem) ? 0 : 12, minute, explicit: true }
    return hour > 12 ? { hour, minute, explicit: true } : { hour: hour + 12, minute, explicit: true }
  }
  return { hour: hour === 24 ? 0 : hour, minute, explicit: hour === 0 || hour >= 13 }
}

function roleAfter(text: string, end: number): ClockMention['role'] {
  const tail = text.slice(end)
  if (/^\s*(?:으로|로)(?![가-힣]*\s*시작)/.test(tail)) return 'dest'
  if (/^\s*(?:에\s*)?(?:부터|에서)/.test(tail)) return 'from'
  if (/^\s*(?:에\s*)?까지/.test(tail)) return 'until'
  return 'plain'
}

export function readClocks(text: string): ClockMention[] {
  const mentions: ClockMention[] = []
  const taken: [number, number][] = []
  for (const match of text.matchAll(RANGE)) {
    // "3-4명" or a date like 11-06 is not a time range; a range needs 시 or a colon somewhere.
    if (!/시|:/.test(match[0])) continue
    const index = match.index ?? 0
    const from = hintFrom(match[1], Number(match[2]), Number(match[3] ?? 0))
    const until = hintFrom(match[4] ?? match[1], Number(match[5]), Number(match[6] ?? 0))
    if (!from || !until) continue
    // "9~6시" ends after it starts: 6 means 18:00 when the start has no meridiem either.
    if (!from.explicit && !until.explicit && until.hour <= from.hour && until.hour + 12 < 24) { until.hour += 12; until.explicit = true }
    mentions.push({ hint: from, index, length: 1, role: 'from' }, { hint: until, index: index + 1, length: match[0].length - 1, role: 'until' })
    taken.push([index, index + match[0].length])
  }
  for (const match of text.matchAll(CLOCK)) {
    const index = match.index ?? 0
    if (taken.some(([start, end]) => index >= start && index < end)) continue
    let hint: ClockHint | null
    if (match[7]) hint = { hour: match[7] === '정오' ? 12 : 0, minute: 0, explicit: true }
    else if (match[5]) hint = hintFrom(undefined, Number(match[5]), Number(match[6]))
    else hint = hintFrom(match[1], Number(match[2]), match[3] ? 30 : Number(match[4] ?? 0))
    if (hint) mentions.push({ hint, index, length: match[0].length, role: roleAfter(text, index + match[0].length) })
  }
  return mentions.sort((a, b) => a.index - b.index)
}

/**
 * Picks 01:00 or 13:00 for a bare "1시". An end must come after `after`; a new time lands near
 * `near` (the item's current time). Without context, 1–6시 read as afternoon and are reported.
 */
export function resolveClock(hint: ClockHint, context: { after?: string | null; near?: string | null } = {}): { time: string; guessed: boolean } {
  const format = (hour: number) => `${String(hour).padStart(2, '0')}:${String(hint.minute).padStart(2, '0')}`
  if (hint.explicit || hint.hour === 0 || hint.hour > 12) return { time: format(hint.hour), guessed: false }
  const options = hint.hour === 12 ? [12] : [hint.hour, hint.hour + 12]
  const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
  // The item being changed is the context: an end after its start, a new time near its old one.
  if (context.after) {
    const after = minutes(context.after)
    const pick = options.find(hour => hour * 60 + hint.minute > after)
    if (pick !== undefined) return { time: format(pick), guessed: false }
  }
  if (context.near) {
    const near = minutes(context.near)
    const pick = [...options].sort((a, b) => Math.abs(a * 60 + hint.minute - near) - Math.abs(b * 60 + hint.minute - near))[0]
    return { time: format(pick), guessed: false }
  }
  if (hint.hour >= 7 || hint.hour === 12) return { time: format(hint.hour), guessed: false }
  return { time: format(hint.hour + 12), guessed: true }
}

// --- Shifts: "1시간 미뤄", "30분 당겨", "하루 늦춰" ---

const KOREAN_COUNT: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 반: 0.5 }
const LATER = /미뤄|미루|연기|늦춰|늦게|뒤로/
const EARLIER = /당겨|앞당|일찍|앞으로/

function readShift(text: string): { minutes: number | null; days: number | null } {
  const sign = EARLIER.test(text) && !LATER.test(text) ? -1 : 1
  const hours = /(?:(\d+)|(한|두|세|네|반))\s*시간(?:\s*(반|(\d+)\s*분))?/.exec(text)
  const mins = /(?<![시\d])\s*(\d+)\s*분(?!\s*(?:으로|로|에|부터|까지))/.exec(text)
  let minutes: number | null = null
  if (hours) minutes = Math.round(((hours[1] ? Number(hours[1]) : KOREAN_COUNT[hours[2]]) * 60) + (hours[3] === '반' ? 30 : Number(hours[4] ?? 0)))
  else if (mins && !/\d\s*시\s*\d+\s*분/.test(text)) minutes = Number(mins[1])
  const dayMatch = /(하루|이틀|사흘|일주일|한\s*주|(\d+)\s*일)\s*(?:씩\s*)?(?:더\s*)?(?:만\s*)?(?:미뤄|미루|늦춰|뒤로|연기|당겨|앞당)/.exec(text)
  const days = dayMatch ? ({ 하루: 1, 이틀: 2, 사흘: 3, 일주일: 7 } as Record<string, number>)[dayMatch[1]] ?? (dayMatch[2] ? Number(dayMatch[2]) : 7) : null
  return { minutes: minutes && (LATER.test(text) || EARLIER.test(text)) ? minutes * sign : null, days: days ? days * sign : null }
}

// --- Titles and target words ---

const PREDICATE = /\s*(?:이|가)?\s*(?:있어요|있어|있음|있다|있대|있네|있는데|잡혔어|잡혀\s*있어|잡음|예정이야|예정|해야\s*(?:해|돼|됨|함|한다)|해야지|할\s*거야|가야\s*(?:해|돼)|이야|이에요|예요|하기로\s*했어|하기로|가기로\s*했어|가기로|보기로|만나기로\s*했어|만나기로)\s*[.!?]*$/
const PARTICLE_END = /(?:은|는|이|가|을|를|도|만|에|에서|로|으로|랑|이랑|하고|께서|한테|이래|이야|이라|이에요|이래요|이었어|였어)$/
const STOPWORDS = new Set(['일정', '할일', '거', '것', '좀', '이번', '다음', '주', '시간', '시작', '끝', '날', '오늘', '내일', '모레', '그냥', '꼭', '다시', '만', '때', '전', '후', '쯤', '정도', '그거', '그것', '방금', '그', '이', '저', '나', '내', '우리', '이래', '이야', '이라', '래', '대'])

export function cleanTitle(title: string): string {
  let out = title.trim().replace(/^(?:은|는|에|에는|엔)\s+/, '')
  for (let step = 0; step < 3; step++) out = out.replace(PREDICATE, '').trim()
  // A request to add ("새로 추가", "넣어줘", "등록해 줘") is not part of what is added.
  out = out.replace(/\s*(?:새로\s*)?(?:추가|등록|넣어)(?:해)?\s*(?:줘|주세요|줄래|해\s*줘)?\s*$/, '').trim() || out
  return out.replace(/^(?:에|에는|엔|은|는)\s+/, '').trim() || title.trim()
}

function stripTemporal(text: string, today: Date): string {
  let out = text
  for (const found of findDatePhrases(text, today)) out = out.replace(found.phrase, ' ')
  out = out.replace(RANGE, ' ').replace(CLOCK, ' ')
  return out.replace(/(?:하루|이틀|사흘|일주일|한\s*주|\d+\s*일|(?:\d+|한|두|세|네|반)\s*시간(?:\s*반|\s*\d+\s*분)?|\d+\s*분)/g, ' ')
}

function targetTerms(clause: string, today: Date): string[] {
  const words = stripTemporal(clause, today)
    .replace(new RegExp([MOVE, CANCEL, END_VERB, START_VERB].map(pattern => pattern.source).join('|'), 'gi'), ' ')
    .replace(/(?:해\s*줘|해줘|줘|됐어|됐대|됐음|됐다|되었어|했어|해|돼|됨|하고|하구|고|어|요|으로|로|에서|부터|까지|에)(?=\s|$)/g, ' ')
    .split(/\s+/)
  // A particle is dropped only when a real word remains: 휴가 stays 휴가, 수업은 becomes 수업.
  const bare = (word: string) => { const stripped = word.replace(PARTICLE_END, ''); return stripped.length >= 2 ? stripped : word }
  const terms = words.map(word => bare(word.replace(/[.!?,]/g, ''))).filter(word => word.length >= 2 && !STOPWORDS.has(word) && !/^\d+$/.test(word))
  return [...new Set(terms)]
}

function familyOf(clause: string): RoutineFamily | null {
  return FAMILY_VERBS.find(([pattern]) => pattern.test(clause))?.[1] ?? null
}

function scopeOf(clause: string, today: Date): IntentScope {
  if (ALL_SCOPE.test(clause)) return 'all'
  if (FUTURE_SCOPE.test(clause)) return 'future'
  // "다음 주부터 …" changes the series from that day on; "3시부터" is only a clock.
  if (findDatePhrases(clause, today).some(found => /^\s*부터/.test(clause.slice(found.index + found.phrase.length)))) return 'future'
  return 'this'
}

// --- Classification ---

function classify(clause: string, hasClock: boolean, hasFutureDate: boolean, placed = false): IntentKind | null {
  if (MEMO.test(clause)) return 'memo'
  if (CANCEL.test(clause) && !/해야|하기\b/.test(clause)) return 'cancel'
  if (MOVE.test(clause)) return 'modify'
  if (END_VERB.test(clause) || START_VERB.test(clause)) return hasClock ? 'modify' : 'anchor'
  if (TASK_STRONG.test(clause)) return 'create_task'
  if (PAST.test(clause) && !hasFutureDate) return 'diary'
  if (TASK_ACTION.test(clause) && !hasClock) return 'create_task'
  if (EVENT.test(clause)) return 'create_event'
  if (TASK_WEAK.test(clause)) return 'create_task'
  // "토요일 오전 10시 등산": a named day and an unambiguous clock (오전/오후, 13:00) make an appointment even when the
  // activity is not in the vocabulary. "금요일 3시 도현오빠" (bare hour, just a name) still goes to the AI layer.
  if (placed && hasClock && !PAST.test(clause) && !REFERENCE.test(clause) && !/[?？]\s*$|(?:으로|로)\s*$/.test(clause)) return 'create_event'
  return null
}

function hasSignal(text: string, today: Date): boolean {
  return SCHEDULE_SIGNAL.test(text) || findDatePhrases(text, today).length > 0 || readClocks(text).length > 0
}

/** True when the words talk about a schedule at all: never file them silently as a memo. */
export function hasScheduleSignal(text: string, today = new Date()): boolean {
  return hasSignal(normalizeUtterance(text), today)
}

function shiftWeek(date: string, phrase: string): string | null {
  if (!/^(?:이번|다음)\s*주$/.test(phrase.trim())) return null
  const day = new Date(`${date}T00:00:00`)
  return formatISODate(addDays(day, /다음/.test(phrase) ? 7 : 0))
}

export function extractIntents(input: string, today: Date): IntentExtraction {
  const text = normalizeUtterance(input)
  const intents: UserIntent[] = []
  const unresolved: string[] = []
  const questions: string[] = []
  let contextDate: string | null = null
  let carry = ''
  let previous: UserIntent | null = null
  const segments = splitClauses(text)
  segments.forEach((segment, position) => {
    const clause = carry ? `${carry} ${segment.text}` : segment.text
    const sequential = carry ? false : segment.sequential
    carry = ''
    let dates = findDatePhrases(clause, today)
    const clocks = readClocks(clause)
    const todayISO = formatISODate(today)
    // Notes are read off before classifying: "집 가서 개발 환경 조성" is a task, "(IRIS 연구)" is context.
    const notes: string[] = []
    let body = clause.replace(/\s*[(（]([^()（）]*)[)）]\s*/g, (_, inner: string) => { if (inner.trim()) notes.push(inner.trim()); return ' ' }).trim()
    const situation = clocks.length ? null : SITUATION.exec(body)
    if (situation) { notes.unshift(situation[0].replace(/\s+/g, ' ').trim()); body = (body.slice(0, situation.index) + ' ' + body.slice(situation.index + situation[0].length)).replace(/\s+/g, ' ').trim() }
    const kind = classify(body || clause, clocks.length > 0, dates.some(found => found.date >= todayISO) || /내일|모레|다음|예정|할\s*거/.test(clause), dates.some(found => found.date >= todayISO) && clocks.some(mention => mention.hint.explicit))
    if (!kind) {
      // Context-only words ("이번 주 금요일은", "엄마하고") belong to the clause after them; a clause with its own words does not.
      const contextOnly = !stripTemporal(clause, today).trim() || /(?:은|는|에|에는|엔|하고|랑|이랑|와|과|도)$/.test(clause.trim())
      if (position < segments.length - 1 && !TASK_WEAK.test(clause) && contextOnly) { carry = clause; return }
      if (hasSignal(clause, today) && stripTemporal(clause, today).trim()) unresolved.push(clause)
      if (dates[0]) contextDate = dates[0].date
      return
    }
    // A year-less day ("1월 5일") is the next one for new items, the closest one when it points at a saved
    // schedule, and the last one for a diary line.
    const policy = kind === 'modify' || kind === 'cancel' || kind === 'anchor' ? 'nearest' : kind === 'diary' ? 'past' : null
    if (policy) dates = findDatePhrases(clause, today, policy)
    const destination = dates.find(found => /^\s*(?:으로|로)/.test(clause.slice(found.index + found.phrase.length)))
    const sources = dates.filter(found => found !== destination)
    const ownDate = sources[0]?.date ?? null
    const date = ownDate ?? contextDate
    // A deadline ("일요일까지") belongs to its own item; only a plain day carries over to the next clauses.
    const deadline = !!sources[0] && /^\s*(?:까지|전까지|안에|내로|마감)/.test(clause.slice(sources[0].index + sources[0].phrase.length))
    if (ownDate && !deadline) contextDate = ownDate
    const id = `intent-${intents.length + 1}`
    // A relation only orders things in time; the planner uses it when both land on the same day.
    const after = sequential && previous && (previous.kind === 'modify' || previous.kind === 'anchor' || previous.kind === 'create_event') ? previous.id : null
    const intent: UserIntent = {
      id, kind, clause, title: null, targetTerms: [], family: null, date, dateInherited: !ownDate && !!date,
      newDate: null, start: null, end: null, boundary: null, shiftMinutes: null, scope: scopeOf(clause, today),
      afterId: kind === 'create_event' || kind === 'create_task' ? after : null, missing: [], source: 'rule',
      note: notes.length ? notes.join(' · ') : null,
    }
    if (kind === 'memo' || kind === 'diary') {
      intent.title = clause
    } else if (kind === 'create_event' || kind === 'create_task') {
      const own = segment.connector && body.endsWith(segment.connector) ? body.slice(0, -segment.connector.length).replace(/(?:있|하|이)$/, '') : body
      intent.title = cleanTitle(stripTemporal(own, today).replace(/\s(?:까지|전까지)(?=\s)/g, ' ').replace(/\s+/g, ' ').replace(/^\s*(?:은|는|에|에는|엔|까지|전까지|부터)\s+/, '').replace(/^(?:현재|지금|일단|우선|먼저)\s+/, ''))
      const from = clocks.find(mention => mention.role === 'from') ?? clocks.find(mention => mention.role !== 'until')
      const until = clocks.find(mention => mention.role === 'until')
      intent.start = kind === 'create_event' ? from?.hint ?? null : null
      intent.end = until?.hint ?? null
      // A task needs no day (it is saved undated); an event does.
      if (!date && kind === 'create_event') intent.missing.push('date')
      if (kind === 'create_event' && !intent.start) intent.missing.push('time')
    } else {
      intent.targetTerms = targetTerms(clause, today).filter(term => !REFERENCE.test(term))
      if (REFERENCE.test(clause)) intent.targetTerms = ['@last', ...intent.targetTerms]
      intent.family = familyOf(clause)
      if (kind === 'modify' || kind === 'anchor') intent.boundary = END_VERB.test(clause) ? 'end' : START_VERB.test(clause) ? 'start' : null
      // A bare weekday destination stays in the week of the item it moves ("다음 주 화요일 요가 수요일로" → that week's Wednesday).
      const bareDestination = destination && /^[월화수목금토일]요일$/.test(destination.phrase.trim()) && date
        ? formatISODate(addDays(new Date(`${date}T00:00:00`), ((['일', '월', '화', '수', '목', '금', '토'].indexOf(destination.phrase.trim()[0]) + 6) % 7) - ((new Date(`${date}T00:00:00`).getDay() + 6) % 7)))
        : null
      if (destination) intent.newDate = bareDestination ?? shiftWeek(date ?? todayISO, destination.phrase) ?? destination.date
      if (kind === 'modify') {
        const shift = readShift(clause)
        if (shift.days && date) intent.newDate = formatISODate(addDays(new Date(`${date}T00:00:00`), shift.days))
        else if (shift.days && !date) { intent.newDate = null; intent.shiftMinutes = shift.days * 1440 }
        if (shift.minutes) intent.shiftMinutes = shift.minutes
        const dest = clocks.filter(mention => mention.role === 'dest')
        const range = [clocks.find(mention => mention.role === 'from'), clocks.find(mention => mention.role === 'until')]
        if (range[0] && range[1]) { intent.start = range[0].hint; intent.end = range[1].hint; intent.boundary = null }
        else if (dest.length) {
          if (intent.boundary === 'end') intent.end = dest[0].hint
          else intent.start = dest[0].hint
        } else if (clocks.length && !intent.shiftMinutes) {
          // "1시 퇴근": the clock is the new edge. With two plain clocks the first one names the old time.
          const clock = clocks.at(-1)!.hint
          if (intent.boundary === 'end') intent.end = clock
          else intent.start = clock
        }
        if (!intent.start && !intent.end && !intent.newDate && !intent.shiftMinutes) intent.missing.push('change')
      }
      if (!intent.targetTerms.length && !intent.family) intent.missing.push('target')
    }
    intents.push(intent)
    previous = intent
  })
  if (carry) {
    if (hasSignal(carry, today) && stripTemporal(carry, today).trim()) unresolved.push(carry)
  }
  for (const intent of intents) {
    if (intent.kind === 'create_event' && intent.missing.includes('time')) questions.push(`'${intent.title}' 시간을 알려 주세요.`)
    if (intent.kind === 'modify' && intent.missing.includes('change')) questions.push('어떻게 바꿀지(날짜나 시간) 알려 주세요.')
  }
  return { text, intents, unresolved, questions, source: 'rule' }
}

/** Intent analysis worth a dedicated plan: anything that touches saved items or mixes kinds. */
export function needsIntentPlan(extraction: IntentExtraction): boolean {
  const kinds = new Set(extraction.intents.map(intent => intent.kind))
  if (kinds.has('modify') || kinds.has('cancel')) return true
  const records = kinds.has('memo') || kinds.has('diary')
  // A list of several to-dos is saved item by item, each with its own deadline.
  const tasks = extraction.intents.filter(intent => intent.kind === 'create_task').length
  return (records && extraction.intents.length > 1) || tasks >= 2
}

/** The rules left a schedule-like clause unread; the AI layer should look at the sentence. */
export function needsIntentAI(extraction: IntentExtraction): boolean {
  return extraction.unresolved.length > 0
}
