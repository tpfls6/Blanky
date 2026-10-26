import type { IsoDateTime } from '../../../types/src/calendarSync.ts'
import { asIsoDateTime } from '../../../types/src/calendarSync.ts'
import type { TokenSet } from './domain.ts'
import { CalendarSyncError } from './errors.ts'

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const

export const BLANKY_SCHEDULE_EXTENDED_PROPERTY = 'blankyScheduleId' as const

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashOAuthState(state: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state)))
}

export function createOAuthState(): string {
  return crypto.randomUUID()
}

export function consentUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state: input.state,
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
  }).toString()
  return url.toString()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export async function exchangeCode(
  input: { clientId: string; clientSecret: string; redirectUri: string; code: string },
  fetcher: typeof fetch = fetch,
): Promise<TokenSet> {
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      grant_type: 'authorization_code',
    }),
  })
  const body = record(await response.json().catch(() => null))
  if (!response.ok || typeof body.refresh_token !== 'string' || typeof body.access_token !== 'string') {
    throw new CalendarSyncError('GOOGLE_DENIED', 'Google Calendar 권한을 확인하지 못했습니다.', 502)
  }
  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    accessTokenExpiresAt: expiry(body.expires_in),
  }
}

export async function refreshAccessToken(
  input: { clientId: string; clientSecret: string; tokens: TokenSet; now?: Date },
  fetcher: typeof fetch = fetch,
): Promise<TokenSet> {
  const now = input.now ?? new Date()
  if (Date.parse(input.tokens.accessTokenExpiresAt) - now.getTime() > 60_000) return input.tokens
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const body = record(await response.json().catch(() => null))
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new CalendarSyncError('GOOGLE_DENIED', 'Google Calendar 토큰을 갱신하지 못했습니다.', 502)
  }
  return {
    refreshToken: input.tokens.refreshToken,
    accessToken: body.access_token,
    accessTokenExpiresAt: expiry(body.expires_in),
  }
}

function expiry(expiresIn: unknown): IsoDateTime {
  const seconds = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 3600
  return asIsoDateTime(new Date(Date.now() + seconds * 1000).toISOString())
}
