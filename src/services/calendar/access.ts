/** Calendars the signed-in user may read but not change. RLS enforces this on the server;
 * the client check only stops a doomed save before it is attempted. */
let readOnly = new Set<string>()

export function setReadOnlyCalendars(ids: Iterable<string>): void {
  readOnly = new Set(ids)
}

export function isReadOnlyCalendar(calendarId: string | undefined | null): boolean {
  return Boolean(calendarId && readOnly.has(calendarId))
}

export const READ_ONLY_MESSAGE = '조회 권한만 있는 캘린더예요. 일정을 바꿀 수 없어요.'
