const READING_PREFIX = /^\s*(?:(?:오늘|어제)\s*)?(?:독서|읽은\s*책|책)(?:\s*기록)?\s*[:：]\s*/
const QUOTED_TITLE = /[『「《〈"“'‘]\s*([^』」》〉"”'’]+?)\s*[』」》〉"”'’]/
// "120페이지", "50쪽", "p.120", "p120", "120p"; a range ("50~80쪽", "30페이지에서 75페이지", "120p부터 180p") ends on its last page.
const PAGE = /(?:(\d{1,5})\s*(?:페이지|쪽|p|P)?\s*(?:[~〜\-–]|에서|부터)\s*)?(\d{1,5})\s*(?:페이지|쪽|p\b|P\b)|\b[pP]\.?\s*(\d{1,5})(?:\s*[~〜\-–]\s*(\d{1,5}))?/
const SLASH = /(\d{1,5})\s*\/\s*(\d{1,5})/
const TOTAL = /(?:총|전체)\s*(\d{1,5})\s*(?:페이지|쪽|p\b)|(\d{1,5})\s*(?:페이지|쪽)\s*중/
const FINISHED = /완독|다\s*읽었|다\s*읽음|끝까지\s*읽|마지막\s*(?:장|페이지)까지/
const READ_VERB = /\s*(?:을|를|은|는|도)?\s*(?:완독|다\s*읽|끝까지|마지막\s*(?:장|페이지|쪽)\s*까지|읽었|읽음|읽고|읽는\s*중|읽기\s*시작|읽다).*$/
// Words that place the reading in time, never part of a title.
const LEAD_WORDS = /^(?:(?:오늘|어제|아까|방금|이번\s*주|주말에?|아침에?|점심에?|저녁에?|밤에?|자기\s*전에?|출근길에?|퇴근길에?)\s+)+/

/**
 * Structured fields of a reading record. `note` keeps the user's words; the rest is only what the text states.
 * "독서: 『데미안』 50~120쪽 읽음" → title 데미안, startPage 50, page 120.
 */
export function parseReading(content: string): {
  title: string
  page: number | null
  total: number | null
  note: string
  startPage: number | null
  author: string | null
  finished: boolean
} {
  const note = content.trim()
  const stated = note.replace(READING_PREFIX, '')
  // An author is read only where the text marks one: "(한강)", "한강 작가", "저자는 한강", "by 한강", "한강 지음".
  // "한강 채식주의자" or "X의 Y" give no way to tell name from title, so they are left alone.
  const authorFound = findAuthor(stated)
  const blankSpan = (text: string, span: { index: number; length: number } | null) => span ? text.slice(0, span.index) + ' '.repeat(span.length) + text.slice(span.index + span.length) : text
  const body = blankSpan(stated, authorFound)
  const totalMatch = TOTAL.exec(body)
  // The total ("총 300쪽 중") is not the page reached; blank it before looking for the page.
  const blank = (text: string, match: RegExpExecArray | null) => match ? text.slice(0, match.index) + ' '.repeat(match[0].length) + text.slice(match.index + match[0].length) : text
  const pageSource = blank(body, totalMatch)
  const slash = SLASH.exec(pageSource)
  const pageMatch = slash ? null : PAGE.exec(pageSource)
  const range = pageMatch ? (pageMatch[1] && pageMatch[2] ? [pageMatch[1], pageMatch[2]] : pageMatch[3] && pageMatch[4] ? [pageMatch[3], pageMatch[4]] : null) : null
  const pageText = pageMatch ? pageMatch[2] ?? pageMatch[4] ?? pageMatch[3] : null
  const page = slash ? Number(slash[1]) : pageText ? Number(pageText) : null
  const total = slash ? Number(slash[2]) : totalMatch ? Number(totalMatch[1] ?? totalMatch[2]) : null
  const finished = FINISHED.test(body)
  const quoted = QUOTED_TITLE.exec(body)
  const author = authorFound?.name ?? null
  let title = quoted?.[1]?.trim() ?? ''
  if (!title) {
    // The title is the words before the first number; with numbers first, the words left once they are removed.
    const cuts = [slash?.index, pageMatch?.index, totalMatch?.index].filter((index): index is number => index !== undefined)
    // "불편한 편의점 오늘 다 읽었다! 총 268쪽": the verb and time words before the number are not the title either.
    const before = cuts.length ? body.slice(0, Math.min(...cuts)).replace(LEAD_WORDS, '').replace(READ_VERB, '').replace(/\s+(?:오늘|어제|아까|방금)\s*$/, '').trim() : ''
    const rest = blank(blank(pageSource, slash), pageMatch).replace(/\s+/g, ' ').trim()
    const named = /(?:읽은|읽고\s*있는|읽는)\s+(?!중(?:\s|$|[.!]))([^\s,.!]+(?:\s[^\s,.!]+)?)\s*[.!]*$/.exec(rest)?.[1]
    const head = before || named || rest.replace(/^(?:까지|부터)\s*/, '').replace(READ_VERB, '')
    title = head.replace(/^[\s,.;:·]+/, '').replace(LEAD_WORDS, '').replace(/\((?:저자|지은이)?[^)]*\)\s*$/, '').replace(/(?:저자|지은이|작가)\s*[:：].*$/, '')
      .replace(/\s*(?:을|를|은|는|도|책)\s*$/, '').replace(/[\s.,!~]+$/g, '').trim()
  }
  return { title: title || '제목 없는 책', page, total, note, startPage: range ? Number(range[0]) : null, author, finished }
}

const NAME = String.raw`[가-힣A-Za-z]{2,12}(?:\s[가-힣A-Za-z]{2,12}){0,2}`

/** Where the text marks an author, the name and the words to drop from the title. */
function findAuthor(text: string): { name: string; index: number; length: number } | null {
  const patterns: RegExp[] = [
    // 『데미안』(헤르만 헤세), 채식주의자(한강), 채식주의자 (한강 지음)
    new RegExp(String.raw`\(\s*(${NAME})\s*(?:저|지음|작가|글)?\s*\)`),
    // 정유정 작가 종의 기원, 정유정 작가의 종의 기원
    new RegExp(String.raw`(?:^|(?<=\s))(${NAME})\s*작가(?:님)?(?:의)?(?=\s)`),
    // 저자는 유발 하라리, 저자: 리처드 도킨스, 지은이 김영하, 작가: 한강
    new RegExp(String.raw`(?:저자|지은이|글쓴이)\s*(?:는|은|가|이|[:：])?\s*(${NAME})|작가\s*[:：]\s*(${NAME})`),
    // 파친코 by 이민진
    new RegExp(String.raw`\bby\s+(${NAME})`, 'i'),
    // 노르웨이의 숲 무라카미 하루키 지음
    new RegExp(String.raw`(?:^|(?<=\s))(${NAME})\s+(?:지음|저)(?=\s|$|[,.!])`),
  ]
  for (const pattern of patterns) {
    const found = pattern.exec(text)
    const raw = found?.[1] ?? found?.[2]
    if (!found || !raw) continue
    // The name ends before reading words that may follow it ("저자는 유발 하라리, 넥서스 …" stops at the comma).
    const name = raw.replace(/\s+(?:책|읽음|읽었|완독|오늘|어제)[가-힣]*$/, '').trim()
    if (!name || /\d/.test(name)) continue
    return { name, index: found.index, length: found[0].length }
  }
  return null
}
