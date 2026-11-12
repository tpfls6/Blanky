import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthFrame } from '../../components/auth/AuthFrame.tsx'
import { TextField } from '../../components/common/TextField.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { useSession } from '../../state/useSession.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { signupErrors, type SignupInput } from '../../utils/account.ts'
import { UNCONFIRMED_MESSAGE } from '../../services/auth/account.ts'

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
        {error === UNCONFIRMED_MESSAGE ? <Link to={ROUTES.signup} state={{ verifyEmail: email.trim().toLowerCase() }} className="block text-sm text-accent-text underline">인증코드 입력하기</Link> : null}
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

/** Seconds before Supabase sends another code (auth.email.max_frequency) and how long a code lives (otp_expiry). */
const RESEND_SECONDS = 60
const CODE_MINUTES = 10

export function SignupPage() {
  const { signUp, verifySignup, resendSignup } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const resumed = (location.state as { verifyEmail?: string } | null)?.verifyEmail ?? ''
  const [form, setForm] = useState<SignupInput>({ name: '', nickname: '', email: resumed, password: '', confirm: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof SignupInput, string>>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  // Set once the account waits for its emailed code. A sign-up resumed from login has no known send time.
  const [pending, setPending] = useState<{ email: string; sentAt: number | null } | null>(resumed ? { email: resumed, sentAt: null } : null)

  const set = (key: keyof SignupInput) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const next = signupErrors(form)
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    const outcome = await signUp(form)
    setBusy(false)
    if ('error' in outcome) {
      setFormError(outcome.error)
      return
    }
    setFormError('')
    if (outcome.next === 'verify' && verifySignup) { setPending({ email: outcome.email, sentAt: Date.now() }); return }
    if (isSupabaseConfigured) navigate(ROUTES.home)
    else navigate(ROUTES.login, { state: { notice: '가입되었습니다. 로그인해 주세요.' } })
  }

  if (pending && verifySignup && resendSignup) {
    return <SignupCode email={pending.email} sentAt={pending.sentAt} verify={verifySignup} resend={resendSignup}
      onSent={() => setPending({ ...pending, sentAt: Date.now() })}
      onVerified={() => navigate(ROUTES.home)}
      onBack={() => { setPending(null); setFormError('') }} />
  }

  return (
    <AuthFrame title="회원가입">
      <form className="space-y-5" onSubmit={submit} noValidate>
        <TextField label="이름" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <TextField label="닉네임" autoComplete="nickname" value={form.nickname} onChange={set('nickname')} placeholder="비워 두면 이름을 사용합니다" />
        <TextField label="이메일" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <TextField label="비밀번호" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
        <TextField label="비밀번호 확인" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        {formError ? <p role="alert" className="text-sm text-red-600">{formError}</p> : null}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? '가입 중…' : isSupabaseConfigured ? '인증코드 받기' : '회원가입'}
        </button>
      </form>
      <p className="mt-8 text-center text-sm text-neutral-500">
        <Link to={ROUTES.login}>로그인으로 돌아가기</Link>
      </p>
    </AuthFrame>
  )
}

function SignupCode({ email, sentAt, verify, resend, onSent, onVerified, onBack }: {
  email: string
  sentAt: number | null
  verify: (email: string, code: string) => Promise<string | null>
  resend: (email: string) => Promise<string | null>
  onSent: () => void
  onVerified: () => void
  onBack: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(sentAt ? `${email}로 6자리 인증코드를 보냈습니다. ${CODE_MINUTES}분 안에 입력해 주세요.` : `${email}로 받은 인증코드를 입력하거나 새 코드를 받아 주세요.`)
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const wait = sentAt ? Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000)) : 0
  const expired = sentAt !== null && now - sentAt > CODE_MINUTES * 60_000

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (expired) { setError('인증코드가 만료되었습니다. 새 코드를 받아 주세요.'); return }
    setBusy('verify'); setError('')
    const message = await verify(email, code)
    setBusy(null)
    if (message) { setError(message); return }
    onVerified()
  }
  const again = async () => {
    if (busy || wait > 0) return
    setBusy('resend'); setError('')
    const message = await resend(email)
    setBusy(null)
    if (message) { setError(message); return }
    setCode('')
    setNotice(`새 인증코드를 보냈습니다. 이전 코드는 더 이상 쓸 수 없습니다. ${CODE_MINUTES}분 안에 입력해 주세요.`)
    onSent()
  }

  return (
    <AuthFrame title="이메일 인증">
      <form className="space-y-5" onSubmit={submit} noValidate data-signup-code>
        <p className="text-sm text-neutral-500" role="status">{notice}</p>
        <TextField label="인증코드" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={value => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="6자리 숫자" />
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" className="btn btn-primary w-full" disabled={busy !== null || code.length !== 6}>
          {busy === 'verify' ? '확인 중…' : '인증하고 시작하기'}
        </button>
      </form>
      <button type="button" className="btn btn-line mt-3 w-full" disabled={busy !== null || wait > 0} onClick={() => void again()}>
        {busy === 'resend' ? '보내는 중…' : wait > 0 ? `인증코드 재발송 (${wait}초)` : '인증코드 재발송'}
      </button>
      <div className="mt-8 flex justify-between text-sm text-neutral-500">
        <button type="button" onClick={onBack}>이메일 다시 입력</button>
        <Link to={ROUTES.login}>로그인으로 돌아가기</Link>
      </div>
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
