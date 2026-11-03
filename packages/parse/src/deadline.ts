import { parseKoreanDate, parseKoreanTime } from './parse.ts'

const day = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s*월\s*\d{1,2}\s*일|오늘|내일|모레|(?:이번\s*주|다음\s*주)?\s*[월화수목금토일]요일)`
const clock = String.raw`(?:(?:오전|오후|저녁|밤)\s*)?(?:\d{1,2}:\d{2}|\d{1,2}\s*시(?:\s*(?:반|\d{1,2}\s*분))?)`
const when = `${day}(?:\\s*${clock})?`
const suffix = new RegExp(`(${when})\\s*(?:전까지|까지|제출\\s*기한|마감)`)
const prefix = new RegExp(`(?:제출\\s*기한|마감)(?:은|는|이)?\\s*[:：]?\\s*(${when})(?:\\s*(?:전까지|까지))?`)

/** Deadline clocks are never scheduled start/end clocks. Unknown deadlines stay unresolved. */
export function readDeadline(text: string, today: Date) {
  if (/부터[\s\S]*까지/.test(text)) return null
  const match = suffix.exec(text) ?? prefix.exec(text)
  if (!match) return /전까지|까지|마감|제출\s*기한/.test(text)
    ? { date: null, time: null, rest: text.replace(/(?:이번\s*주|다음\s*주|주말|이번\s*달|다음\s*달|언젠가|조만간)\s*(?:전까지|까지|마감)/, ' ').replace(new RegExp(`${clock}\\s*(?:전까지|까지|마감)`), ' ').trim(), ambiguous: true } : null
  const phrase = match[1].trim()
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(phrase)?.[0]
  const date = iso ?? parseKoreanDate(phrase, today)
  const valid = date && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  const timePhrase = new RegExp(clock).exec(phrase.replace(new RegExp(`^${day}`), ''))?.[0]
  const ambiguousTime = !!timePhrase && !/오전|오후|저녁|밤|:/.test(timePhrase) && Number(/\d+/.exec(timePhrase)?.[0]) <= 12
  const time = timePhrase && !ambiguousTime ? parseKoreanTime(timePhrase)?.startTime ?? null : null
  return { date: valid ? date : null, time, rest: text.replace(match[0], ' ').trim(), ambiguous: !valid || ambiguousTime || (!!timePhrase && !time) }
}
