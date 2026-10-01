import { useState } from 'react'
import { CalendarView } from '../../components/calendar/CalendarView.tsx'
import { DayDetail } from '../../components/calendar/DayDetail.tsx'
import { QuickAdd } from '../../components/schedule/QuickAdd.tsx'
import { TaskDetail } from '../../components/tasks/TaskDetail.tsx'
import { usePanels } from '../../state/usePanels.ts'
import { useWorkspace } from '../../state/useWorkspace.ts'
import { todayISO, tomorrowISO } from '../../utils/date.ts'

export function CalendarPage() {
  const { items, toggle, moveTo } = useWorkspace()
  const panels = usePanels()
  const [selectedDate, setSelectedDate] = useState(todayISO)
  const selected = items.find((item) => item.id === panels.selectedId) ?? null

  return (
    <section className="w-full max-w-5xl px-3 py-8 sm:px-10 sm:py-12">
      <div className="flex items-center justify-between gap-4 px-1">
        <h1 className="text-2xl font-medium tracking-tight text-neutral-900 sm:text-3xl">
          Calendar
        </h1>
      </div>
      <QuickAdd kind="event" date={selectedDate} />
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <CalendarView
          items={items}
          selected={selectedDate}
          onSelect={setSelectedDate}
          onOpen={panels.openItem}
          onMove={moveTo}
        />
        <DayDetail
          date={selectedDate}
          items={items}
          onToggle={toggle}
          onOpen={panels.openItem}
          onTomorrow={(id) => moveTo(id, tomorrowISO())}
        />
      </div>
      {selected ? <TaskDetail item={selected} onClose={panels.closeItem} /> : null}
    </section>
  )
}
