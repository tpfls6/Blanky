import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthFrame } from '../../components/auth/AuthFrame.tsx'
import { TextField } from '../../components/common/TextField.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { useSession } from '../../state/useSession.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { signupErrors, type SignupInput } from '../../utils/account.ts'

export function LoginPage() {
  const { signIn, signInWithGoogle, authError } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const joined = (location.state as { notice?: string } | null)?.notice ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(joined)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  const googleLogin = async () => {
    if (busy || googleBusy) return
    setGoogleBusy(true)
    setError(''); setNotice('')
    try {
      const message = await signInWithGoogle()
      if (message) setError(message)
    } catch { setError('Google 로그인을 시작하지 못했습니다. 다시 시도해 주세요.') }
    finally { setGoogleBusy(false) }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || googleBusy) return
    setBusy(true)
    const message = await signIn(email, password)
    setBusy(false)
    if (message) {
      setError(message)
      return
    }
    navigate(ROUTES.home)
  }

  return (
    <AuthFrame title="로그인">
      <form className="space-y-5" onSubmit={submit} noValidate>
        <TextField label="이메일" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <TextField label="비밀번호" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
        {error || authError ? <p className="text-sm text-red-600">{error || authError}</p> : null}
        {notice ? <p className="text-sm text-neutral-500">{notice}</p> : null}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || googleBusy}>
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => void googleLogin()}
        disabled={busy || googleBusy}
        className="btn btn-line mt-3 w-full"
      >
        {googleBusy ? 'Google로 연결 중…' : 'Google로 계속하기'}
      </button>
      <div className="mt-8 flex justify-between text-sm text-neutral-500">
        <Link to={ROUTES.signup}>회원가입</Link>
        <Link to={ROUTES.forgot}>비밀번호 찾기</Link>
      </div>
    </AuthFrame>
  )
}

export function SignupPage() {
  const { signUp } = useSession()
  const navigate = useNavigate()
  const [form, setForm] = useState<SignupInput>({ name: '', nickname: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof SignupInput, string>>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key: keyof SignupInput) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const next = signupErrors(form)
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    const message = await signUp(form)
    setBusy(false)
    if (message) {
      setFormError(message)
      return
    }
    navigate(ROUTES.login, { state: { notice: isSupabaseConfigured ? '가입 요청이 완료되었습니다. 확인 메일이 도착하면 링크를 누른 뒤 로그인해 주세요.' : '가입되었습니다. 로그인해 주세요.' } })
  }

  return (
    <AuthFrame title="회원가입">
      <form className="space-y-5" onSubmit={submit} noValidate>
        <TextField label="이름" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <TextField label="닉네임" autoComplete="nickname" value={form.nickname} onChange={set('nickname')} placeholder="비워 두면 이름을 사용합니다" />
        <TextField label="이메일" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <TextField label="비밀번호" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
        <TextField label="비밀번호 확인" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? '가입 중…' : '회원가입'}
        </button>
      </form>
      <p className="mt-8 text-sm text-neutral-500">
        <Link to={ROUTES.login}>로그인으로 돌아가기</Link>
      </p>
    </AuthFrame>
  )
}

export function ForgotPage() {
  const { hasEmail } = useSession()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (isSupabaseConfigured) {
      setMessage('서버 계정의 비밀번호 재설정 화면은 아직 연결되지 않았습니다. 계정 관리자에게 재설정을 요청해 주세요.')
      return
    }
    const found = hasEmail(email)
    setMessage(
      found
        ? '등록된 이메일입니다. 데모에서는 재설정 메일을 보내지 않습니다.'
        : '등록되지 않은 이메일입니다.',
    )
  }

  return (
    <AuthFrame title="비밀번호 찾기">
      <form className="space-y-5" onSubmit={submit} noValidate>
        <TextField label="이메일" type="email" autoComplete="email" value={email} onChange={setEmail} />
        {message ? <p className="text-sm text-neutral-500">{message}</p> : null}
        <button type="submit" className="btn btn-primary w-full">
          안내 받기
        </button>
      </form>
      <p className="mt-8 text-sm text-neutral-500">
        <Link to={ROUTES.login}>로그인</Link>
      </p>
    </AuthFrame>
  )
}
