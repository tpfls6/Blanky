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
  if (code === 'PGRST301' || /jwt/i.test(message)) {
    return new AppError('UNAUTHORIZED', '로그인이 필요합니다.', error)
  }
  if (code === 'PGRST116' && notFoundCode) {
    return new AppError(notFoundCode, NOT_FOUND_MESSAGE[notFoundCode] ?? '항목을 찾지 못했습니다.', error)
  }
  return new AppError('REQUEST_FAILED', '요청을 처리하지 못했습니다.', error)
}
