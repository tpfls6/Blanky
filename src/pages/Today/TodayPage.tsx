import { QuickAdd } from '../../components/schedule/QuickAdd.tsx'
import { TaskDetail } from '../../components/tasks/TaskDetail.tsx'
import { TodayHeader } from '../../components/today/TodayHeader.tsx'
import { TodaySchedule } from '../../components/today/TodaySchedule.tsx'
import { TodayTasks } from '../../components/today/TodayTasks.tsx'
import { usePanels } from '../../state/usePanels.ts'
import { useWorkspace } from '../../state/useWorkspace.ts'
import { todayISO, tomorrowISO } from '../../utils/date.ts'
import { looseOn, occursOn, scheduleOn } from '../../utils/work.ts'

export function TodayPage() {
  const { items, toggle, moveTo } = useWorkspace()
  const panels = usePanels()
  const today = todayISO()
  const schedule = scheduleOn(items, today)
  const tasks = looseOn(items, today)
  const selected = items.find((item) => item.id === panels.selectedId) ?? null

  return (
    <section className="w-full max-w-2xl px-5 py-10 sm:px-10 sm:py-14">
      <TodayHeader
        date={today}
        taskCount={
          items.filter((item) => item.kind === 'task' && item.date === today && item.status !== 'done')
            .length
        }
        eventCount={
          items.filter((item) => item.kind === 'event' && occursOn(item, today)).length
        }
      />
      <QuickAdd kind="task" date={today} autoFocus />
      <TodaySchedule items={schedule} onOpen={panels.openItem} onToggle={toggle} />
      <TodayTasks
        items={tasks}
        onToggle={toggle}
        onOpen={panels.openItem}
        onTomorrow={(id) => moveTo(id, tomorrowISO())}
      />
      {selected ? <TaskDetail item={selected} onClose={panels.closeItem} /> : null}
    </section>
  )
}
