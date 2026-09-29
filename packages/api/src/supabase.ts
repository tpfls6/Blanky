import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type SupabasePublicConfig = {
  url: string
  anonKey: string
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/.test(value)
}

export function isSupabaseConfigValid(config: SupabasePublicConfig): boolean {
  return isHttpUrl(config.url.trim()) && config.anonKey.trim().length > 0
}

/** Shared client factory. Web passes Vite env, mobile passes Expo public env. */
export function createSupabaseClient(
  config: SupabasePublicConfig,
): SupabaseClient | null {
  const url = config.url.trim()
  const anonKey = config.anonKey.trim()
  if (!isHttpUrl(url) || anonKey.length === 0) return null
  return createClient(url, anonKey)
}
