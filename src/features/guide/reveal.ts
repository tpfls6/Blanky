import { useEffect, useRef } from 'react'

/**
 * Fades `[data-reveal]` children in as they scroll into view. Content stays visible
 * until the observer is running, and reduced-motion users never get the hidden state.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const root = ref.current
    if (!root || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      }
    }, { rootMargin: '0px 0px -40px 0px' })
    root.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element))
    root.classList.add('reveal-ready')
    return () => { observer.disconnect(); root.classList.remove('reveal-ready') }
  }, [])
  return ref
}
