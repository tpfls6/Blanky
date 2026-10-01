import { formatClock, parseClock } from '@blanky/utils'
import { CATEGORIES } from '../data/mockWorkspace.ts'
import { parseQuick } from './parseQuick.ts'
import type { Priority } from '@blanky/types'
import type { CategoryKind, RepeatRule, WorkInput, WorkItem, WorkspaceCategory } from '../types/work.ts'

/** Stored kind wins. Missing kind: roots are areas, children of the seed "project" area are projects. */
export function categoryKind(category: Pick<WorkspaceCategory, 'kind' | 'parentId'>): CategoryKind {
  if (category.kind === 'area' || category.kind === 'project' || category.kind === 'topic') return category.kind
  if (!category.parentId) return 'area'
  if (category.parentId === 'project') return 'project'
  return 'topic'
}

export type TaskFilter = 'all' | 'today' | 'upcoming' | 'completed'

export type TaskBlock = {
  id: string
  name: string | null
  tasks: WorkItem[]
}

export type TaskSection = {
  id: string
  name: string
  count: number
  blocks: TaskBlock[]
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-neutral-300',
  medium: 'bg-neutral-500',
  high: 'bg-neutral-900',
}

export const REPEAT_LABEL: Record<RepeatRule, string> = {
  none: '반복 없음',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
}

export function plusHour(clock: string): string | null {
  const minutes = parseClock(clock)
  if (minutes === null) return null
  return formatClock((minutes + 60) % 1440)
}

export function endFromStart(startTime: string, minutes: number): string | null {
  const start = parseClock(startTime)
  if (start === null || minutes <= 0) return null
  return formatClock(Math.min(start + minutes, 23 * 60 + 59))
}

export function placedTimes(
  item: Pick<WorkItem, 'startTime' | 'endTime' | 'duration'>,
  startTime: string,
): { startTime: string; endTime: string; duration: number } {
  let minutes = 60
  const start = item.startTime ? parseClock(item.startTime) : null
  const end = item.endTime ? parseClock(item.endTime) : null
  if (start !== null && end !== null && end > start) minutes = end - start
  else if (item.duration && item.duration > 0) minutes = item.duration

  return {
    startTime,
    endTime: endFromStart(startTime, minutes) ?? startTime,
    duration: minutes,
  }
}

export function createWorkItem(input: WorkInput): WorkItem | null {
  const title = input.title.trim()
  const startTime = input.startTime || null
  if (!title || !input.date) return null

  let endTime = input.endTime || null
  let duration = input.duration && input.duration > 0 ? input.duration : null
  const allDay = input.allDay ?? (input.kind === 'event' && !startTime)
  if (startTime && !endTime && !allDay) {
    const minutes = duration ?? 60
    endTime = endFromStart(startTime, minutes)
    duration = minutes
  } else if (startTime && endTime) {
    const start = parseClock(startTime)
    const end = parseClock(endTime)
    if (start !== null && end !== null && end > start) duration = duration ?? end - start
  }

  const endDate = input.endDate && input.endDate > input.date ? input.endDate : null

  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    title,
    description: input.description?.trim() ?? '',
    date: input.date,
    startTime: allDay ? null : startTime,
    endTime: allDay || !startTime ? null : endTime,
    duration,
    categoryId: input.categoryId || null,
    priority: input.priority ?? 'medium',
    status: input.status ?? 'todo',
    dueDate: input.kind === 'task' ? input.dueDate || null : null,
    endDate,
    allDay,
    repeat: input.repeat ?? 'none',
  }
}

export function matchesQuery(item: WorkItem, query: string): boolean {
  const text = query.trim().toLocaleLowerCase('ko')
  if (!text) return true
  return item.title.toLocaleLowerCase('ko').includes(text)
}

export function inCategory(
  item: WorkItem,
  categoryId: string | null,
  categories: WorkspaceCategory[],
): boolean {
  if (!categoryId) return true
  if (item.categoryId === categoryId) return true
  const selected = categories.find((category) => category.id === categoryId)
  if (!selected || selected.parentId !== null) return false
  const child = categories.find((category) => category.id === item.categoryId)
  return child?.parentId === categoryId
}

export function filterByWhen(item: WorkItem, filter: TaskFilter, today: string): boolean {
  if (filter === 'today') return item.date === today && item.status !== 'done'
  if (filter === 'upcoming') return item.date > today && item.status !== 'done'
  if (filter === 'completed') return item.status === 'done'
  return true
}

export function hourOf(startTime: string): string | null {
  const minutes = parseClock(startTime)
  if (minutes === null) return null
  return formatClock(Math.floor(minutes / 60) * 60)
}

export function timelineHours(starts: Array<string | null>): string[] {
  const minutes = new Set<number>()
  for (let hour = 7; hour <= 22; hour += 1) minutes.add(hour * 60)
  for (const start of starts) {
    if (!start) continue
    const parsed = parseClock(start)
    if (parsed === null) continue
    minutes.add(Math.floor(parsed / 60) * 60)
  }
  return [...minutes].sort((left, right) => left - right).map((value) => formatClock(value))
}

export function categoryPath(
  categoryId: string | null,
  categories: WorkspaceCategory[],
): string | null {
  if (!categoryId) return null
  const category = categories.find((item) => item.id === categoryId)
  if (!category) return null
  if (!category.parentId) return category.name
  const parent = categories.find((item) => item.id === category.parentId)
  return parent ? `${parent.name} > ${category.name}` : category.name
}

export function occursOn(item: WorkItem, date: string): boolean {
  if (item.kind === 'task') return item.date === date || item.dueDate === date
  const end = item.endDate && item.endDate >= item.date ? item.endDate : item.date
  return item.date <= date && date <= end
}

export function spansDays(item: WorkItem): boolean {
  return Boolean(item.kind === 'event' && item.endDate && item.endDate > item.date)
}

export function scheduleOn(items: WorkItem[], date: string): WorkItem[] {
  return items
    .filter((item) => {
      if (!occursOn(item, date)) return false
      if (item.kind === 'event') return Boolean(item.startTime) || item.allDay
      return Boolean(item.startTime) && item.date === date
    })
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return (a.startTime ?? '').localeCompare(b.startTime ?? '')
    })
}

export function looseOn(items: WorkItem[], date: string): WorkItem[] {
  return items
    .filter((item) => item.kind === 'task' && !item.startTime && (item.date === date || item.dueDate === date))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1
      return a.title.localeCompare(b.title, 'ko')
    })
}

export function filterTasks(
  items: WorkItem[],
  filter: TaskFilter,
  today: string,
): WorkItem[] {
  return items
    .filter((item) => item.kind === 'task')
    .filter((item) => filterByWhen(item, filter, today))
    .sort((a, b) => {
      const byDate =
        filter === 'completed'
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return a.title.localeCompare(b.title, 'ko')
    })
}

export function historyDates(items: WorkItem[], today: string): string[] {
  return [
    ...new Set(items.filter((item) => item.date < today).map((item) => item.date)),
  ].sort((a, b) => b.localeCompare(a))
}

export function itemsOn(items: WorkItem[], date: string): WorkItem[] {
  return items
    .filter((item) => occursOn(item, date))
    .sort((a, b) => {
      if (Boolean(a.startTime) !== Boolean(b.startTime)) return a.startTime ? -1 : 1
      if (a.startTime && b.startTime && a.startTime !== b.startTime) {
        return a.startTime.localeCompare(b.startTime)
      }
      return a.title.localeCompare(b.title, 'ko')
    })
}

export function groupTasks(
  tasks: WorkItem[],
  categories: WorkspaceCategory[],
): TaskSection[] {
  const known = new Map(categories.map((category) => [category.id, category]))
  const sections: TaskSection[] = []

  for (const parent of categories.filter((category) => category.parentId === null)) {
    const blocks: TaskBlock[] = []
    const direct = tasks.filter((task) => task.categoryId === parent.id)
    if (direct.length > 0) {
      blocks.push({ id: `${parent.id}-direct`, name: null, tasks: direct })
    }
    for (const sub of categories.filter((category) => category.parentId === parent.id)) {
      const subTasks = tasks.filter((task) => task.categoryId === sub.id)
      if (subTasks.length > 0) blocks.push({ id: sub.id, name: sub.name, tasks: subTasks })
    }
    const count = blocks.reduce((sum, block) => sum + block.tasks.length, 0)
    if (count > 0) sections.push({ id: parent.id, name: parent.name, count, blocks })
  }

  const loose = tasks.filter((task) => !task.categoryId || !known.has(task.categoryId))
  if (loose.length > 0) {
    sections.push({
      id: 'loose',
      name: '메모',
      count: loose.length,
      blocks: [{ id: 'loose-direct', name: null, tasks: loose }],
    })
  }

  return sections
}

export function reorderAmongSiblings(
  categories: WorkspaceCategory[],
  id: string,
  targetId: string,
): WorkspaceCategory[] {
  if (id === targetId) return categories
  const item = categories.find((category) => category.id === id)
  const target = categories.find((category) => category.id === targetId)
  if (!item || !target || item.parentId !== target.parentId) return categories
  const siblings = categories.filter((category) => category.parentId === item.parentId)
  const from = siblings.findIndex((category) => category.id === id)
  const to = siblings.findIndex((category) => category.id === targetId)
  if (from < 0 || to < 0) return categories
  const next = siblings.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  let cursor = 0
  return categories.map((category) =>
    category.parentId === item.parentId ? next[cursor++]! : category,
  )
}

export function selfCheckWork(): void {
  if (!import.meta.env.DEV) return

  const today = '2026-09-29'
  const items: WorkItem[] = [
    {
      id: '1',
      kind: 'task',
      title: '기획',
      description: '',
      date: today,
      startTime: null,
      endTime: null,
      duration: null,
      categoryId: 'ai',
      priority: 'high',
      status: 'todo',
      dueDate: null,
      endDate: null,
      allDay: false,
      repeat: 'none',
    },
    {
      id: '2',
      kind: 'task',
      title: '설계',
      description: '',
      date: '2026-10-02',
      startTime: null,
      endTime: null,
      duration: null,
      categoryId: 'blanky',
      priority: 'medium',
      status: 'todo',
      dueDate: null,
      endDate: null,
      allDay: false,
      repeat: 'none',
    },
    {
      id: '3',
      kind: 'event',
      title: '수업',
      description: '',
      date: today,
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      categoryId: 'study',
      priority: 'low',
      status: 'todo',
      dueDate: null,
      endDate: null,
      allDay: false,
      repeat: 'none',
    },
    {
      id: '4',
      kind: 'task',
      title: '복습',
      description: '',
      date: '2026-09-28',
      startTime: null,
      endTime: null,
      duration: null,
      categoryId: 'study',
      priority: 'low',
      status: 'done',
      dueDate: null,
      endDate: null,
      allDay: false,
      repeat: 'none',
    },
  ]

  if (categoryKind({ parentId: null }) !== 'area') throw new Error('area kind')
  if (categoryKind({ parentId: 'project' }) !== 'project') throw new Error('project kind')
  if (categoryKind({ parentId: 'school', kind: 'topic' }) !== 'topic') throw new Error('topic kind')
  if (filterTasks(items, 'today', today).length !== 1) throw new Error('today filter')
  if (filterTasks(items, 'upcoming', today).length !== 1) throw new Error('upcoming filter')
  if (filterTasks(items, 'completed', today).length !== 1) throw new Error('completed filter')
  if (scheduleOn(items, today).length !== 1) throw new Error('schedule')
  const school = groupTasks(filterTasks(items, 'all', today), CATEGORIES).find(
    (section) => section.id === 'school',
  )
  if (!school || school.count !== 2) throw new Error('category group')
  if (plusHour('18:30') !== '19:30') throw new Error('plus hour')
  const placed = placedTimes(
    { startTime: null, endTime: null, duration: 60 },
    '14:00',
  )
  if (placed.endTime !== '15:00') throw new Error('place hour')
  const kept = placedTimes(
    { startTime: '09:00', endTime: '10:30', duration: 90 },
    '11:00',
  )
  if (kept.endTime !== '12:30' || kept.duration !== 90) throw new Error('keep duration')
  const task = createWorkItem({ kind: 'task', title: '발표자료 수정', date: today })
  if (!task || task.startTime !== null) throw new Error('task without time')
  const event = createWorkItem({
    kind: 'event',
    title: '회의',
    date: today,
    startTime: '14:00',
    repeat: 'weekly',
  })
  if (!event || event.endTime !== '15:00' || event.repeat !== 'weekly') throw new Error('event')
  const allday = createWorkItem({
    kind: 'event',
    title: '해커톤',
    date: today,
    endDate: '2026-10-08',
  })
  if (!allday?.allDay || allday.endDate !== '2026-10-08' || allday.startTime) {
    throw new Error('all day')
  }
  const parsedToday = new Date(2026, 8, 30)
  const meeting = parseQuick(
    '내일 오후 2시부터 4시까지 팀 회의',
    parsedToday,
    CATEGORIES,
    'event',
  )
  if (meeting.date !== '2026-10-01' || meeting.startTime !== '14:00' || meeting.endTime !== '16:00' || meeting.title !== '팀 회의') {
    throw new Error('parse meeting')
  }
  const slides = parseQuick(
    '금요일 오전 10시 발표자료 수정 2시간',
    parsedToday,
    CATEGORIES,
    'task',
  )
  if (slides.date !== '2026-10-02' || slides.startTime !== '10:00' || slides.endTime !== '12:00' || slides.title !== '발표자료 수정') {
    throw new Error('parse slides')
  }
  const hack = parseQuick('10월 5일부터 10월 8일까지 해커톤', parsedToday, CATEGORIES, 'event')
  if (hack.date !== '2026-10-05' || hack.endDate !== '2026-10-08' || !hack.allDay || hack.title !== '해커톤') {
    throw new Error('parse span')
  }
  const plan = parseQuick(
    '다음 주 월요일부터 수요일까지 Blanky 화면 개발, 프로젝트 카테고리',
    parsedToday,
    CATEGORIES,
    'task',
  )
  if (plan.date !== '2026-10-05' || plan.dueDate !== '2026-10-07' || plan.categoryId !== 'blanky' || plan.title !== '화면 개발') {
    throw new Error('parse category span')
  }
  const homework = parseQuick('금요일 학교 과제 제출', parsedToday, CATEGORIES, 'task')
  if (homework.categoryId !== 'school' || homework.title !== '과제 제출') throw new Error('parse school')
  const evening = parseQuick('오늘 저녁 7시 운동', parsedToday, CATEGORIES, 'event')
  if (evening.startTime !== '19:00') throw new Error('parse evening')
  const night = parseQuick('오늘 밤 11시 정리', parsedToday, CATEGORIES, 'task')
  if (night.startTime !== '23:00') throw new Error('parse night')
  if (!inCategory(items[0], 'school', CATEGORIES)) throw new Error('parent category')
  if (!matchesQuery(items[0], '기획')) throw new Error('search')
  if (timelineHours(['06:30'])[0] !== '06:00') throw new Error('timeline hour')
  const moved = reorderAmongSiblings(CATEGORIES, 'project', 'school')
  const parents = moved.filter((category) => category.parentId === null).map((category) => category.id)
  if (parents[0] !== 'project' || parents[1] !== 'school') throw new Error('reorder parent')
  const children = reorderAmongSiblings(CATEGORIES, 'stockmate', 'blanky')
    .filter((category) => category.parentId === 'project')
    .map((category) => category.id)
  if (children[0] !== 'stockmate') throw new Error('reorder child')
  if (reorderAmongSiblings(CATEGORIES, 'blanky', 'school') !== CATEGORIES) throw new Error('reorder scope')
}
