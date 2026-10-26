export function isGoogleOriginWork(item: { changeSource?: string; calendarType?: string }): boolean {
  return item.changeSource === 'calendar_sync' || item.calendarType === 'external'
}
