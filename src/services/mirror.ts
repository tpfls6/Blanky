import { createCategoryRepository, createRecordRepository } from '@blanky/api'
import type { CustomRecordType } from '../features/records/schema.ts'
import type { FieldValue } from '../types/records.ts'
import type { WorkspaceCategory } from '../types/work.ts'
import { getCurrentUserId } from './auth/index.ts'
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client.ts'

async function session() {
  if (!isSupabaseConfigured) return null
  try {
    const userId = await getCurrentUserId()
    if (!userId) return null
    return { userId, client: getSupabaseClient() }
  } catch {
    return null
  }
}

function run(work: () => Promise<void>) {
  void work().catch(() => undefined)
}

export function mirrorCategoryCreate(category: WorkspaceCategory, sortOrder: number): void {
  run(async () => {
    const current = await session()
    if (!current) return
    await createCategoryRepository(current.client).createCategory(current.userId, {
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      icon: category.icon ?? null,
      color: category.color ?? null,
      sortOrder,
    })
  })
}

export function mirrorCategoryUpdate(id: string, patch: Partial<Pick<WorkspaceCategory, 'name' | 'color' | 'icon'>>): void {
  run(async () => {
    const current = await session()
    if (!current) return
    await createCategoryRepository(current.client).updateCategory(id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    })
  })
}

export function mirrorCategoryDelete(id: string): void {
  run(async () => {
    const current = await session()
    if (!current) return
    await createCategoryRepository(current.client).deleteCategory(id)
  })
}

export function mirrorCategoryReorder(orderedIds: string[]): void {
  run(async () => {
    const current = await session()
    if (!current) return
    await createCategoryRepository(current.client).reorderCategories(orderedIds)
  })
}

export function mirrorRecordTypeSave(recordType: CustomRecordType): void {
  run(async () => {
    const current = await session()
    if (!current) return
    const records = createRecordRepository(current.client)
    try {
      await records.updateCustomRecordType(recordType.id, {
        name: recordType.name,
        description: recordType.description,
        icon: recordType.icon,
        color: recordType.color,
        version: recordType.version,
        blocks: recordType.blocks,
      })
    } catch {
      await records.createCustomRecordType(current.userId, {
        id: recordType.id,
        name: recordType.name,
        description: recordType.description,
        icon: recordType.icon,
        color: recordType.color,
        version: recordType.version,
        blocks: recordType.blocks,
      })
    }
  })
}

export function mirrorRecordTypeDelete(id: string): void {
  run(async () => {
    const current = await session()
    if (!current) return
    await createRecordRepository(current.client).deleteCustomRecordType(id)
  })
}

export function mirrorRecordSave(record: {
  id: string
  typeId: string
  title: string
  values: Record<string, FieldValue>
  templateVersion: number
}, created: boolean): void {
  run(async () => {
    const current = await session()
    if (!current) return
    const records = createRecordRepository(current.client)
    if (!created) {
      await records.updateCustomRecord(record.id, { title: record.title, values: record.values, templateVersion: record.templateVersion })
      return
    }
    await records.createCustomRecord(current.userId, {
      id: record.id,
      recordTypeId: record.typeId,
      title: record.title,
      values: record.values,
      templateVersion: record.templateVersion,
    })
  })
}

export function mirrorRecordDelete(id: string): void {
  run(async () => {
    const current = await session()
    if (!current) return
    await createRecordRepository(current.client).deleteCustomRecord(id)
  })
}
