import assert from 'node:assert/strict'
import test from 'node:test'
import { findConflicts, findDuplicates, type Sighting } from './duplicates.ts'

function event(id: string, title: string, extra: Partial<Sighting> = {}): Sighting {
  return {
    id, title, date: '2026-10-28', startTime: '15:00', endTime: '16:00',
    repeat: 'none', kind: 'event', ...extra,
  }
}

test('same-title same-slot copies are duplicates, work vs class at the same time is a conflict', () => {
  const workA = event('w1', '근로'), workB = event('w2', '근로')
  const classA = event('c1', '수업'), classB = event('c2', '수업')
  const groups = findDuplicates([workA, workB, classA, classB])
  assert.equal(groups.length, 2)
  assert.deepEqual(new Set(groups.map(group => group.title)), new Set(['근로', '수업']))
  for (const group of groups) {
    assert.equal(group.dropIds.length, 1)
    assert.equal(group.confidence, 'safe')
    assert.equal(group.scope, 'occurrence')
  }
  assert.deepEqual(findConflicts([workA, classA]), [
    { aId: 'w1', bId: 'c1', date: '2026-10-28', reason: 'overlap_different_title' },
  ])
})

test('a second run on the kept rows deletes nothing', () => {
  const kept = [event('w1', '근로'), event('c1', '수업')]
  assert.deepEqual(findDuplicates(kept), [])
})

test('google-synced copies stay, the local clone is the drop candidate', () => {
  const local = event('local', '근로')
  const synced = event('sync', '근로', { changeSource: 'calendar_sync' })
  const [group] = findDuplicates([local, synced])
  assert.equal(group.keepId, 'sync')
  assert.deepEqual(group.dropIds, ['local'])
  const edited = event('ext', '근로', { changeSource: 'ai_chat', calendarType: 'external' })
  const [kept] = findDuplicates([local, edited])
  assert.equal(kept.keepId, 'ext')
  assert.equal(kept.confidence, 'safe')
})

test('two synced copies and recurring series need confirmation', () => {
  const synced = findDuplicates([
    event('a', '근로', { changeSource: 'calendar_sync' }),
    event('b', '근로', { changeSource: 'calendar_sync' }),
  ])
  assert.equal(synced[0].confidence, 'confirm')
  const weekly = findDuplicates([
    event('r1', '수업', { repeat: 'weekly', repeatDays: [2] }),
    event('r2', '수업', { repeat: 'weekly', repeatDays: [2], date: '2026-11-04' }),
  ])
  assert.equal(weekly[0].scope, 'series')
  assert.equal(weekly[0].confidence, 'confirm')
})
