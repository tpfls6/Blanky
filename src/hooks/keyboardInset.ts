/** Smaller gaps are browser chrome (address bar, rotation settling), not a keyboard. */
export const KEYBOARD_MIN_INSET = 80

/**
 * Height the soft keyboard covers at the bottom of the layout viewport: what a `position: fixed;
 * bottom: 0` element must rise by to sit just above it. 0 when the browser or WebView already
 * shrank the layout viewport (`resizes-content`, Android `adjustResize`), so nothing lifts twice.
 */
export function keyboardInset(layoutHeight: number, viewportHeight: number, viewportTop: number, min = KEYBOARD_MIN_INSET): number {
  const inset = Math.round(layoutHeight - viewportHeight - viewportTop)
  return inset > min ? inset : 0
}

/** Scroll offset that brings `target` fully inside `box` (both client rects), moving as little as possible. */
export function revealOffset(box: { top: number; bottom: number }, target: { top: number; bottom: number }, margin = 12): number {
  if (target.bottom + margin > box.bottom) return Math.min(target.bottom + margin - box.bottom, Math.max(0, target.top - margin - box.top))
  if (target.top - margin < box.top) return target.top - margin - box.top
  return 0
}
