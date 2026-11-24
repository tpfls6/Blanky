import assert from 'node:assert/strict'
import test from 'node:test'
import { createAutosave, memoAutoTitle, type AutosaveStatus } from '../src/pages/Memo/memoAutosave.ts'

const harness = (save: (value: string) => void | Promise<void>) => {
  const statuses: AutosaveStatus[] = []
  const timers: (() => void)[] = []
  const autosave = createAutosave<string>({
    save,
    onStatus: status => statuses.push(status),
    setTimer: run => { timers.push(run); return timers.length as unknown as ReturnType<typeof setTimeout> },
    clearTimer: id => { timers[(id as unknown as number) - 1] = () => {} },
  })
  return { autosave, statuses, fire: () => timers.splice(0).forEach(run => run()) }
}

test('debounces changes into one save of the newest value', async () => {
  const saved: string[] = []
  const { autosave, statuses, fire } = harness(value => { saved.push(value) })
  autosave.change('a')
  autosave.change('ab')
  autosave.change('abc')
  fire()
  assert.equal(await autosave.flush(), true)
  assert.deepEqual(saved, ['abc'])
  assert.equal(statuses.at(-1), 'saved')
})

test('flush saves immediately and a slow older save never lands after a newer one', async () => {
  const saved: string[] = []
  const finish: (() => void)[] = []
  const { autosave } = harness(value => new Promise<void>(resolve => finish.push(() => { saved.push(value); resolve() })))
  autosave.change('old')
  const first = autosave.flush()
  autosave.change('new')
  const second = autosave.flush()
  // Only the first save has started; the newer one waits for it.
  await Promise.resolve()
  assert.equal(finish.length, 1)
  finish[0]()
  await first
  await Promise.resolve()
  finish[1]()
  assert.equal(await second, true)
  assert.deepEqual(saved, ['old', 'new'])
})

test('a failed save is kept for a retry and reported', async () => {
  let fail = true
  const saved: string[] = []
  const { autosave, statuses } = harness(value => { if (fail) throw new Error('offline'); saved.push(value) })
  autosave.change('draft')
  assert.equal(await autosave.flush(), false)
  assert.equal(statuses.at(-1), 'failed')
  assert.equal(autosave.dirty, true)
  fail = false
  assert.equal(await autosave.flush(), true)
  assert.deepEqual(saved, ['draft'])
})

test('stop drops pending changes until resumed', async () => {
  const saved: string[] = []
  const { autosave, fire } = harness(value => { saved.push(value) })
  autosave.change('x')
  autosave.stop()
  autosave.change('y')
  fire()
  await autosave.flush()
  assert.deepEqual(saved, [])
  autosave.resume()
  autosave.change('z')
  await autosave.flush()
  assert.deepEqual(saved, ['z'])
})

test('empty titles fall back to the first body line, then the default', () => {
  assert.equal(memoAutoTitle('  회의 ', '본문', '새 메모'), '회의')
  assert.equal(memoAutoTitle('', '\n  장보기 목록 \n우유', '새 메모'), '장보기 목록')
  assert.equal(memoAutoTitle(' ', '', '새 메모'), '새 메모')
})
