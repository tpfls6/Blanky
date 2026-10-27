import { AppError, mapDbError } from './errors.ts'
import { isRecord, readString } from './guards.ts'

export type ScheduleBatchStatus = 'applied' | 'unchanged'
export type ScheduleBatchGoogle = 'idle' | 'pending' | 'failed'

export type ScheduleBatchResult = {
  status: ScheduleBatchStatus
  deletedIds: string[]
  google: ScheduleBatchGoogle
}

const GOOGLE = new Set<ScheduleBatchGoogle>(['idle', 'pending', 'failed'])
const STATUS = new Set<ScheduleBatchStatus>(['applied', 'unchanged'])

export function parseScheduleBatchResult(value: unknown): ScheduleBatchResult {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '일정 변경에 실패하여 기존 일정이 유지되었습니다.')
  const status = readString(value.status)
  const google = readString(value.google)
  const deletedIds = Array.isArray(value.deletedIds)
    ? value.deletedIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : null
  if (!status || !STATUS.has(status as ScheduleBatchStatus) || !google || !GOOGLE.has(google as ScheduleBatchGoogle) || !deletedIds) {
    throw new AppError('REQUEST_FAILED', '일정 변경에 실패하여 기존 일정이 유지되었습니다.')
  }
  return { status: status as ScheduleBatchStatus, deletedIds, google: google as ScheduleBatchGoogle }
}

export function mapBatchError(error: { message?: string; code?: string }): AppError {
  const message = error.message ?? ''
  if (message.includes('AUTH_REQUIRED')) return new AppError('UNAUTHORIZED', '로그인이 필요합니다.', error)
  if (message.includes('FORBIDDEN')) return new AppError('FORBIDDEN', '다른 사용자의 일정은 변경할 수 없습니다.', error)
  if (message.includes('GOOGLE_PROTECTED')) return new AppError('GOOGLE_PROTECTED', 'Google에서 가져온 일정은 원본을 지우지 않았어요.', error)
  if (message.includes('NOT_FOUND') || message.includes('BATCH_INCOMPLETE')) {
    return new AppError('NOT_FOUND', '일정 변경에 실패하여 기존 일정이 유지되었습니다.', error)
  }
  if (message.includes('IDEMPOTENCY_CONFLICT')) return new AppError('IDEMPOTENCY_CONFLICT', '같은 요청을 다른 내용으로 다시 실행할 수 없습니다.', error)
  if (message.includes('INVALID_INPUT')) return new AppError('INVALID_INPUT', '삭제 대상을 확인해 주세요.', error)
  return mapDbError(error)
}
