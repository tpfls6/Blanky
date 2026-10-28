import assert from 'node:assert/strict'
import test from 'node:test'
import { batchKeyFor, describeBatchApply } from './batch.ts'

test('batch copy follows the recorded apply state', () => {
  assert.equal(
    describeBatchApply({ kind: 'dedupe', status: 'applied', deletedCount: 2, google: 'idle' }),
    '중복 일정 2건을 정리했습니다.',
  )
  assert.equal(
    describeBatchApply({ kind: 'dedupe', status: 'failed', deletedCount: 0, google: 'idle' }),
    '일정 변경에 실패하여 기존 일정이 유지되었습니다.',
  )
  assert.equal(
    describeBatchApply({ kind: 'dedupe', status: 'applied', deletedCount: 2, google: 'pending' }),
    'Blanky 일정은 정리되었으며 Google Calendar 반영을 확인 중입니다.',
  )
  assert.equal(
    describeBatchApply({ kind: 'dedupe', status: 'empty', deletedCount: 0, google: 'idle' }),
    '추가로 정리할 중복 일정이 없어요.',
  )
})

test('the same delete set reuses one idempotency key', () => {
  const cache = new Map<string, string>()
  const first = batchKeyFor(['b', 'a'], cache)
  assert.equal(batchKeyFor(['a', 'b'], cache), first)
  assert.notEqual(batchKeyFor(['c'], cache), first)
})
