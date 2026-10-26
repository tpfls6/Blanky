import { createClient } from 'npm:@supabase/supabase-js@2'
import { readGoogleOAuthEnv } from '../../../packages/api/src/calendarSync/env.ts'
import { CALENDAR_HEADERS, calendarReply } from '../../../packages/api/src/calendarSync/http.ts'
import { exchangeCode, hashOAuthState } from '../../../packages/api/src/calendarSync/oauth.ts'
import { loadConnectionByStateHash, saveConnected } from '../../../packages/api/src/calendarSync/store.ts'
import { asGoogleSub, asUserId } from '../../../packages/types/src/calendarSync.ts'

declare const Deno: {
  serve(handler: (request: Request) => Promise<Response>): void
  env: { get(key: string): string | undefined }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CALENDAR_HEADERS })
  const env = readGoogleOAuthEnv((key) => Deno.env.get(key))
  if (!env.ok) return calendarReply(env.body, env.status)
  const incoming = new URL(request.url)
  const state = incoming.searchParams.get('state') ?? ''
  const code = incoming.searchParams.get('code') ?? ''
  const admin = createClient(env.url, env.service, { auth: { persistSession: false } })
  const connection = state ? await loadConnectionByStateHash(admin, await hashOAuthState(state)) : null
  const origin = connection && connection.status === 'awaiting_consent' ? connection.origin : env.url
  const home = `${origin.replace(/\/$/, '')}/settings/schedule`
  if (incoming.searchParams.get('error') || !code || !connection || connection.status !== 'awaiting_consent') {
    return Response.redirect(home, 302)
  }
  const tokens = await exchangeCode({
    clientId: env.google.clientId,
    clientSecret: env.google.clientSecret,
    redirectUri: env.google.redirectUri,
    code,
  })
  const profile = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })
  const info = record(await profile.json().catch(() => null))
  await saveConnected(admin, {
    id: connection.id,
    userId: asUserId(connection.userId),
    googleSub: asGoogleSub(typeof info.id === 'string' && info.id ? info.id : `google:${connection.id}`),
    accountEmail: typeof info.email === 'string' ? info.email : '',
    tokens,
  })
  return Response.redirect(home, 302)
})
