/**
 * Reads a repeat rule from Korean input ("매일", "격주 화요일", "3일마다", "평일마다", "매달 1일", "12월 31일까지 매일").
 * Pure and rule-based, so the same text gives the same rule whether the AI or the local parser read the rest.
 */
export type RecurrenceRule = {
  repeat: 'daily' | 'weekly' | 'monthly'
  repeatDays: number[]
  repeatInterval: number
  /** Last day (inclusive), or null for no end. */
  repeatUntil: string | null
  /** First day the rule fires on or after `today`. */
  start: string
  /** The input with the repeat words removed, for the title. */
  rest: string
}

const DAY_CHARS: Record<string, number> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 7 }
const DAY = 86400000

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function shift(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10)
}
function weekday(day: string): number { return new Date(`${day}T12:00:00Z`).getUTCDay() || 7 }
function validDate(year: number, month: number, day: number): string | null {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value ? value : null
}

/** "월수금", "월·수·금", "화요일과 목요일", "화, 목" → ISO weekdays. */
function readDays(text: string): { days: number[]; match: string } | null {
  const pattern = /([월화수목금토일])(?:요일)?(?:\s*(?:[,·/、]|과|와|이랑|하고|및)?\s*([월화수목금토일])(?:요일)?)*(?:요일)?/g
  for (const match of text.matchAll(pattern)) {
    const word = match[0]
    // A lone weekday needs 요일, so "일" in "매일" or "1일" is never read as Sunday.
    const chars = [...word.replace(/요일/g, '').matchAll(/[월화수목금토일]/g)].map(found => found[0])
    if (chars.length === 1 && !/요일/.test(word)) continue
    const days = [...new Set(chars.map(char => DAY_CHARS[char]))].sort((a, b) => a - b)
    return { days, match: word }
  }
  return null
}

/** "12월 31일까지", "12월 말까지", "2026-12-31까지" → the last day; weekday-only "금요일까지" is a deadline, not an end. */
function readUntil(text: string, today: Date): { until: string; match: string } | null {
  const full = /(\d{4})-(\d{2})-(\d{2})\s*까지/.exec(text)
  if (full) {
    const until = validDate(Number(full[1]), Number(full[2]), Number(full[3]))
    return until ? { until, match: full[0] } : null
  }
  // "이번 달 말까지", "다음 달 말까지": the last day of that month.
  const monthEnd = /(이번|다음)\s*달\s*(?:말|마지막\s*날|끝)\s*까지/.exec(text)
  if (monthEnd) {
    const last = new Date(today.getFullYear(), today.getMonth() + (monthEnd[1] === '다음' ? 2 : 1), 0)
    return { until: iso(last), match: monthEnd[0] }
  }
  const monthDay = /(\d{1,2})\s*월\s*(?:(\d{1,2})\s*일|(말|마지막\s*날))\s*까지/.exec(text)
  if (!monthDay) return null
  const month = Number(monthDay[1])
  let year = today.getFullYear()
  if (month < today.getMonth() + 1) year += 1
  const day = monthDay[2] ? Number(monthDay[2]) : new Date(year, month, 0).getDate()
  const until = validDate(year, month, day)
  return until ? { until, match: monthDay[0] } : null
}

/**
 * First day a repeat may fire: "다음 주부터", "다다음 주부터", "내일부터", "다음 달부터", "12월부터", "12월 3일부터".
 * A month or day without a year is the next one to come (this month counts from today).
 */
function readFrom(text: string, today: Date): { from: string; match: string } | null {
  const found = /((?:이번|다음|다다음)\s*주|내일|모레|글피|(?:이번|다음)\s*달|(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?)\s*부터/.exec(text)
  if (!found) return null
  const now = iso(today)
  const word = found[1].replace(/\s+/g, '')
  const monday = shift(now, 1 - weekday(now))
  let from: string | null = null
  if (word === '이번주') from = now
  else if (word === '다음주') from = shift(monday, 7)
  else if (word === '다다음주') from = shift(monday, 14)
  else if (word === '내일') from = shift(now, 1)
  else if (word === '모레') from = shift(now, 2)
  else if (word === '글피') from = shift(now, 3)
  else if (word === '이번달') from = now
  else if (word === '다음달') from = iso(new Date(today.getFullYear(), today.getMonth() + 1, 1))
  else if (found[2]) {
    const month = Number(found[2])
    const day = found[3] ? Number(found[3]) : 1
    for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
      const candidate = validDate(year, month, day)
      // "11월부터" said in November starts today; a whole month already past is next year's.
      if (candidate && (candidate >= now || (!found[3] && month === today.getMonth() + 1 && year === today.getFullYear()))) { from = candidate >= now ? candidate : now; break }
    }
  }
  return from ? { from, match: found[0] } : null
}

export function readRecurrence(text: string, today: Date): RecurrenceRule | null {
  let rest = text
  const strip = (part: string) => { rest = rest.replace(part, ' ') }
  let repeat: RecurrenceRule['repeat'] | null = null
  let repeatInterval = 1
  let repeatDays: number[] = []
  let monthDay: number | null = null

  const every = /(\d{1,2})\s*(일|주|개월|달)\s*(?:마다|에\s*한\s*번)/.exec(text)
  if (every) {
    repeat = every[2] === '일' ? 'daily' : every[2] === '주' ? 'weekly' : 'monthly'
    repeatInterval = Math.min(99, Math.max(1, Number(every[1])))
    strip(every[0])
  } else if (/격주/.test(text)) {
    repeat = 'weekly'; repeatInterval = 2; strip('격주')
  } else if (/(?:매일|날마다|하루\s*마다|every\s*day)/i.test(text)) {
    repeat = 'daily'; strip(/(?:매일|날마다|하루\s*마다|every\s*day)/i.exec(text)![0])
  } else if (/(?:평일|주중)\s*(?:마다|에|엔|)/.test(text) && /평일|주중/.test(text)) {
    repeat = 'weekly'; repeatDays = [1, 2, 3, 4, 5]; strip(/(?:매주\s*)?(?:평일|주중)\s*(?:마다|에는|엔|에)?/.exec(text)![0])
  } else if (/주말\s*마다|매\s*주말/.test(text)) {
    repeat = 'weekly'; repeatDays = [6, 7]; strip(/주말\s*마다|매\s*주말/.exec(text)![0])
  } else if (/매\s*주|주마다/.test(text)) {
    repeat = 'weekly'; strip(/매\s*주|주마다/.exec(text)![0])
  } else if (/매\s*(?:달|월)|달마다|월마다/.test(text)) {
    repeat = 'monthly'; strip(/매\s*(?:달|월)|달마다|월마다/.exec(text)![0])
  } else {
    // "월수금 운동", "화목마다": two or more weekdays with 마다 read as a weekly rule.
    const days = readDays(text)
    if (days && /마다/.test(text) && (days.days.length > 1 || /요일\s*마다/.test(text))) { repeat = 'weekly'; repeatDays = days.days; strip(days.match); rest = rest.replace(/마다/, ' ') }
  }
  if (!repeat) return null

  if (repeat === 'weekly' && !repeatDays.length) {
    const days = readDays(rest)
    if (days) { repeatDays = days.days; rest = rest.replace(new RegExp(`${days.match}\\s*(?:마다|에는|에|까지)?`), ' ') }
  }
  if (repeat === 'monthly') {
    const date = /(\d{1,2})\s*일(?!\s*마다)/.exec(rest)
    if (date && Number(date[1]) >= 1 && Number(date[1]) <= 31) { monthDay = Number(date[1]); rest = rest.replace(date[0], ' ') }
  }
  const end = readUntil(rest, today)
  if (end) rest = rest.replace(end.match, ' ')
  const begin = readFrom(rest, today)
  if (begin) rest = rest.replace(begin.match, ' ')

  const now = iso(today)
  let start = begin?.from ?? now
  if (repeat === 'weekly' && repeatDays.length) {
    while (!repeatDays.includes(weekday(start))) start = shift(start, 1)
  } else if (repeat === 'monthly' && monthDay) {
    const from = start
    let year = Number(from.slice(0, 4)), month = Number(from.slice(5, 7))
    for (let step = 0; step < 24; step++) {
      const candidate = validDate(year, month, monthDay)
      if (candidate && candidate >= from) { start = candidate; break }
      month += 1
      if (month > 12) { month = 1; year += 1 }
    }
  }
  if (repeat === 'weekly' && !repeatDays.length) repeatDays = [weekday(start)]
  const repeatUntil = end && end.until >= start ? end.until : null
  // Particles and fillers left where the repeat words were ("에", "마다", "씩").
  rest = rest.replace(/(^|\s)(?:마다|에|에는|씩|한\s*번)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()
  return { repeat, repeatDays: repeat === 'weekly' ? repeatDays : [], repeatInterval, repeatUntil, start, rest }
}
