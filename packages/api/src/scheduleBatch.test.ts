import assert from 'node:assert/strict'
import test from 'node:test'
import { mapBatchError, parseScheduleBatchResult } from './scheduleBatch.ts'

test('batch result parses applied ids and rejects a partial payload', () => {
  assert.deepEqual(parseScheduleBatchResult({ status: 'applied', deletedIds: ['a', 'b'], google: 'idle' }), {
    status: 'applied',
    deletedIds: ['a', 'b'],
    google: 'idle',
  })
  assert.throws(() => parseScheduleBatchResult({ status: 'applied', google: 'idle' }), /기존 일정이 유지/)
})

test('batch errors name the failure the caller can act on', () => {
  assert.equal(mapBatchError({ message: 'FORBIDDEN' }).code, 'FORBIDDEN')
  assert.equal(mapBatchError({ message: 'GOOGLE_PROTECTED' }).code, 'GOOGLE_PROTECTED')
  assert.equal(mapBatchError({ message: 'AUTH_REQUIRED' }).code, 'UNAUTHORIZED')
  assert.match(mapBatchError({ message: 'NOT_FOUND' }).message, /기존 일정이 유지/)
})
