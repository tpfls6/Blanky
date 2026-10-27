export const APP_LOCALES = ['ko', 'en'] as const

export type AppLocale = (typeof APP_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'ko'

export function parseLocale(value: unknown): AppLocale | null {
  return value === 'ko' || value === 'en' ? value : null
}

export function coerceLocale(value: unknown, fallback: AppLocale = DEFAULT_LOCALE): AppLocale {
  return parseLocale(value) ?? fallback
}

export function detectBrowserLocale(language = typeof navigator === 'undefined' ? '' : navigator.language): AppLocale {
  const tag = language.toLowerCase()
  return tag === 'en' || tag.startsWith('en-') ? 'en' : DEFAULT_LOCALE
}

export function localeTag(locale: AppLocale): string {
  return locale === 'en' ? 'en-US' : 'ko-KR'
}
