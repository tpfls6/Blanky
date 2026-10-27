import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCalendarAction } from './action.ts'
import { createCalendarSyncClient } from './client.ts'
import { readCalendarFunctionEnv } from './env.ts'
import { CalendarSyncError } from './errors.ts'
import { consentUrl, GOOGLE_CALENDAR_SETTINGS_PATH } from './oauth.ts'

test('missing Google Calendar secrets are GOOGLE_ENV_MISSING 503', () => {
  const missing = readCalendarFunctionEnv((key) => {
    if (key === 'SUPABASE_URL') return 'http://127.0.0.1:54321'
    if (key === 'SUPABASE_ANON_KEY') return 'anon'
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service'
    return undefined
  }, 'token')
  assert.equal(missing.ok, false)
  if (missing.ok) return
  assert.equal(missing.status, 503)
  assert.equal(missing.body.error.code, 'GOOGLE_ENV_MISSING')
})

test('missing login is UNAUTHENTICATED 401', () => {
  const missing = readCalendarFunctionEnv(() => undefined, undefined)
  assert.equal(missing.ok, false)
  if (missing.ok) return
  assert.equal(missing.status, 401)
  assert.equal(missing.body.error.code, 'UNAUTHENTICATED')
})

test('invalid command is INVALID_COMMAND', () => {
  assert.throws(() => parseCalendarAction({ type: 'push' }), (error: unknown) => (
    error instanceof CalendarSyncError && error.code === 'INVALID_COMMAND'
  ))
  assert.deepEqual(parseCalendarAction({ type: 'status' }), { type: 'status' })
})

test('OAuth return path is the Google Calendar settings page', () => {
  assert.equal(GOOGLE_CALENDAR_SETTINGS_PATH, '/settings/google-calendar')
})

test('consent URL uses the provided client id and does not invent one', () => {
  const clientId = 'from-env-not-a-builtin'
  const url = new URL(consentUrl({
    clientId,
    redirectUri: 'http://127.0.0.1:54321/functions/v1/google-calendar-oauth',
    state: 'state-1',
  }))
  assert.equal(url.searchParams.get('client_id'), clientId)
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:54321/functions/v1/google-calendar-oauth')
  assert.match(url.searchParams.get('scope') ?? '', /calendar.events/)
})

test('client surfaces CalendarError codes from invoke', async () => {
  const client = {
    functions: {
      async invoke() {
        return { data: { error: { code: 'GOOGLE_ENV_MISSING', message: 'missing' } }, error: null }
      },
    },
  } as unknown as SupabaseClient
  await assert.rejects(createCalendarSyncClient(client).status(), (error: unknown) => (
    error instanceof CalendarSyncError && error.code === 'GOOGLE_ENV_MISSING'
  ))
})

test('client maps gateway NOT_FOUND to GOOGLE_FN_MISSING', async () => {
  const client = {
    functions: {
      async invoke() {
        return {
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: {
              json: async () => ({ code: 'NOT_FOUND', message: 'Requested function was not found' }),
            },
          },
        }
      },
    },
  } as unknown as SupabaseClient
  await assert.rejects(createCalendarSyncClient(client).status(), (error: unknown) => (
    error instanceof CalendarSyncError && error.code === 'GOOGLE_FN_MISSING'
  ))
})
