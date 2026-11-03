// Korean public holidays from the official data.go.kr API
// (한국천문연구원 특일 정보 SpcdeInfoService/getRestDeInfo). Runs in the Edge Function only;
// the service key never reaches the browser.

export type HolidayKind = 'public' | 'substitute' | 'temporary'

export type Holiday = {
  /** YYYY-MM-DD */
  date: string
  name: string
  kind: HolidayKind
}

export const HOLIDAY_ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'

export function holidayKind(name: string): HolidayKind {
  if (name.includes('대체')) return 'substitute'
  if (name.includes('임시')) return 'temporary'
  return 'public'
}

export function isHolidayYear(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2000 && value <= 2100
}

/**
 * Normalizes a getRestDeInfo JSON body. `item` is an array, a single object when there is one
 * result, or absent/'' when there are none. Throws on API-level errors so callers keep their cache.
 */
export function parseHolidayResponse(body: unknown): Holiday[] {
  const response = (body as { response?: { header?: { resultCode?: unknown; resultMsg?: unknown }; body?: { items?: unknown } } } | null)?.response
  if (!response?.header) throw new Error('공휴일 API 응답 형식이 올바르지 않습니다.')
  if (String(response.header.resultCode) !== '00') throw new Error(`공휴일 API 오류: ${String(response.header.resultMsg ?? response.header.resultCode)}`)
  const items = response.body?.items
  const raw = items && typeof items === 'object' ? (items as { item?: unknown }).item : undefined
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const seen = new Set<string>()
  const holidays: Holiday[] = []
  for (const entry of list) {
    const { locdate, dateName, isHoliday } = (entry ?? {}) as { locdate?: unknown; dateName?: unknown; isHoliday?: unknown }
    if (isHoliday !== undefined && isHoliday !== 'Y') continue
    const digits = String(locdate ?? '')
    if (!/^\d{8}$/.test(digits) || typeof dateName !== 'string' || !dateName.trim()) continue
    const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    const name = dateName.trim()
    if (seen.has(date + name)) continue
    seen.add(date + name)
    holidays.push({ date, name, kind: holidayKind(name) })
  }
  return holidays.sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name))
}

/** Fetches one year. `serviceKey` is the decoded (일반 인증키 Decoding) key. */
export async function fetchKoreanHolidays(year: number, serviceKey: string, fetcher: typeof fetch = fetch): Promise<Holiday[]> {
  if (!isHolidayYear(year)) throw new Error('연도를 확인해 주세요.')
  const url = new URL(HOLIDAY_ENDPOINT)
  url.searchParams.set('serviceKey', serviceKey)
  url.searchParams.set('solYear', String(year))
  url.searchParams.set('numOfRows', '100')
  url.searchParams.set('_type', 'json')
  const response = await fetcher(url, { headers: { Accept: 'application/json' } })
  const text = await response.text()
  if (!response.ok) throw new Error(`공휴일 API HTTP ${response.status}`)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    // Key/quota errors come back as XML even with _type=json.
    const reason = text.match(/<returnAuthMsg>([^<]+)</)?.[1] ?? text.match(/<resultMsg>([^<]+)</)?.[1]
    throw new Error(`공휴일 API 오류: ${reason ?? '응답을 읽을 수 없습니다.'}`)
  }
  return parseHolidayResponse(body)
}
