import { longDate } from '../../utils/date.ts'

type TodayHeaderProps = {
  date: string
  taskCount: number
  eventCount: number
}

export function TodayHeader({ date, taskCount, eventCount }: TodayHeaderProps) {
  return (
    <header>
      <h1 className="text-2xl font-medium tracking-tight text-neutral-900 sm:text-3xl">
        {longDate(date)}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        오늘 해야 할 일 {taskCount}개
        <span className="px-1.5 text-neutral-300">·</span>
        예정된 일정 {eventCount}개
      </p>
    </header>
  )
}
