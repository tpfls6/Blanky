import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { accountFromAuth, authErrorMessage, oauthRedirectError } from '../services/auth/account.ts'
import { signInWithGoogle as startGoogleSignIn } from '../services/auth/index.ts'
import { getSupabaseClient } from '../services/supabase/client.ts'
import { emailError, passwordError, signupErrors, type SignupInput } from '../utils/account.ts'
import { SessionContext, type Account } from './useSession.ts'
import { retainLegacyLibrary } from '../services/auth/legacyLibrary.ts'

export function RemoteSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  useEffect(() => {
    const client = getSupabaseClient()
    const callbackError = oauthRedirectError(new URL(window.location.href))
    if (callbackError) queueMicrotask(() => { if (!cancelled) setAuthError(callbackError) })
    let cancelled = false
    let generation = 0
    const apply = (authUser: Parameters<typeof accountFromAuth>[0] | null) => {
      if (cancelled) return
      const account = authUser ? accountFromAuth(authUser) : null
      if (account) retainLegacyLibrary(account)
      if (account) setAuthError('')
      setUser(account); setLoading(false)
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      generation += 1
      apply(session?.user ?? null)
    })
    const initial = generation
    void client.auth.getSession().then(({ data, error }) => {
      if (cancelled) return
      if (error && !callbackError) setAuthError(authErrorMessage(error))
      if (generation !== initial) return
      apply(data.session?.user ?? null)
    }).catch(() => {
      if (!cancelled) { setAuthError('로그인 세션을 확인하지 못했습니다. 다시 로그인해 주세요.'); setLoading(false) }
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    try { await startGoogleSignIn(); setAuthError(''); return null }
    catch (error) { return error instanceof Error ? authErrorMessage(error) : 'Google 로그인을 시작하지 못했습니다.' }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const invalid = emailError(email)
    if (invalid) return invalid
    if (!password) return '비밀번호를 입력해 주세요.'
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) return authErrorMessage(error)
      setAuthError('')
      return null
    } catch { return '인증 서버에 연결하지 못했습니다.' }
  }, [])
  const signUp = useCallback(async (input: SignupInput) => {
    const invalid = Object.values(signupErrors(input))[0]
    if (invalid) return invalid
    try {
      const { error } = await getSupabaseClient().auth.signUp({ email: input.email.trim().toLowerCase(), password: input.password,
        options: { data: { name: input.name.trim(), nickname: input.nickname.trim() || input.name.trim() }, emailRedirectTo: window.location.origin } })
      return error ? authErrorMessage(error) : null
    } catch { return '인증 서버에 연결하지 못했습니다.' }
  }, [])
  const signOut = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut()
    if (error) { setAuthError(authErrorMessage(error)); throw error }
  }, [])
  const updateProfile = useCallback(async (patch: Pick<Account, 'name' | 'nickname' | 'email' | 'avatar'>) => {
    if (!user) return '로그인이 필요합니다.'
    if (!patch.name.trim()) return '이름을 입력해 주세요.'
    const invalid = emailError(patch.email)
    if (invalid) return invalid
    try {
      const { error } = await getSupabaseClient().auth.updateUser({
        ...(patch.email.trim().toLowerCase() !== user.email ? { email: patch.email.trim().toLowerCase() } : {}),
        data: { name: patch.name.trim(), nickname: patch.nickname.trim() || patch.name.trim(), avatar: patch.avatar } })
      if (error) return authErrorMessage(error)
      return patch.email.trim().toLowerCase() !== user.email ? '프로필을 저장했습니다. 이메일 변경은 확인 메일의 링크를 눌러 완료해 주세요.' : null
    } catch { return '프로필을 저장하지 못했습니다.' }
  }, [user])
  const changePassword = useCallback(async (current: string, next: string, confirm: string) => {
    if (!user) return '로그인이 필요합니다.'
    const invalid = passwordError(next)
    if (invalid) return invalid
    if (next !== confirm) return '비밀번호가 일치하지 않습니다.'
    if (!current) return '현재 비밀번호를 입력해 주세요.'
    try {
      const { error: check } = await getSupabaseClient().auth.signInWithPassword({ email: user.email, password: current })
      if (check) return '현재 비밀번호를 확인해 주세요.'
      const { error } = await getSupabaseClient().auth.updateUser({ password: next })
      return error ? authErrorMessage(error) : null
    } catch { return '비밀번호를 변경하지 못했습니다.' }
  }, [user])
  return <SessionContext.Provider value={{ user, loading, authError, signIn, signInWithGoogle, signUp, signOut, updateProfile, changePassword,
    hasEmail: () => false, deleteAccount: () => '서버 계정 삭제는 아직 연결되지 않았습니다. Supabase 관리 화면에서 처리해 주세요.' }}>{children}</SessionContext.Provider>
}
