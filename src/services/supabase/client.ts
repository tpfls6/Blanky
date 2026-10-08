import {
  createSupabaseClient,
  isSupabaseConfigValid,
  type Database,
} from '@blanky/api'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

const config = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
}

export function getSupabasePublicConfig() {
  return { ...config }
}

export const isSupabaseConfigured = isSupabaseConfigValid(config)

export const supabase: SupabaseClient<Database> | null = createSupabaseClient(config)

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.',
    )
  }

  return supabase
}
