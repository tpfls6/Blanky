import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hourSegment, layoutTimeline, taskOverlapsEvent, timelineRange } from '../src/utils/scheduleTimeline.ts'

test('duration lines begin and end at minute offsets across hours', () => {
  assert.deepEqual(hourSegment(570, 675, 9), { top: 50, height: 50 })
  assert.deepEqual(hourSegment(570, 675, 10), { top: 0, height: 100 })
  assert.deepEqual(hourSegment(570, 675, 11), { top: 0, height: 25 })
  assert.equal(hourSegment(570, 675, 12), null)
})

test('tasks reserve a neighboring column when their time or displayed row overlaps an event', () => {
  assert.equal(taskOverlapsEvent({ start: 540, end: 1080 }, { start: 660, end: 690 }), true)
  assert.equal(taskOverlapsEvent({ start: 650, end: 670 }, { start: 600, end: 630 }), true)
  assert.equal(taskOverlapsEvent({ start: 540, end: 600 }, { start: 600, end: 660 }), false)
  assert.equal(taskOverlapsEvent({ start: 720, end: 780 }, { start: 600, end: 660 }), false)
})

test('overlap groups reuse columns and later cards expand into free adjacent columns', () => {
  const cards = layoutTimeline([
    { id: 'long', kind: 'event', start: 540, end: 1080 },
    ...['a', 'b', 'c'].map(id => ({ id, kind: 'event', start: 540, end: 600 })),
    { id: 'later', kind: 'task', start: 660, end: 720 },
    { id: 'next', kind: 'task', start: 720, end: 780 },
    { id: 'separate', kind: 'event', start: 1140, end: 1200 },
  ])
  assert.equal(cards.find(card => card.id === 'long')?.column, 0)
  assert.equal(cards.find(card => card.id === 'later')?.span, 3)
  assert.equal(cards.find(card => card.id === 'next')?.column, 1)
  assert.equal(cards.find(card => card.id === 'separate')?.columns, 1)
  for (const a of cards) for (const b of cards) {
    if (a.id === b.id || a.start >= b.end || b.start >= a.end) continue
    assert.ok(a.column + a.span <= b.column || b.column + b.span <= a.column)
  }
})

test('moving and resizing recomputes groups without mutating source data', () => {
  const source = [{ id: 'a', start: 540, end: 600 }, { id: 'b', start: 600, end: 660 }]
  assert.ok(layoutTimeline(source).every(card => card.columns === 1))
  assert.ok(layoutTimeline(source.map(card => card.id === 'a' ? { ...card, end: 630 } : card)).every(card => card.columns === 2))
  assert.ok(layoutTimeline(source.map(card => card.id === 'b' ? { ...card, start: 570 } : card)).every(card => card.columns === 2))
  assert.deepEqual(source, [{ id: 'a', start: 540, end: 600 }, { id: 'b', start: 600, end: 660 }])
})

test('two to four simultaneous items get distinct columns, touching boundaries reuse columns', () => {
  for (const count of [2, 3, 4]) {
    const rows = Array.from({ length: count }, (_, index) => ({ id: String(index), start: 540, end: 600 }))
    const placed = layoutTimeline([...rows, { id: 'after', start: 600, end: 660 }])
    assert.equal(new Set(placed.filter(card => card.id !== 'after').map(card => card.column)).size, count)
    assert.equal(placed.find(card => card.id === 'after')?.columns, 1)
  }
})
test('missing end times use duration and multi-day events clip to the selected day', () => {
  const item = { startTime: '09:30', endTime: null, duration: 90, date: '2026-10-15', endDate: null }
  assert.deepEqual(timelineRange(item, item.date), { start: 570, end: 660 })
  assert.deepEqual(timelineRange({ ...item, endDate: '2026-10-16', endTime: '10:00' }, item.date), { start: 570, end: 1440 })
  assert.deepEqual(timelineRange({ ...item, endDate: '2026-10-16', endTime: '10:00' }, '2026-10-16'), { start: 0, end: 600 })
  assert.equal(timelineRange({ ...item, startTime: null }, item.date), null)
})
