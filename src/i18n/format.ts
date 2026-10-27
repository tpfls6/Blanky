import { localeTag, type AppLocale } from './locale.ts'
import { translate } from './translate.ts'

export function formatDisplayDate(locale: AppLocale, iso: string, style: 'long' | 'full' = 'long'): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)
  if (style === 'full') {
    return date.toLocaleDateString(localeTag(locale), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  }
  if (locale === 'ko') return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatMonthTitle(locale: AppLocale, date: Date): string {
  return date.toLocaleDateString(localeTag(locale), { month: 'long', year: 'numeric' })
}

export function formatDateTime(locale: AppLocale, value: string): string {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return value
  return new Date(time).toLocaleString(localeTag(locale))
}

export function relativeDayLabel(locale: AppLocale, iso: string, today: string): string | null {
  if (iso === today) return translate(locale, 'today')
  const [year, month, day] = today.split('-').map(Number)
  const next = new Date(year, (month ?? 1) - 1, (day ?? 1) + 1)
  const tomorrow = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
  if (iso === tomorrow) return translate(locale, 'tomorrow')
  return null
}
