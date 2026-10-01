import { useCallback, useState, type ReactNode } from 'react'
import { emailError, passwordError, signupErrors, type SignupInput } from '../utils/account.ts'
import { libraryKey, SESSION_KEY, USERS_KEY } from './storage.ts'
import { SessionContext, type Account } from './useSession.ts'

function readUsers(): Account[] {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter((item): item is Account => {
      if (!item || typeof item !== 'object') return false
      const account = item as Partial<Account>
      return typeof account.id === 'string' && typeof account.email === 'string' && typeof account.password === 'string'
    })
  } catch {
    return []
  }
}

function writeUsers(users: Account[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function readSessionUser(): Account | null {
  const id = localStorage.getItem(SESSION_KEY)
  if (!id) return null
  return readUsers().find((user) => user.id === id) ?? null
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(readSessionUser)

  const signUp = useCallback((input: SignupInput) => {
    const errors = signupErrors(input)
    const first = Object.values(errors)[0]
    if (first) return first
    const users = readUsers()
    const email = input.email.trim().toLowerCase()
    if (users.some((account) => account.email === email)) return '이미 가입된 이메일입니다.'
    const account: Account = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      nickname: input.nickname.trim() || input.name.trim(),
      email,
      password: input.password,
      avatar: null,
    }
    writeUsers([...users, account])
    return null
  }, [])

  const signIn = useCallback((email: string, password: string) => {
    const format = emailError(email)
    if (format) return format
    if (!password) return '비밀번호를 입력해 주세요.'
    const account = readUsers().find((item) => item.email === email.trim().toLowerCase())
    if (!account || account.password !== password) return '이메일 또는 비밀번호가 올바르지 않습니다.'
    localStorage.setItem(SESSION_KEY, account.id)
    setUser(account)
    return null
  }, [])

  const hasEmail = useCallback((email: string) => {
    return readUsers().some((account) => account.email === email.trim().toLowerCase())
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }, [])

  const updateProfile = useCallback((patch: Pick<Account, 'name' | 'nickname' | 'email' | 'avatar'>) => {
    if (!user) return '로그인이 필요합니다.'
    if (!patch.name.trim()) return '이름을 입력해 주세요.'
    const format = emailError(patch.email)
    if (format) return format
    const email = patch.email.trim().toLowerCase()
    const users = readUsers()
    if (users.some((account) => account.email === email && account.id !== user.id)) {
      return '이미 사용 중인 이메일입니다.'
    }
    const next: Account = {
      ...user,
      name: patch.name.trim(),
      nickname: patch.nickname.trim() || patch.name.trim(),
      email,
      avatar: patch.avatar,
    }
    writeUsers(users.map((account) => (account.id === user.id ? next : account)))
    setUser(next)
    return null
  }, [user])

  const changePassword = useCallback((current: string, next: string, confirm: string) => {
    if (!user) return '로그인이 필요합니다.'
    if (user.password !== current) return '현재 비밀번호가 올바르지 않습니다.'
    const format = passwordError(next)
    if (format) return format
    if (next !== confirm) return '비밀번호가 일치하지 않습니다.'
    const updated = { ...user, password: next }
    writeUsers(readUsers().map((account) => (account.id === user.id ? updated : account)))
    setUser(updated)
    return null
  }, [user])

  const deleteAccount = useCallback(() => {
    if (!user) return
    writeUsers(readUsers().filter((account) => account.id !== user.id))
    localStorage.removeItem(libraryKey(user.id))
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }, [user])

  return (
    <SessionContext.Provider
      value={{ user, signUp, signIn, signOut, hasEmail, updateProfile, changePassword, deleteAccount }}
    >
      {children}
    </SessionContext.Provider>
  )
}
