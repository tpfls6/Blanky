export type Sighting = {
  id: string
  title: string
  date: string
  startTime: string | null
  endTime: string | null
  calendarId?: string
  repeat: 'none' | 'daily' | 'weekly' | 'monthly'
  repeatDays?: readonly number[]
  changeSource?: 'manual' | 'ai_chat' | 'calendar_sync'
  calendarType?: 'personal' | 'shared' | 'external'
  kind: 'event' | 'task'
}

export type DuplicateGroup = {
  keepId: string
  dropIds: string[]
  scope: 'occurrence' | 'series'
  confidence: 'safe' | 'confirm'
  title: string
}

export type ConflictPair = {
  aId: string
  bId: string
  date: string
  reason: 'overlap_different_title'
}

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function titlesMatch(a: string, b: string): boolean {
  const left = normalizeTitle(a)
  const right = normalizeTitle(b)
  if (!left || !right) return false
  if (left === right) return true
  return (left.includes(right) || right.includes(left)) && Math.min(left.length, right.length) >= 2
}

export function isProtected(item: Pick<Sighting, 'changeSource' | 'calendarType'>): boolean {
  return item.changeSource === 'calendar_sync' || item.calendarType === 'external'
}

function minutes(clock: string): number {
  const [hour, minute] = clock.split(':').map(Number)
  return hour * 60 + minute
}

function sameCalendar(a: Sighting, b: Sighting): boolean {
  return (a.calendarId ?? '') === (b.calendarId ?? '')
}

function sameSlot(a: Sighting, b: Sighting): boolean {
  return a.date === b.date && a.startTime === b.startTime && a.endTime === b.endTime && sameCalendar(a, b)
}

function sameSeries(a: Sighting, b: Sighting): boolean {
  if (a.repeat === 'none' || a.repeat !== b.repeat) return false
  const left = [...(a.repeatDays ?? [])].sort().join(',')
  const right = [...(b.repeatDays ?? [])].sort().join(',')
  return left === right && a.startTime === b.startTime && a.endTime === b.endTime && sameCalendar(a, b)
}

function overlaps(a: Sighting, b: Sighting): boolean {
  if (a.date !== b.date || !sameCalendar(a, b)) return false
  if (!a.startTime || !b.startTime) return !a.startTime && !b.startTime
  const startA = minutes(a.startTime)
  const endA = minutes(a.endTime ?? a.startTime)
  const startB = minutes(b.startTime)
  const endB = minutes(b.endTime ?? b.startTime)
  return startA < endB && startB < endA
}

function preferKeep(items: Sighting[]): Sighting {
  return [...items].sort((left, right) => {
    const protect = Number(isProtected(right)) - Number(isProtected(left))
    if (protect) return protect
    return left.id.localeCompare(right.id)
  })[0]
}

export function findDuplicates(items: readonly Sighting[]): DuplicateGroup[] {
  const groups: Sighting[][] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) continue
    const cluster = items.filter(other =>
      other.id === item.id
      || (titlesMatch(item.title, other.title) && (sameSlot(item, other) || sameSeries(item, other))),
    )
    if (cluster.length < 2) continue
    for (const row of cluster) seen.add(row.id)
    groups.push([...cluster])
  }
  return groups.map(cluster => {
    const series = cluster.every(row => row.repeat !== 'none' && sameSeries(row, cluster[0]))
    const keep = preferKeep(cluster)
    const drop = cluster.filter(row => row.id !== keep.id)
    const dropProtected = drop.some(isProtected)
    return {
      keepId: keep.id,
      dropIds: drop.map(row => row.id),
      scope: series ? 'series' as const : 'occurrence' as const,
      confidence: series || dropProtected ? 'confirm' as const : 'safe' as const,
      title: keep.title,
    }
  })
}

export function findConflicts(items: readonly Sighting[]): ConflictPair[] {
  const pairs: ConflictPair[] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]
      if (!overlaps(a, b) || titlesMatch(a.title, b.title)) continue
      pairs.push({ aId: a.id, bId: b.id, date: a.date, reason: 'overlap_different_title' })
    }
  }
  return pairs
}
