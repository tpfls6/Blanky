import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import { isRecord } from './guards.ts'
import type { SupabasePublicConfig } from './supabase.ts'

export async function signInWithGoogle(
  client: SupabaseClient<Database>,
  config: SupabasePublicConfig,
  redirectTo: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  // The SDK constructs an authorization URL even for a disabled provider.
  // Check public provider settings before leaving the app so failures stay visible.
  const response = await fetcher(`${config.url.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: config.anonKey }, signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new AppError('AUTH_SETTINGS_FAILED', '인증 설정을 확인하지 못했습니다. Supabase 연결과 API 키를 확인해 주세요.')
  const settings: unknown = await response.json()
  if (!isRecord(settings) || !isRecord(settings.external) || typeof settings.external.google !== 'boolean') {
    throw new AppError('AUTH_SETTINGS_FAILED', 'Google 인증 설정을 읽지 못했습니다. 다시 시도해 주세요.')
  }
  if (!settings.external.google) throw new AppError('GOOGLE_DISABLED', 'Supabase에서 Google 로그인이 꺼져 있습니다. Google 제공자에 OAuth Client ID와 Secret을 등록하고 활성화해 주세요.')
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } },
  })
  if (error) throw error
}

export async function getCurrentUserId(
  client: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await client.auth.getSession()
  if (error) throw mapDbError(error)
  return data.session?.user.id ?? null
}

export async function signInWithPassword(
  client: SupabaseClient<Database>,
  email: string,
  password: string,
): Promise<void> {
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw mapDbError(error)
}

export async function signOut(client: SupabaseClient<Database>): Promise<void> {
  const { error } = await client.auth.signOut()
  if (error) throw mapDbError(error)
}
