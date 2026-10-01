export type SignupInput = {
  name: string
  nickname: string
  email: string
  password: string
  confirm: string
}

export type FieldErrors<T extends string> = Partial<Record<T, string>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailError(email: string): string | null {
  const value = email.trim()
  if (!value) return '이메일을 입력해 주세요.'
  if (!EMAIL.test(value)) return '이메일 형식을 확인해 주세요.'
  return null
}

export function passwordError(password: string): string | null {
  if (!password) return '비밀번호를 입력해 주세요.'
  if (password.length < 8) return '비밀번호는 8자 이상이어야 합니다.'
  return null
}

export function signupErrors(input: SignupInput): FieldErrors<keyof SignupInput> {
  const errors: FieldErrors<keyof SignupInput> = {}
  if (!input.name.trim()) errors.name = '이름을 입력해 주세요.'
  const email = emailError(input.email)
  if (email) errors.email = email
  const password = passwordError(input.password)
  if (password) errors.password = password
  if (!input.confirm) errors.confirm = '비밀번호를 한 번 더 입력해 주세요.'
  else if (input.password !== input.confirm) errors.confirm = '비밀번호가 일치하지 않습니다.'
  return errors
}

export function selfCheckAccount(): void {
  if (!import.meta.env.DEV) return
  const errors = signupErrors({
    name: '',
    nickname: '',
    email: 'not-an-email',
    password: 'short',
    confirm: 'other',
  })
  if (!errors.name || !errors.email || !errors.password || !errors.confirm) throw new Error('signup errors')
  if (signupErrors({ name: '세린', nickname: '', email: 'a@b.co', password: 'longpassword', confirm: 'longpassword' }).name) {
    throw new Error('valid signup')
  }
}
