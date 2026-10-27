export function timelineRange(item: { startTime: string | null; endTime: string | null; duration: number | null; date: string; endDate: string | null }, day: string) {
  if (!item.startTime) return null
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  const start = item.date < day && item.endDate ? 0 : minutes(item.startTime)
  let end = item.endDate && item.endDate > day ? 1440 : item.endTime ? minutes(item.endTime) : start + (item.duration || 60)
  if (end < start) end = 1440
  return end > start ? { start, end: Math.min(end, 1440) } : null
}

export function hourSegment(start: number, end: number, hour: number) {
  const from = Math.max(start, hour * 60)
  const to = Math.min(end, (hour + 1) * 60)
  return to > from ? { top: (from - hour * 60) / 60 * 100, height: (to - from) / 60 * 100 } : null
}

export function taskOverlapsEvent(event: { start: number; end: number }, task: { start: number; end: number }) {
  // Tasks render as rows in their starting hour, so reserve room for that row too.
  const rowStart = Math.floor(task.start / 60) * 60
  return event.start < Math.max(task.end, rowStart + 60) && event.end > rowStart
}

export type TimelineInterval = { id: string; start: number; end: number; kind?: string }
export type TimelinePlacement<T> = T & { column: number; columns: number; span: number }

export function layoutTimeline<T extends TimelineInterval>(intervals: readonly T[]): TimelinePlacement<T>[] {
  const sorted = intervals.filter(item => Number.isFinite(item.start) && item.end > item.start)
    .slice().sort((a, b) => a.start - b.start || (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1) || b.end - a.end || a.id.localeCompare(b.id))
  const result: TimelinePlacement<T>[] = []
  let group: T[] = []
  let groupEnd = -Infinity
  const flush = () => {
    const columns: T[][] = []
    const placed = group.map(item => {
      let column = columns.findIndex(rows => rows[rows.length - 1].end <= item.start)
      if (column === -1) { column = columns.length; columns.push([]) }
      columns[column].push(item)
      return { ...item, column, columns: 0, span: 1 }
    })
    for (const item of placed) {
      item.columns = columns.length
      for (let column = item.column + 1; column < columns.length; column++) {
        if (columns[column].some(other => other.start < item.end && other.end > item.start)) break
        item.span++
      }
      result.push(item)
    }
    group = []
  }
  for (const item of sorted) {
    if (item.start >= groupEnd) flush()
    group.push(item)
    groupEnd = Math.max(groupEnd, item.end)
  }
  flush()
  return result
}
