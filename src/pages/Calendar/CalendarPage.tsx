import { ScheduleCalendar } from '../../components/schedule/ScheduleCalendar.tsx'

export function CalendarPage() {
  return (
    <section className="px-4 py-8 sm:px-8 sm:py-14 md:px-12">
      <h1 className="text-2xl font-medium tracking-tight text-neutral-900 sm:text-3xl">
        Calendar
      </h1>
      <div className="mt-8 sm:mt-10">
        <ScheduleCalendar />
      </div>
    </section>
  )
}
