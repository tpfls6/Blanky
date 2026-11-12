import { useEffect, type RefObject } from 'react'

/** Keep the focused editor usable when the phone keyboard reduces the visual viewport. */
export function useMobileViewport(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = root.current
    const viewport = window.visualViewport
    if (!element || !viewport) return
    let baseline = window.innerHeight
    let width = window.innerWidth
    let frame = 0
    let wasOpen = false
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
        element.style.setProperty('--mobile-viewport-height', `${viewport.height}px`)
        element.style.setProperty('--mobile-viewport-top', `${viewport.offsetTop}px`)
      } else {
        element.style.removeProperty('--mobile-viewport-height')
        element.style.removeProperty('--mobile-viewport-top')
      }
      if (open && !wasOpen) active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      wasOpen = open
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
      element.style.removeProperty('--mobile-viewport-height')
      element.style.removeProperty('--mobile-viewport-top')
    }
  }, [root])
}
