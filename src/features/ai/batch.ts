import type { ScheduleBatchGoogle, ScheduleBatchStatus } from '@blanky/api'

export function describeBatchApply(input: {
  kind: 'dedupe' | 'other'
  status: ScheduleBatchStatus | 'failed' | 'empty'
  deletedCount: number
  google: ScheduleBatchGoogle
}): string {
  if (input.status === 'failed') return '일정 변경에 실패하여 기존 일정이 유지되었습니다.'
  if (input.google === 'pending') return 'Blanky 일정은 정리되었으며 Google Calendar 반영을 확인 중입니다.'
  if (input.google === 'failed') return 'Blanky 일정은 정리되었으나 Google Calendar 반영에 실패했습니다.'
  if (input.status === 'empty' || input.deletedCount === 0) return '추가로 정리할 중복 일정이 없어요.'
  if (input.kind === 'dedupe') return `중복 일정 ${input.deletedCount}건을 정리했습니다.`
  return `일정 ${input.deletedCount}건을 정리했습니다.`
}

export function batchKeyFor(ids: readonly string[], cache: Map<string, string>): string {
  const fingerprint = [...ids].sort().join(',')
  const existing = cache.get(fingerprint)
  if (existing) return existing
  const key = crypto.randomUUID()
  cache.set(fingerprint, key)
  return key
}
