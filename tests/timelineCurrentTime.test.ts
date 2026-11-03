import assert from 'node:assert/strict'
import test from 'node:test'
import { timelineCurrentTime } from '../src/utils/scheduleTimeline.ts'

test('current time uses the same local day as the calendar and an exact minute position', () => {
  assert.deepEqual(timelineCurrentTime('2026-10-29', 420, 1380, new Date(2026, 9, 29, 14, 37)), { minutes: 877, hour: '14:00', label: '14:37' })
})

test('other days and times outside the visible range have no current-time marker', () => {
  const now = new Date(2026, 9, 29, 14, 37)
  assert.equal(timelineCurrentTime('2026-10-28', 0, 1440, now), null)
  assert.equal(timelineCurrentTime('2026-10-30', 0, 1440, now), null)
  assert.equal(timelineCurrentTime('2026-10-29', 900, 1440, now), null)
  assert.equal(timelineCurrentTime('2026-10-29', 0, 840, now), null)
})

test('midnight and range end do not leak a marker into the wrong day or hour', () => {
  assert.equal(timelineCurrentTime('2026-10-29', 0, 1440, new Date(2026, 9, 30, 0, 0)), null)
  assert.equal(timelineCurrentTime('2026-10-30', 0, 1440, new Date(2026, 9, 30, 0, 0))?.label, '00:00')
  assert.equal(timelineCurrentTime('2026-10-29', 420, 1380, new Date(2026, 9, 29, 23, 0)), null)
})
