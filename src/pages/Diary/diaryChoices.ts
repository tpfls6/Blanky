import type { DiaryEntry } from '../../types/records.ts'
import { localeTag, type AppLocale } from '../../i18n/locale.ts'

/** Mood and weather choices: [id, emoji, name]. */
export const MOODS = [
  ['happy', '😊', '기쁨'], ['good', '🙂', '좋음'], ['neutral', '😐', '보통'],
  ['sad', '😔', '우울'], ['angry', '😡', '화남'], ['tired', '😴', '피곤'], ['excited', '🥰', '설렘'],
] as const
export const WEATHER = [
  ['sunny', '☀️', '맑음'], ['partly-cloudy', '🌤️', '구름 조금'], ['cloudy', '☁️', '흐림'],
  ['rain', '🌧️', '비'], ['snow', '🌨️', '눈'], ['wind', '🍃', '바람'],
] as const
export type Choices = typeof MOODS | typeof WEATHER
export const choiceOf = (choices: Choices, value?: string) => choices.find(choice => choice[0] === value)

export const noon = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m ?? 1) - 1, d ?? 1, 12) }
export const weekdayShort = (locale: AppLocale, iso: string) => noon(iso).toLocaleDateString(localeTag(locale), { weekday: 'short' })
export const entryTime = (locale: AppLocale, entry: DiaryEntry) => new Date(entry.createdAt).toLocaleTimeString(localeTag(locale), { hour: 'numeric', minute: '2-digit' })
/** "11월 24일 화요일" (ko) / "Tuesday, November 24" (en): the phone editor's date button. */
export const longDay = (locale: AppLocale, iso: string) => noon(iso).toLocaleDateString(localeTag(locale), { month: 'long', day: 'numeric', weekday: 'long' })
