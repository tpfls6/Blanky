import { fetchKoreanHolidays, isHolidayYear, type Holiday } from '../../../packages/api/src/holidays.ts';
declare const Deno: {
    serve(handler: (request: Request) => Promise<Response>): void;
    env: {
        get(key: string): string | undefined;
    };
};
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
// Per-instance cache: limits calls against the data.go.kr daily quota.
const TTL = 12 * 60 * 60 * 1000;
const cache = new Map<number, { at: number; holidays: Holiday[] }>();
Deno.serve(async (request) => {
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
    if (request.method === 'OPTIONS')
        return new Response('ok', { headers });
    if (request.method !== 'POST')
        return reply({ error: '지원하지 않는 요청입니다.' }, 405);
    let body: { year?: unknown };
    try {
        body = await request.json();
    }
    catch {
        return reply({ error: '입력을 확인해 주세요.' }, 400);
    }
    if (!isHolidayYear(body?.year))
        return reply({ error: '연도를 확인해 주세요.' }, 400);
    const year = body.year;
    const hit = cache.get(year);
    if (hit && Date.now() - hit.at < TTL)
        return reply({ year, holidays: hit.holidays });
    const key = Deno.env.get('HOLIDAY_API_KEY');
    if (!key)
        return reply({ error: '공휴일 API Key가 설정되지 않았습니다. HOLIDAY_API_KEY를 Edge Function Secret에 설정해 주세요.' }, 503);
    try {
        const holidays = await fetchKoreanHolidays(year, key);
        cache.set(year, { at: Date.now(), holidays });
        return reply({ year, holidays });
    }
    catch (error) {
        if (hit)
            return reply({ year, holidays: hit.holidays, stale: true });
        return reply({ error: error instanceof Error ? error.message : '공휴일을 불러오지 못했습니다.' }, 502);
    }
});
