import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCurrentUserId(
  client: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await client.auth.getSession()
  if (error) throw new Error(error.message)
  return data.session?.user.id ?? null
}

export async function signInWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<void> {
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut()
  if (error) throw new Error(error.message)
}
