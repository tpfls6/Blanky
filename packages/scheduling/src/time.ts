import { Temporal } from 'temporal-polyfill'

export function localInstant(date: string, time: string, timezone: string): number {
  return Temporal.PlainDate.from(date).toPlainDateTime(time).toZonedDateTime(timezone, { disambiguation: 'reject' }).epochMilliseconds
}
export function nextDate(date: string, days = 1): string { return Temporal.PlainDate.from(date).add({ days }).toString() }
/** Calendar-day bounds use the first valid instant, including midnight DST jumps. */
export function startOfDay(date: string, timezone: string): number { return Temporal.PlainDate.from(date).toZonedDateTime(timezone).epochMilliseconds }
export function localDate(instant: string, timezone: string): string { return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDate().toString() }
export function zonedISO(ms: number, timezone: string): string { return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(timezone).toString({ timeZoneName: 'never' }) }
export function weekday(date: string): number { return Temporal.PlainDate.from(date).dayOfWeek }
export function dateDistance(start: string, end: string): number { return Temporal.PlainDate.from(start).until(Temporal.PlainDate.from(end)).days }
export function epoch(instant: string): number { return Temporal.Instant.from(instant).epochMilliseconds }
