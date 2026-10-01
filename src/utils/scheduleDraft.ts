import { CATEGORIES } from '../data/mockWorkspace.ts'
import type { WorkspaceCategory } from '../types/work.ts'
import type { WorkKind } from '../types/work.ts'
import { parseQuick } from './parseQuick.ts'

export type ParsedSnapshot = {
  type: WorkKind
  confidence: number
  source: 'rule' | 'personal_rule' | 'ai'
  title: string
  date: string | null
  startTime: string | null
  endTime: string | null
  dueDate: string | null
  categoryId: string | null
}

export type ScheduleDraft = {
  id: string | null
  kind: WorkKind
  title: string
  date: string
  endDate: string
  startTime: string
  endTime: string
  duration: string
  dueDate: string
  categoryId: string | null
  description: string
  status: 'todo' | 'done'
  sourceText?: string
  parsed?: ParsedSnapshot
}

export function guessScheduleKind(text: string): WorkKind {
  const taskVerb = /(?:하기|제출|해야|과제|완성)/.test(text) || /수정/.test(text)
  const eventNoun = /(?:회의|예약|약속|수업|점심|운동)/.test(text)
  if (taskVerb && !eventNoun) return 'task'
  if (eventNoun && !taskVerb) return 'event'
  if (taskVerb) return 'task'
  if (/(?:오전|오후|저녁|밤)?\s*\d{1,2}\s*시/.test(text)) return 'event'
  return 'task'
}

function tidyTitle(title: string): string {
  const trimmed = title.replace(/하기$/, '').trim()
  return trimmed || title
}

export function draftFromText(
  text: string,
  selected: string,
  categories: WorkspaceCategory[],
  today: Date,
): ScheduleDraft {
  const normalized = text.replace(/한\s*시간/g, '1시간')
  const kind = guessScheduleKind(normalized)
  const parsed = parseQuick(normalized, today, categories, kind, selected)
  return {
    id: null,
    kind,
    title: tidyTitle(parsed.title),
    date: parsed.date,
    endDate: parsed.endDate ?? '',
    startTime: parsed.startTime ?? '',
    endTime: parsed.endTime ?? '',
    duration: parsed.duration ? String(parsed.duration) : '',
    dueDate: parsed.dueDate ?? '',
    categoryId: parsed.categoryId,
    description: '',
    status: 'todo',
  }
}

export function selfCheckScheduleDraft(): void {
  if (!import.meta.env.DEV) return
  const today = new Date(2026, 9, 1)
  const event = draftFromText('오후 3시부터 4시까지 팀 회의', '2026-10-01', CATEGORIES, today)
  if (event.kind !== 'event' || event.date !== '2026-10-01' || event.startTime !== '15:00' || event.endTime !== '16:00' || event.title !== '팀 회의') {
    throw new Error('schedule event draft')
  }
  const task = draftFromText('오늘까지 포트폴리오 수정하기', '2026-10-01', CATEGORIES, today)
  if (task.kind !== 'task' || task.dueDate !== '2026-10-01' || task.title !== '포트폴리오 수정') {
    throw new Error('schedule task draft')
  }
  const timed = draftFromText('오후 8시에 포트폴리오 수정하기', '2026-10-01', CATEGORIES, today)
  if (timed.kind !== 'task' || timed.startTime !== '20:00' || timed.date !== '2026-10-01') {
    throw new Error('schedule timed task')
  }
  const hour = draftFromText('오후 5시에 포트폴리오 한 시간 수정', '2026-10-01', CATEGORIES, today)
  if (hour.kind !== 'task' || hour.startTime !== '17:00' || hour.endTime !== '18:00') {
    throw new Error('schedule duration task')
  }
}
