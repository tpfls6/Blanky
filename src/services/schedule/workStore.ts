import { createCalendarRepository } from '@blanky/api'
import type { Schedule } from '@blanky/types'
import type { WorkItem, WorkspaceCategory } from '../../types/work.ts'
import { createCategory, getCategories } from '../categories/index.ts'
import { getScheduleRepository } from './index.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'

export type Activity = {
  id: string
  entityId: string
  action: 'created' | 'updated' | 'completed' | 'deleted'
  source: 'manual' | 'ai_chat'
  before: WorkItem | null
  after: WorkItem | null
  createdAt: string
}

export function workFromSchedule(row: Schedule, calendarType?: WorkItem['calendarType']): WorkItem {
  return { ...row, createdByUserId: row.createdByUserId ?? undefined, kind: row.kind ?? 'event', status: row.status === 'done' ? 'done' : 'todo',
    dueDate: row.dueDate ?? null, endDate: row.endDate ?? null,
    allDay: row.allDay ?? !row.startTime, repeat: row.repeat ?? 'none',
    changeSource: row.changeSource, calendarType }
}

export async function saveWork(userId: string, before: WorkItem | null, after: WorkItem, remote: boolean, source: Activity['source'], categories: WorkspaceCategory[]): Promise<{ item: WorkItem; categories: WorkspaceCategory[] }> {
  if (!isSupabaseConfigured) return { item: after, categories: [] }
  const repository = getScheduleRepository()
  // Legacy seed categories use names as IDs; resolve them through the category API.
  const remoteCategories = after.categoryId ? await getCategories() : []
  const resolveCategory = async (id: string | null): Promise<string | null> => {
    if (!id) return null
    const existing = remoteCategories.find(row => row.id === id)
    if (existing) return existing.id
    const category = categories.find(row => row.id === id)
    if (!category) throw new Error('카테고리를 찾지 못했습니다.')
    const parentId = await resolveCategory(category.parentId)
    const matched = remoteCategories.find(row => row.name === category.name && row.parentId === parentId)
    if (matched) return matched.id
    const created = await createCategory({ name: category.name, parentId, color: category.color ?? null, icon: category.icon ?? null })
    remoteCategories.push(created)
    return created.id
  }
  const draft = { ...after, categoryId: await resolveCategory(after.categoryId), calendarId: after.calendarId?.startsWith('local-personal:') ? undefined : after.calendarId, changeSource: source }
  const item = workFromSchedule(before && remote
    ? await repository.update(before.id, draft)
    : await repository.create(userId, draft))
  return { item, categories: remoteCategories }
}

export async function loadWork() {
  const repository = getScheduleRepository()
  const [rows, changes, categories, calendars] = await Promise.all([
    repository.listRange('0001-01-01', '9999-12-31'),
    repository.listChanges(),
    getCategories(),
    isSupabaseConfigured ? createCalendarRepository(getSupabaseClient()).getCalendars() : Promise.resolve([]),
  ])
  const types = new Map(calendars.map((calendar) => [calendar.id, calendar.type]))
  return { categories, items: rows.map((row) => workFromSchedule(row, types.get(row.calendarId))), activities: changes.map((row): Activity => ({
    id: row.id, entityId: row.scheduleId, action: row.action, source: row.source,
    before: row.beforeData ? workFromSchedule(row.beforeData, types.get(row.beforeData.calendarId)) : null,
    after: row.afterData ? workFromSchedule(row.afterData, types.get(row.afterData.calendarId)) : null, createdAt: row.createdAt,
  })) }
}
