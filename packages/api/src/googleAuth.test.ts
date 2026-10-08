import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { signInWithGoogle } from './auth.ts'
import { accountFromAuth, oauthRedirectError } from '../../../src/services/auth/account.ts'
import type { User } from '@supabase/supabase-js'

const config = { url: 'https://example.supabase.co', anonKey: 'public-test-key' }
test('disabled Google provider stays in app and reports configuration error', async () => {
  let redirected = false
  const client = { auth: { signInWithOAuth: async () => { redirected = true; return { error: null } } } } as unknown as SupabaseClient<Database>
  await assert.rejects(signInWithGoogle(client, config, 'http://localhost:5173/', async () => new Response(JSON.stringify({ external: { google: false } }))), { code: 'GOOGLE_DISABLED' })
  assert.equal(redirected, false)
})
test('enabled Google provider uses correct provider and application return URL', async () => {
  let credentials: unknown
  const client = { auth: { signInWithOAuth: async (value: unknown) => { credentials = value; return { error: null } } } } as unknown as SupabaseClient<Database>
  await signInWithGoogle(client, config, 'http://localhost:5173/', async (url, options) => {
    assert.equal(url, 'https://example.supabase.co/auth/v1/settings')
    assert.deepEqual(options?.headers, { apikey: 'public-test-key' })
    return new Response(JSON.stringify({ external: { google: true } }))
  })
  assert.deepEqual(credentials, { provider: 'google', options: { redirectTo: 'http://localhost:5173/', queryParams: { prompt: 'select_account' } } })
})
test('OAuth settings failures never initiate a redirect', async () => {
  const client = { auth: { signInWithOAuth: async () => { throw new Error('Must not redirect') } } } as unknown as SupabaseClient<Database>
  await assert.rejects(signInWithGoogle(client, config, 'http://localhost:5173/', async () => new Response('', { status: 401 })), { code: 'AUTH_SETTINGS_FAILED' })
  await assert.rejects(signInWithGoogle(client, config, 'http://localhost:5173/', async () => new Response('{}')), { code: 'AUTH_SETTINGS_FAILED' })
})
test('OAuth denial is displayed without echoing sensitive callback parameters', () => {
  assert.match(oauthRedirectError(new URL('http://localhost:5173/#error=access_denied&error_description=private'))!, /취소/)
  assert.match(oauthRedirectError(new URL('http://localhost:5173/?error=server_error'))!, /\[server_error\]/)
  assert.equal(oauthRedirectError(new URL('http://localhost:5173/#access_token=private')), null)
})
test('callback reports database failures separately from token exchange configuration', () => {
  const database = oauthRedirectError(new URL('http://localhost:5173/#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user'))!
  assert.match(database, /\[unexpected_failure\]/)
  assert.match(database, /새 사용자를 저장/)
  assert.doesNotMatch(database, /Redirect URL/)
  const exchange = oauthRedirectError(new URL('http://localhost:5173/#error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code'))!
  assert.match(exchange, /인증 코드를 교환/)
  assert.match(exchange, /Client ID/)
})
test('callback handles expired requests and never reflects arbitrary provider descriptions', () => {
  assert.match(oauthRedirectError(new URL('http://localhost:5173/?error=server_error&error_code=flow_state_expired'))!, /만료/)
  const message = oauthRedirectError(new URL('http://localhost:5173/?error=server_error&error_code=unexpected_failure&error_description=private-secret'))!
  assert.match(message, /\[unexpected_failure\]/)
  assert.doesNotMatch(message, /private-secret/)
})
test('Google profile uses server identity and provider metadata while allowing avatar removal', () => {
  const user = { id: 'google-server-id', email: 'google@example.test', user_metadata: { full_name: 'Google User', avatar_url: 'https://example.test/avatar' } } as User
  const account = accountFromAuth(user)
  assert.equal(account.id, user.id)
  assert.equal(account.name, 'Google User')
  assert.equal(account.avatar, 'https://example.test/avatar')
  assert.equal(account.password, '')
  assert.equal(accountFromAuth({ ...user, user_metadata: { ...user.user_metadata, avatar: null } }).avatar, null)
})
