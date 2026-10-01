import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { mapDbError } from './errors.ts'

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
