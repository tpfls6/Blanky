/** Explicit clock arithmetic, with visible AM/PM estimates instead of silently choosing them. */
export function readSpokenTimeRange(text: string): { range: string; startTime: string; endTime: string | null; durationMinutes: number | null; estimated: boolean; evidenceStart: string; evidenceEnd: string | null } | null {
  const clock = '(?:(오전|오후|저녁|밤)\\s*)?(\\d{1,2})(?::(\\d{2})|\\s*시(?:\\s*(반|\\d{1,2}\\s*분))?)'
  const match = new RegExp(`(${clock})\\s*(?:부터|~|〜|–|-)\\s*(${clock})(?:\\s*까지)?`).exec(text)
  if (!match) return null
  const minutes = (hour: string, colon: string | undefined, ko: string | undefined, meridiem: string | undefined) => {
    let h = Number(hour)
    const m = colon ? Number(colon) : ko === '반' ? 30 : Number(ko?.replace(/\s*분/, '') ?? 0)
    if (h > 23 || m > 59 || (meridiem && h > 12)) return null
    if (meridiem === '오전') h %= 12
    else if (meridiem) h = h % 12 + 12
    return h * 60 + m
  }
  const start = minutes(match[3], match[4], match[5], match[2])
  let end = minutes(match[8], match[9], match[10], match[7])
  if (start === null || end === null) return null
  let estimated = false
  // Common daytime shorthand: 9→6 means a suggested 09:00→18:00, explicitly confirmed in review.
  if (!match[7] && Number(match[8]) < 12 && end <= start && end + 720 > start) { end += 720; estimated = true }
  if (!match[7] && match[2] && match[2] !== '오전' && Number(match[8]) < 12 && end < 720 && end + 720 > start) { end += 720; estimated = true }
  const format = (value: number) => `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`
  // Overnight needs an explicit end date in the existing review contract.
  return { range: match[0], startTime: format(start), endTime: end > start ? format(end) : null, durationMinutes: end > start ? end-start : null, estimated, evidenceStart: match[1], evidenceEnd: end > start ? match[6] : null }
}
