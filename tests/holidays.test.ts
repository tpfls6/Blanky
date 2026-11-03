import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchKoreanHolidays, holidayKind, parseHolidayResponse } from '../packages/api/src/holidays.ts'
import { HOLIDAY_TTL, holidayCacheKey, holidaysByDate, loadHolidayYear, readHolidayCache } from '../src/services/holidays/cache.ts'

const ok = (item: unknown) => ({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { items: item === undefined ? '' : { item }, totalCount: 0 } } })

function memory() {
  const data = new Map<string, string>()
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

test('parses statutory, substitute and temporary holidays; skips non-holidays and duplicates', () => {
  const holidays = parseHolidayResponse(ok([
    { dateKind: '01', dateName: '추석', isHoliday: 'Y', locdate: 20261025, seq: 1 },
    { dateKind: '01', dateName: '대체공휴일', isHoliday: 'Y', locdate: 20261027, seq: 1 },
    { dateKind: '01', dateName: '임시공휴일', isHoliday: 'Y', locdate: 20261002, seq: 1 },
    { dateKind: '01', dateName: '추석', isHoliday: 'Y', locdate: 20261025, seq: 1 },
    { dateKind: '02', dateName: '국군의 날', isHoliday: 'N', locdate: 20261001, seq: 1 },
    { dateName: '', isHoliday: 'Y', locdate: 20261003 },
  ]))
  assert.deepEqual(holidays, [
    { date: '2026-10-02', name: '임시공휴일', kind: 'temporary' },
    { date: '2026-10-25', name: '추석', kind: 'public' },
    { date: '2026-10-27', name: '대체공휴일', kind: 'substitute' },
  ])
  assert.equal(holidayKind('기독탄신일'), 'public')
})

test('single item objects and empty bodies parse; API errors throw', () => {
  assert.deepEqual(parseHolidayResponse(ok({ dateName: '신정', isHoliday: 'Y', locdate: 20270101 })), [{ date: '2027-01-01', name: '신정', kind: 'public' }])
  assert.deepEqual(parseHolidayResponse(ok(undefined)), [])
  assert.throws(() => parseHolidayResponse({ response: { header: { resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED ERROR.' } } }), /SERVICE KEY/)
  assert.throws(() => parseHolidayResponse({}), /형식/)
})

test('fetch sends the year and key to data.go.kr and reports XML key errors', async () => {
  let called = ''
  const holidays = await fetchKoreanHolidays(2026, 'secret+key', (async (url: URL) => {
    called = String(url)
    return new Response(JSON.stringify(ok([{ dateName: '삼일절', isHoliday: 'Y', locdate: 20260301 }])))
  }) as typeof fetch)
  assert.equal(holidays[0].name, '삼일절')
  assert.match(called, /^https:\/\/apis\.data\.go\.kr\/B090041\/.+getRestDeInfo\?/)
  assert.equal(new URL(called).searchParams.get('serviceKey'), 'secret+key')
  assert.equal(new URL(called).searchParams.get('solYear'), '2026')
  const xml = '<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>'
  await assert.rejects(fetchKoreanHolidays(2026, 'bad', (async () => new Response(xml)) as typeof fetch), /SERVICE_KEY_IS_NOT_REGISTERED_ERROR/)
  await assert.rejects(fetchKoreanHolidays(1800, 'k'), /연도/)
})

test('cache: fresh cache skips the API, stale cache refreshes, failures fall back to cache', async () => {
  const storage = memory()
  const now = Date.UTC(2026, 9, 29)
  let calls = 0
  const api = async (year: number) => { calls++; return [{ date: `${year}-10-03`, name: '개천절', kind: 'public' as const }] }

  const first = await loadHolidayYear(2026, { storage, fetchYear: api, now })
  assert.equal(first.source, 'api')
  assert.equal(readHolidayCache(storage, 2026)?.holidays[0].name, '개천절')

  const second = await loadHolidayYear(2026, { storage, fetchYear: api, now: now + 1000 })
  assert.equal(second.source, 'cache')
  assert.equal(calls, 1)

  const failing = async () => { throw new Error('502') }
  const stale = await loadHolidayYear(2026, { storage, fetchYear: failing, now: now + HOLIDAY_TTL + 1 })
  assert.equal(stale.source, 'stale')
  assert.equal(stale.holidays[0].name, '개천절')
  assert.equal(stale.error, '502')

  assert.deepEqual(await loadHolidayYear(2027, { storage, fetchYear: failing, now }), { holidays: [], source: 'none', error: '502' })
  assert.equal((await loadHolidayYear(2026, { storage, fetchYear: null, now: now + HOLIDAY_TTL + 1 })).source, 'stale')

  storage.setItem(holidayCacheKey(2028), '{broken')
  assert.equal(readHolidayCache(storage, 2028), null)
})

test('year change loads each year separately and groups by date without duplicates', async () => {
  const storage = memory()
  const seen: number[] = []
  const api = async (year: number) => { seen.push(year); return [{ date: `${year}-01-01`, name: '신정', kind: 'public' as const }] }
  const years = await Promise.all([2026, 2027].map((year) => loadHolidayYear(year, { storage, fetchYear: api })))
  assert.deepEqual(seen, [2026, 2027])
  const byDate = holidaysByDate([...years.flatMap((year) => year.holidays), { date: '2027-01-01', name: '신정', kind: 'public' }])
  assert.deepEqual([...byDate.keys()], ['2026-01-01', '2027-01-01'])
  assert.equal(byDate.get('2027-01-01')?.length, 1)
})

test('holiday copies: only untimed events that restate the holiday are hidden', async () => {
  const { isHolidayCopy } = await import('../src/utils/calendarMonth.ts')
  const base = { kind: 'event' as const, description: '', date: '2026-10-25', startTime: null, endTime: null, duration: null, categoryId: null, priority: 'medium' as const, status: 'todo' as const, dueDate: null, endDate: null, allDay: true, repeat: 'none' as const }
  const chuseok = [{ name: '추석', kind: 'public' as const }]
  assert.equal(isHolidayCopy({ ...base, id: 'g', title: '추석' }, chuseok), true)
  assert.equal(isHolidayCopy({ ...base, id: 'g2', title: ' 추석 연휴 ' }, chuseok), true)
  assert.equal(isHolidayCopy({ ...base, id: 'mine', title: '추석 가족 모임' }, chuseok), false)
  assert.equal(isHolidayCopy({ ...base, id: 'timed', title: '추석', allDay: false, startTime: '10:00' }, chuseok), false)
  assert.equal(isHolidayCopy({ ...base, id: 'sub', title: '대체공휴일(추석)' }, [{ name: '대체공휴일', kind: 'substitute' }]), true)
  assert.equal(isHolidayCopy({ ...base, id: 'none', title: '추석' }, undefined), false)
})
