import type { CalendarError } from '../../../types/src/calendarSync.ts'
import { calendarError } from './errors.ts'

export type GoogleCalendarSecrets = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export type CalendarFunctionEnv =
  | { ok: true; url: string; anon: string; service: string; token: string; google: GoogleCalendarSecrets }
  | { ok: false; status: 401 | 503; body: { error: CalendarError } }

export function readCalendarFunctionEnv(getEnv: (key: string) => string | undefined, token: string | undefined): CalendarFunctionEnv {
  const url = getEnv('SUPABASE_URL')
  const anon = getEnv('SUPABASE_ANON_KEY')
  const service = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!token || !url || !anon || !service) {
    return { ok: false, status: 401, body: { error: calendarError('UNAUTHENTICATED', '로그인이 필요합니다.') } }
  }
  const clientId = getEnv('GOOGLE_CALENDAR_CLIENT_ID')
  const clientSecret = getEnv('GOOGLE_CALENDAR_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return { ok: false, status: 503, body: { error: calendarError('GOOGLE_ENV_MISSING', 'Google Calendar 클라이언트 값이 Edge Function Secret에 없습니다.') } }
  }
  return {
    ok: true,
    url,
    anon,
    service,
    token,
    google: {
      clientId,
      clientSecret,
      redirectUri: getEnv('GOOGLE_CALENDAR_REDIRECT_URI') ?? `${url}/functions/v1/google-calendar-oauth`,
    },
  }
}

export function readGoogleOAuthEnv(getEnv: (key: string) => string | undefined): CalendarFunctionEnv {
  return readCalendarFunctionEnv(getEnv, 'oauth')
}
