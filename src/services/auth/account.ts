import type { User } from '@supabase/supabase-js'
import type { Account } from '../../state/useSession.ts'

export function accountFromAuth(user: User): Account {
  const meta = user.user_metadata
  const name = typeof meta.name === 'string' ? meta.name : typeof meta.full_name === 'string' ? meta.full_name : user.email?.split('@')[0] ?? ''
  return { id: user.id, email: user.email ?? '', name,
    nickname: typeof meta.nickname === 'string' ? meta.nickname : name,
    avatar: typeof meta.avatar === 'string' ? meta.avatar : meta.avatar === undefined && typeof meta.avatar_url === 'string' ? meta.avatar_url : null, password: '' }
}

export function oauthRedirectError(url: URL): string | null {
  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.slice(1))
  const error = query.get('error') ?? hash.get('error')
  if (!error) return null
  const code = query.get('error_code') ?? hash.get('error_code')
  const description = query.get('error_description') ?? hash.get('error_description') ?? ''
  const safeCode = /^[a-z0-9_]{1,64}$/i.test(code ?? '') ? code! : /^[a-z0-9_]{1,64}$/i.test(error) ? error : 'oauth_error'
  const prefix = `Google 로그인 실패 [${safeCode}]: `
  // Classify known provider descriptions, but never echo arbitrary callback data.
  if (/database error saving new user/i.test(description)) return prefix + '서버가 새 사용자를 저장하지 못했습니다. Supabase Auth 로그에서 회원 생성 트리거와 DB 오류를 확인해 주세요.'
  if (/unable to exchange external code|invalid_client|invalid client|invalid_grant/i.test(description)) return prefix + 'Google 인증 코드를 교환하지 못했습니다. Google OAuth Client ID·Secret과 Google에 등록한 Supabase callback URL을 확인해 주세요.'
  const messages: Record<string, string> = {
    bad_oauth_callback: 'Google 인증 응답에 필요한 정보가 없습니다. 새 로그인을 시작하고 OAuth callback 설정을 확인해 주세요.',
    bad_oauth_state: 'Google 인증 상태 정보가 올바르지 않습니다. 로그인 화면에서 다시 시작해 주세요.',
    flow_state_expired: '인증 요청이 만료되었습니다. 로그인 화면에서 다시 시작해 주세요.',
    flow_state_not_found: '인증 요청 정보를 찾지 못했습니다. 로그인 화면에서 다시 시작해 주세요.',
    provider_disabled: 'Supabase에서 Google 제공자가 비활성화되어 있습니다.',
    oauth_provider_not_supported: 'Supabase에서 Google 제공자가 비활성화되어 있습니다.',
    signup_disabled: '서버에서 새 계정 가입이 차단되어 있습니다. Supabase 가입 허용 설정을 확인해 주세요.',
    provider_email_needs_verification: '이메일 확인이 필요합니다. 확인 메일의 링크를 누른 뒤 다시 로그인해 주세요.',
    identity_already_exists: '이 Google 계정이 이미 다른 사용자와 연결되어 있습니다. Supabase 사용자 연결 상태를 확인해 주세요.',
  }
  if (messages[safeCode]) return prefix + messages[safeCode]
  if (error === 'access_denied' || code === 'access_denied') return prefix + 'Google 로그인이 취소되었거나 접근이 거절되었습니다. 다시 시도해 주세요.'
  return prefix + '인증 서버가 실패 응답을 보냈습니다. 정확한 원인은 Supabase Authentication 로그에서 확인해 주세요.'
}

export function authErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === 'invalid_credentials') return '이메일 또는 비밀번호가 올바르지 않습니다. 기존 데모 계정은 서버 계정과 별개이므로 회원가입이 필요할 수 있습니다.'
  if (error.code === 'email_not_confirmed') return '가입 확인 이메일의 링크를 누른 뒤 로그인해 주세요.'
  if (error.code === 'user_already_exists') return '이미 가입된 이메일입니다.'
  if (/fetch|network/i.test(error.message)) return '인증 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.'
  return error.message
}
