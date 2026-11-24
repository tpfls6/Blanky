import { useSyncExternalStore } from 'react'

/** Live `matchMedia` result; false where media queries are unavailable. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const media = window.matchMedia(query)
      media.addEventListener('change', notify)
      return () => media.removeEventListener('change', notify)
    },
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches),
    () => false,
  )
}

/** Matches the phone layout: the bottom tab bar is shown below Tailwind's `md` breakpoint. */
export const PHONE_QUERY = '(max-width: 767px)'

/** Settings and More use the phone-style app bar and cards below Tailwind's `lg` breakpoint. */
export const SETTINGS_COMPACT_QUERY = '(max-width: 1023px)'
