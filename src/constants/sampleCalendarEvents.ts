import type { EventInput } from '@fullcalendar/react'
import { addDays, formatISODate } from '../utils/date.ts'

const today = new Date()

export const sampleCalendarEvents: EventInput[] = [
  {
    title: '샘플: 집중 작업',
    date: formatISODate(today),
  },
  {
    title: '샘플: 독서',
    date: formatISODate(addDays(today, 1)),
  },
]
