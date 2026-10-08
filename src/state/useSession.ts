import { createContext, useContext } from 'react'
import type { SignupInput } from '../utils/account.ts'

export type Account = {
  id: string
  name: string
  nickname: string
  email: string
  // Legacy browser-only demo accounts; Supabase identities never store a password here.
  password: string
  avatar: string | null
}

export type SessionValue = {
  user: Account | null
  loading?: boolean
  authError?: string
  signUp: (input: SignupInput) => string | null | Promise<string | null>
  signIn: (email: string, password: string) => string | null | Promise<string | null>
  signInWithGoogle: () => string | null | Promise<string | null>
  signOut: () => void | Promise<void>
  hasEmail: (email: string) => boolean
  updateProfile: (patch: Pick<Account, 'name' | 'nickname' | 'email' | 'avatar'>) => string | null | Promise<string | null>
  changePassword: (current: string, next: string, confirm: string) => string | null | Promise<string | null>
  deleteAccount: () => void | string | Promise<void | string>
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('Session missing')
  return value
}
