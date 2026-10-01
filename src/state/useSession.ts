import { createContext, useContext } from 'react'
import type { SignupInput } from '../utils/account.ts'

export type Account = {
  id: string
  name: string
  nickname: string
  email: string
  // ponytail: plain text in localStorage for the demo. Swap for Supabase Auth before real accounts.
  password: string
  avatar: string | null
}

export type SessionValue = {
  user: Account | null
  signUp: (input: SignupInput) => string | null
  signIn: (email: string, password: string) => string | null
  signOut: () => void
  hasEmail: (email: string) => boolean
  updateProfile: (patch: Pick<Account, 'name' | 'nickname' | 'email' | 'avatar'>) => string | null
  changePassword: (current: string, next: string, confirm: string) => string | null
  deleteAccount: () => void
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('Session missing')
  return value
}
