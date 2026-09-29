import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import classicThemePlugin from '@fullcalendar/react/themes/classic'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/palette.css'
import '@fullcalendar/react/themes/classic/theme.css'
import { sampleCalendarEvents } from '../../constants/sampleCalendarEvents.ts'
import { useMediaQuery } from '../../hooks/useMediaQuery.ts'

export function ScheduleCalendar() {
  const compact = useMediaQuery('(max-width: 767px)')

  return (
    <div className="calendar-shell min-w-0">
      <FullCalendar
        plugins={[
          dayGridPlugin,
          timeGridPlugin,
          interactionPlugin,
          classicThemePlugin,
        ]}
        initialView="dayGridMonth"
        headerToolbar={
          compact
            ? { left: 'prev,next', center: 'title', right: 'today' }
            : {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay',
              }
        }
        footerToolbar={
          compact
            ? { center: 'dayGridMonth,timeGridWeek,timeGridDay' }
            : false
        }
        height={compact ? 560 : 720}
        events={sampleCalendarEvents}
        editable
      />
    </div>
  )
}
