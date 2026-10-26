import { createClient } from 'npm:@supabase/supabase-js@2'
import { readCalendarFunctionEnv } from '../../../packages/api/src/calendarSync/env.ts'
import { calendarError } from '../../../packages/api/src/calendarSync/errors.ts'
import { handleCalendarAction } from '../../../packages/api/src/calendarSync/handle.ts'
import { CALENDAR_HEADERS, calendarReply, methodNotAllowed } from '../../../packages/api/src/calendarSync/http.ts'

declare const Deno: {
  serve(handler: (request: Request) => Promise<Response>): void
  env: { get(key: string): string | undefined }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CALENDAR_HEADERS })
  if (request.method !== 'POST') return methodNotAllowed()
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const env = readCalendarFunctionEnv((key) => Deno.env.get(key), token)
  if (!env.ok) return calendarReply(env.body, env.status)
  const userClient = createClient(env.url, env.anon, { global: { headers: { Authorization: `Bearer ${env.token}` } } })
  const { data, error } = await userClient.auth.getUser(env.token)
  if (error || !data.user) return calendarReply({ error: calendarError('UNAUTHENTICATED', '로그인이 필요합니다.') }, 401)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return calendarReply({ error: calendarError('INVALID_COMMAND', '입력을 확인해 주세요.') }, 400)
  }
  const result = await handleCalendarAction({
    userId: data.user.id,
    origin: new URL(request.headers.get('origin') ?? env.url).origin,
    body,
    userClient,
    admin: createClient(env.url, env.service, { auth: { persistSession: false } }),
    google: env.google,
  })
  return calendarReply(result.body, result.status)
})
