import assert from 'node:assert/strict'
import test from 'node:test'
import { keyboardInset, revealOffset } from '../src/hooks/keyboardInset.ts'

test('keyboard inset is the layout height the visual viewport no longer covers', () => {
  // iOS Safari / Chrome `resizes-visual`: the layout viewport stays, the visual one shrinks.
  assert.equal(keyboardInset(844, 508, 0), 336)
  // The visual viewport scrolled down inside the layout viewport (focused field brought into view).
  assert.equal(keyboardInset(844, 508, 120), 216)
  assert.equal(keyboardInset(844, 507.6, 0), 336)
})

test('no inset without a keyboard or when the WebView already resized', () => {
  assert.equal(keyboardInset(844, 844, 0), 0)
  // Android adjustResize / `resizes-content`: innerHeight shrank with the viewport, nothing to lift.
  assert.equal(keyboardInset(508, 508, 0), 0)
  // Address bar or rotation settling stays under the threshold.
  assert.equal(keyboardInset(844, 780, 0), 0)
  assert.equal(keyboardInset(844, 764, 0), 0)
  assert.equal(keyboardInset(844, 763, 0), 81)
  assert.equal(keyboardInset(844, 900, 0), 0)
})

test('reveal offset scrolls the focused field into its container only as needed', () => {
  const box = { top: 50, bottom: 450 }
  assert.equal(revealOffset(box, { top: 100, bottom: 140 }), 0)
  // Below the visible area: scroll down until its bottom (plus margin) shows.
  assert.equal(revealOffset(box, { top: 500, bottom: 540 }), 102)
  // Above it: scroll up.
  assert.equal(revealOffset(box, { top: 20, bottom: 60 }), -42)
  // Taller than the box (growing memo): keep its top visible instead of its bottom.
  assert.equal(revealOffset(box, { top: 200, bottom: 900 }), 138)
})
