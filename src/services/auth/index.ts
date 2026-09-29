import {
  getCurrentUserId as readCurrentUserId,
  signInWithPassword as signIn,
  signOut as endSession,
} from '@blanky/api'
import { getSupabaseClient } from '../supabase/client.ts'

export async function getCurrentUserId(): Promise<string | null> {
  return readCurrentUserId(getSupabaseClient())
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  await signIn(getSupabaseClient(), email, password)
}

export async function signOut(): Promise<void> {
  await endSession(getSupabaseClient())
}
