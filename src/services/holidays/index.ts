import { useEffect, useMemo, useState } from 'react'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'
import { holidaysByDate, loadHolidayYear, readHolidayCache, type Holiday, type HolidayYear } from './cache.ts'

export type { Holiday }

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

async function fetchYear(year: number): Promise<Holiday[]> {
  const result = await getSupabaseClient().functions.invoke('korean-holidays', { body: { year } })
  if (result.error) throw new Error(result.error.message || '공휴일을 불러오지 못했습니다.')
  const holidays = (result.data as { holidays?: unknown } | null)?.holidays
  if (!Array.isArray(holidays)) throw new Error('공휴일 응답 형식이 올바르지 않습니다.')
  return holidays as Holiday[]
}

// One request per year per page load, shared by every calendar on screen.
const inflight = new Map<number, Promise<HolidayYear>>()

export function loadHolidays(year: number): Promise<HolidayYear> {
  let task = inflight.get(year)
  if (!task) {
    task = loadHolidayYear(year, { storage: storage(), fetchYear: isSupabaseConfigured ? fetchYear : null })
    inflight.set(year, task)
    // Failed years may retry on the next month change; successful ones stay memoized.
    void task.then((result) => { if (result.source === 'none' || result.source === 'stale') inflight.delete(year) })
  }
  return task
}

/** Holidays for the given years keyed by YYYY-MM-DD. Cached years render immediately. */
export function useHolidays(years: number[]): Map<string, Holiday[]> {
  const key = [...new Set(years)].sort().join(',')
  const [loaded, setLoaded] = useState<Record<number, Holiday[]>>({})

  useEffect(() => {
    let alive = true
    for (const year of key.split(',').map(Number).filter(Number.isFinite)) {
      void loadHolidays(year).then((result) => {
        if (alive) setLoaded((current) => (current[year] === result.holidays ? current : { ...current, [year]: result.holidays }))
      })
    }
    return () => { alive = false }
  }, [key])

  return useMemo(() => {
    const all: Holiday[] = []
    for (const year of key.split(',').map(Number).filter(Number.isFinite)) {
      all.push(...(loaded[year] ?? readHolidayCache(storage(), year)?.holidays ?? []))
    }
    return holidaysByDate(all)
  }, [key, loaded])
}
