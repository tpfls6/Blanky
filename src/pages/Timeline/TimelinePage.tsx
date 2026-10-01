import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { QuickAdd } from '../../components/schedule/QuickAdd.tsx'
import { TaskDetail } from '../../components/tasks/TaskDetail.tsx'
import { TaskItem } from '../../components/tasks/TaskItem.tsx'
import { TimelineDay } from '../../components/timeline/TimelineDay.tsx'
import { usePanels } from '../../state/usePanels.ts'
import { useWorkspace } from '../../state/useWorkspace.ts'
import { addDays, formatISODate, longDate, parseISODate, todayISO, tomorrowISO } from '../../utils/date.ts'
import { looseOn } from '../../utils/work.ts'

export function TimelinePage() {
  const { items, toggle, moveTo, placeAt, update } = useWorkspace()
  const panels = usePanels()
  const [date, setDate] = useState(todayISO)
  const tasks = looseOn(items, date)
  const selected = items.find((item) => item.id === panels.selectedId) ?? null
  const shift = (days: number) => setDate((current) => formatISODate(addDays(parseISODate(current), days)))

  return (
    <section className="w-full max-w-5xl px-5 py-10 sm:px-10 sm:py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-medium tracking-tight text-neutral-900 sm:text-3xl">Timeline</h1>
      </div>
      <QuickAdd kind="event" date={date} />
      <div className="mt-4 flex items-center gap-3">
        <p className="text-sm text-neutral-700">{longDate(date)}</p>
        <button
          type="button"
          aria-label="이전 날"
          onClick={() => shift(-1)}
          className="p-1 text-neutral-400 hover:text-neutral-800"
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="다음 날"
          onClick={() => shift(1)}
          className="p-1 text-neutral-400 hover:text-neutral-800"
        >
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setDate(todayISO())}
          className="text-sm text-neutral-400 hover:text-neutral-800"
        >
          오늘
        </button>
      </div>
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <TimelineDay
          items={items}
          date={date}
          onOpen={panels.openItem}
          onToggle={toggle}
          onPlace={placeAt}
        />
        <section
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={(event) => {
            event.preventDefault()
            const id = event.dataTransfer.getData('text/plain')
            const item = items.find((entry) => entry.id === id)
            if (item?.kind === 'task') update(id, { startTime: null, endTime: null })
          }}
        >
          <h2 className="text-sm text-neutral-400">할 일</h2>
          {tasks.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">없음</p>
          ) : (
            <div className="mt-2">
              {tasks.map((item) => (
                <TaskItem
                  key={item.id}
                  item={item}
                  meta="today"
                  onToggle={toggle}
                  onOpen={panels.openItem}
                  onTomorrow={(id) => moveTo(id, tomorrowISO())}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      {selected ? <TaskDetail item={selected} onClose={panels.closeItem} /> : null}
    </section>
  )
}
