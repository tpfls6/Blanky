import { useEffect, type RefObject } from 'react'
import { keyboardInset, revealOffset } from './keyboardInset.ts'

/** Fired on window after the keyboard variables change, so measurements (toast lift) can follow. */
export const KEYBOARD_CHANGE_EVENT = 'blanky:keyboard'

/** Nearest ancestor that scrolls vertically: the focused field is revealed inside it, not by moving the whole frame. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

function reveal(active: HTMLElement) {
  const box = scrollParent(active)
  if (!box) { active.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return }
  const offset = revealOffset(box.getBoundingClientRect(), active.getBoundingClientRect())
  if (offset) box.scrollTop += offset
}

/**
 * Keep the focused editor usable when the phone keyboard reduces the visual viewport.
 * Variables live on <html> so portaled sheets, the top-layer draft dialog and the toast see them:
 * `--mobile-viewport-height/top` (visible area) and `--kb-inset` (lift for bottom-fixed sheets).
 */
export function useMobileViewport(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = root.current
    const viewport = window.visualViewport
    if (!element || !viewport) return
    const html = document.documentElement
    let baseline = window.innerHeight
    let width = window.innerWidth
    let frame = 0
    let revealed: Element | null = null
    const update = () => {
      const active = document.activeElement
      const editable = active instanceof HTMLElement && (active.isContentEditable || active.matches('textarea, input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button]):not([type=submit])'))
      if (width !== window.innerWidth || !editable) {
        width = window.innerWidth
        baseline = window.innerHeight
      }
      const open = window.matchMedia('(max-width: 767px)').matches && editable && baseline - viewport.height > 140
      element.setAttribute('data-keyboard-open', String(open))
      if (open) {
        html.style.setProperty('--mobile-viewport-height', `${viewport.height}px`)
        html.style.setProperty('--mobile-viewport-top', `${viewport.offsetTop}px`)
        html.style.setProperty('--kb-inset', `${keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop)}px`)
      } else {
        html.style.removeProperty('--mobile-viewport-height')
        html.style.removeProperty('--mobile-viewport-top')
        html.style.removeProperty('--kb-inset')
      }
      window.dispatchEvent(new Event(KEYBOARD_CHANGE_EVENT))
      // Once per focused field after the keyboard settles; later moves are the user's own scrolling.
      if (open && active !== revealed) reveal(active as HTMLElement)
      revealed = open ? active : null
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) }
    viewport.addEventListener('resize', schedule)
    viewport.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    document.addEventListener('focusin', schedule)
    document.addEventListener('focusout', schedule)
    update()
    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', schedule)
      viewport.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('focusout', schedule)
      element.removeAttribute('data-keyboard-open')
      html.style.removeProperty('--mobile-viewport-height')
      html.style.removeProperty('--mobile-viewport-top')
      html.style.removeProperty('--kb-inset')
    }
  }, [root])
}
