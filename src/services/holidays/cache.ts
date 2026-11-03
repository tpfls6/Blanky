import type { Holiday } from '../../../packages/api/src/holidays.ts'

export type { Holiday }

/** Re-check once a day so newly announced 임시공휴일 show up without a manual refresh. */
export const HOLIDAY_TTL = 24 * 60 * 60 * 1000

type HolidayStorage = Pick<Storage, 'getItem' | 'setItem'>

export type HolidayCacheEntry = { fetchedAt: number; holidays: Holiday[] }

export type HolidayYear = {
  holidays: Holiday[]
  source: 'cache' | 'api' | 'stale' | 'none'
  error?: string
}

export function holidayCacheKey(year: number): string {
  return `blanky.holidays.v1.${year}`
}

function validHoliday(value: unknown): value is Holiday {
  const entry = value as Holiday | null
  return !!entry && typeof entry.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '')
    && ['public', 'substitute', 'temporary'].includes(entry.kind)
}

export function readHolidayCache(storage: HolidayStorage | null, year: number): HolidayCacheEntry | null {
  try {
    const raw = storage?.getItem(holidayCacheKey(year))
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<HolidayCacheEntry>
    if (typeof data.fetchedAt !== 'number' || !Array.isArray(data.holidays)) return null
    return { fetchedAt: data.fetchedAt, holidays: data.holidays.filter(validHoliday) }
  } catch {
    return null
  }
}

export function writeHolidayCache(storage: HolidayStorage | null, year: number, holidays: Holiday[], now: number): void {
  try {
    storage?.setItem(holidayCacheKey(year), JSON.stringify({ fetchedAt: now, holidays }))
  } catch {
    // Storage full or blocked: holidays still show for this session.
  }
}

/**
 * Fresh cache → cache. Otherwise ask the server; on failure fall back to whatever cache exists
 * (even stale) so a flaky API never blanks holidays that were already known.
 * `fetchYear` is null when there is no server (local mode): cache only.
 */
export async function loadHolidayYear(year: number, options: {
  storage: HolidayStorage | null
  fetchYear: ((year: number) => Promise<Holiday[]>) | null
  now?: number
  force?: boolean
}): Promise<HolidayYear> {
  const now = options.now ?? Date.now()
  const cached = readHolidayCache(options.storage, year)
  if (cached && !options.force && now - cached.fetchedAt < HOLIDAY_TTL) return { holidays: cached.holidays, source: 'cache' }
  if (!options.fetchYear) return cached ? { holidays: cached.holidays, source: 'stale' } : { holidays: [], source: 'none' }
  try {
    const holidays = (await options.fetchYear(year)).filter(validHoliday)
    writeHolidayCache(options.storage, year, holidays, now)
    return { holidays, source: 'api' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '공휴일을 불러오지 못했습니다.'
    return cached ? { holidays: cached.holidays, source: 'stale', error: message } : { holidays: [], source: 'none', error: message }
  }
}

export function holidaysByDate(holidays: Iterable<Holiday>): Map<string, Holiday[]> {
  const map = new Map<string, Holiday[]>()
  for (const holiday of holidays) {
    const day = map.get(holiday.date)
    if (!day) map.set(holiday.date, [holiday])
    else if (!day.some((entry) => entry.name === holiday.name)) day.push(holiday)
  }
  return map
}
