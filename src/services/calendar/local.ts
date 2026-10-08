import type { Calendar } from '../../../packages/types/src/calendar.ts'
import type { LibraryData } from '../../types/records.ts'

/** Browser-only library IDs never go to the Supabase repository.
 * Reconcile these with server IDs when remote schedule persistence is introduced.
 */
export function withPersonalCalendar(data: LibraryData, userId: string): LibraryData {
  const current = data.personalCalendar
  const calendar: Calendar = current?.ownerUserId === userId ? current : {
    id: `local-personal:${userId}`,
    ownerUserId: userId,
    name: '내 캘린더',
    description: '',
    color: '#3A62B0',
    icon: 'Calendar',
    type: 'personal',
    isDefaultPersonal: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return {
    ...data,
    personalCalendar: calendar,
    items: data.items.map((item) => ({
      ...item,
      calendarId: item.calendarId || calendar.id,
      createdByUserId: item.createdByUserId ?? userId,
    })),
  }
}
