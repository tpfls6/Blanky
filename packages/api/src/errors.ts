export class AppError extends Error {
  readonly code: string

  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'AppError'
    this.code = code
  }
}

type DbError = {
  message?: string
  code?: string
}

const NOT_FOUND_MESSAGE: Record<string, string> = {
  CATEGORY_NOT_FOUND: '카테고리를 찾지 못했습니다.',
  CUSTOM_RECORD_NOT_FOUND: '기록을 찾지 못했습니다.',
  CUSTOM_RECORD_TYPE_NOT_FOUND: '기록 템플릿을 찾지 못했습니다.',
  SCHEDULE_NOT_FOUND: '일정을 찾지 못했습니다.',
}

export function mapDbError(error: DbError, notFoundCode?: string): AppError {
  const code = error.code ?? ''
  const message = error.message ?? ''
  if (code === 'PGRST205' || code === '42P01') {
    return new AppError('SCHEMA_MISSING', 'Supabase에 필요한 테이블이 없습니다. 초기 DB 마이그레이션을 적용해 주세요.', error)
  }
  if (code === 'PGRST204' || code === '42703') {
    return new AppError('SCHEMA_OUTDATED', 'Supabase DB 구조가 이전 버전입니다. 누락된 마이그레이션을 적용해 주세요.', error)
  }
  if (/fetch failed|failed to fetch|networkerror/i.test(message)) {
    return new AppError('NETWORK_ERROR', 'Supabase 서버에 연결하지 못했습니다. 네트워크와 서버 주소를 확인해 주세요.', error)
  }
  if (code === 'PGRST301' || /jwt/i.test(message)) {
    return new AppError('UNAUTHORIZED', '로그인이 필요합니다.', error)
  }
  if (code === 'PGRST116' && notFoundCode) {
    return new AppError(notFoundCode, NOT_FOUND_MESSAGE[notFoundCode] ?? '항목을 찾지 못했습니다.', error)
  }
  return new AppError('REQUEST_FAILED', '요청을 처리하지 못했습니다.', error)
}
