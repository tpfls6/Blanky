/** Small display helpers for the phone calendar. */

type Translate = (key: string, vars?: Record<string, string | number>) => string

/** "1시간 30분" style length. */
export function durationLabel(t: Translate, minutes: number): string {
  const hours = Math.floor(minutes / 60), rest = minutes % 60
  if (!hours) return t('schedule.mobile.minutes', { count: rest })
  return rest ? t('schedule.mobile.hoursMinutes', { hours, minutes: rest }) : t('schedule.mobile.hours', { count: hours })
}

/** "오전 9:05" style time of a Date. */
export function meridiemTime(t: Translate, date: Date): string {
  const hours = date.getHours()
  return t('schedule.mobile.meridiemTime', { meridiem: t(hours < 12 ? 'schedule.mobile.am' : 'schedule.mobile.pm'), hour: hours % 12 || 12, minute: String(date.getMinutes()).padStart(2, '0') })
}
