import { calendarError } from './errors.ts'

export const CALENDAR_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export function calendarReply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CALENDAR_HEADERS })
}

export function methodNotAllowed(): Response {
  return calendarReply({ error: calendarError('INVALID_COMMAND', '지원하지 않는 요청입니다.') }, 405)
}
