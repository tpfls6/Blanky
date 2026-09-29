export type ClockRange = {
  startTime: string
  endTime: string
}

export function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

export function formatClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Open intervals inside a day, after busy schedule blocks are removed.
 * Used later for leftover-time suggestions on web and mobile.
 */
export function findOpenSlots(input: {
  dayStartTime: string
  dayEndTime: string
  busy: readonly ClockRange[]
  minimumMinutes: number
}): ClockRange[] {
  const dayStart = parseClock(input.dayStartTime)
  const dayEnd = parseClock(input.dayEndTime)
  if (
    dayStart === null ||
    dayEnd === null ||
    dayEnd <= dayStart ||
    input.minimumMinutes <= 0
  ) {
    return []
  }

  const busy = input.busy
    .flatMap((range) => {
      const start = parseClock(range.startTime)
      const end = parseClock(range.endTime)
      if (start === null || end === null || end <= start) return []

      const clippedStart = Math.max(start, dayStart)
      const clippedEnd = Math.min(end, dayEnd)
      if (clippedEnd <= clippedStart) return []

      return [{ start: clippedStart, end: clippedEnd }]
    })
    .sort((left, right) => left.start - right.start)

  const merged: { start: number; end: number }[] = []
  for (const range of busy) {
    const last = merged[merged.length - 1]
    if (!last || range.start > last.end) {
      merged.push({ start: range.start, end: range.end })
    } else {
      last.end = Math.max(last.end, range.end)
    }
  }

  const slots: ClockRange[] = []
  let cursor = dayStart
  for (const range of merged) {
    if (range.start - cursor >= input.minimumMinutes) {
      slots.push({
        startTime: formatClock(cursor),
        endTime: formatClock(range.start),
      })
    }
    cursor = Math.max(cursor, range.end)
  }

  if (dayEnd - cursor >= input.minimumMinutes) {
    slots.push({
      startTime: formatClock(cursor),
      endTime: formatClock(dayEnd),
    })
  }

  return slots
}
