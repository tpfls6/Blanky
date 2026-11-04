import assert from 'node:assert/strict'
import test from 'node:test'
import { SAVE_FAILED, saveAndClose } from '../src/utils/saveAndClose.ts'

const harness = () => {
  const log: string[] = []
  return { log, lock: { current: false }, options: { close: (value: unknown) => log.push(`close:${String(value)}`), fail: (message: string) => { if (message) log.push(`fail:${message}`) }, busy: (value: boolean) => log.push(`busy:${value}`) } }
}

test('closes only after the save resolves', async () => {
  const { log, lock, options } = harness()
  let finish!: (value: string) => void
  const running = saveAndClose(lock, () => new Promise<string>(resolve => { finish = resolve }), options)
  assert.deepEqual(log, ['busy:true'])
  finish('saved')
  assert.equal(await running, true)
  assert.ok(log.includes('close:saved'))
  assert.equal(lock.current, false)
})

test('keeps the input open and reports the error when the save fails', async () => {
  const { log, lock, options } = harness()
  assert.equal(await saveAndClose(lock, () => Promise.reject(new Error('서버 오류')), options), false)
  assert.ok(log.includes('fail:서버 오류'))
  assert.ok(!log.some(entry => entry.startsWith('close')))
  assert.equal(await saveAndClose(lock, () => null, options), false)
  assert.ok(log.includes(`fail:${SAVE_FAILED}`))
  assert.equal(lock.current, false)
})

test('ignores a second save while the first one runs', async () => {
  const { lock, options } = harness()
  let calls = 0
  let finish!: () => void
  const first = saveAndClose(lock, () => { calls++; return new Promise<boolean>(resolve => { finish = () => resolve(true) }) }, options)
  assert.equal(await saveAndClose(lock, () => { calls++; return true }, options), false)
  finish()
  assert.equal(await first, true)
  assert.equal(calls, 1)
})
