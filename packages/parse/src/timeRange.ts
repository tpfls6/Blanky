/** Explicit clock arithmetic, with visible AM/PM estimates instead of silently choosing them.
 * `bare` also accepts unit-less ranges such as 9to6 or 9-18; callers enable it only where a weekday already marks a schedule. */
export function readSpokenTimeRange(text: string, options: { bare?: boolean } = {}): { range: string; startTime: string; endTime: string | null; durationMinutes: number | null; estimated: boolean; evidenceStart: string; evidenceEnd: string | null } | null {
  const clock = '(?:(오전|오후|저녁|밤)\\s*)?(\\d{1,2})(?::(\\d{2})(?:\\s*분)?|\\s*시(?:\\s*(반|\\d{1,2}\\s*분))?)?'
  const pattern = new RegExp(`(?<![\\d:./-])(${clock})\\s*(?:부터|~|〜|–|-|to)\\s*(${clock})(?![\\d:./])(?:\\s*까지)?`, 'gi')
  let match: RegExpExecArray | null = null
  // A unit-less side is a clock only when the other side or a meridiem makes the range a time range.
  for (const candidate of text.matchAll(pattern)) {
    // 9-18일, 3-5명: a unit-less end followed by a counter is not a clock.
    if (!/시|:/.test(candidate[6]) && /^\s*(?:일|월|년|분|개|명|번|회|차|주|%)/.test(text.slice(candidate.index + candidate[0].length))) continue
    if (/시|:/.test(candidate[1] + candidate[6]) || candidate[2] || candidate[7] || options.bare) { match = candidate; break }
  }
  if (!match) return null
  const minutes = (hour: string, colon: string | undefined, ko: string | undefined, meridiem: string | undefined) => {
    let h = Number(hour)
    const m = colon ? Number(colon) : ko === '반' ? 30 : Number(ko?.replace(/\s*분/, '') ?? 0)
    // 오후 14시 repeats the meridiem on a 24-hour clock; 오전 14시 contradicts itself.
    if (h > 23 || m > 59 || (meridiem === '오전' && h > 12)) return null
    if (meridiem === '오전') h %= 12
    else if (meridiem && h <= 12) h = h % 12 + 12
    return h * 60 + m
  }
  let start = minutes(match[3], match[4], match[5], match[2])
  let end = minutes(match[8], match[9], match[10], match[7])
  if (start === null || end === null) return null
  let estimated = false
  // Common daytime shorthand: 9→6 means a suggested 09:00→18:00, explicitly confirmed in review.
  if (!match[7] && Number(match[8]) < 12 && end <= start && end + 720 > start) { end += 720; estimated = true }
  if (!match[7] && match[2] && match[2] !== '오전' && Number(match[8]) < 12 && end < 720 && end + 720 > start) { end += 720; estimated = true }
  // 3시~5시: no meridiem and both hours fit a 12-hour clock. Suggest daytime (1–6 → afternoon), but only as a confirmed estimate.
  const twelveHour = (hour: string) => !hour.startsWith('0') && Number(hour) >= 1 && Number(hour) <= 12
  if (!estimated && !match[2] && !match[7] && twelveHour(match[3]) && twelveHour(match[8])) {
    if (Number(match[3]) < 7) { start += 720; end += 720 }
    estimated = true
  }
  const format = (value: number) => `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`
  // Unit-less endpoints carry no time cue on their own, so the whole range is their evidence.
  const cue = /시|:|오전|오후|저녁|밤/
  const evidenceStart = cue.test(match[1]) ? match[1] : match[0]
  const evidenceEnd = cue.test(match[6]) ? match[6] : match[0]
  // Overnight needs an explicit end date in the existing review contract.
  return { range: match[0], startTime: format(start), endTime: end > start ? format(end) : null, durationMinutes: end > start ? end-start : null, estimated, evidenceStart, evidenceEnd: end > start ? evidenceEnd : null }
}
