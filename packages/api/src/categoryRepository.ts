import type { SupabaseClient } from '@supabase/supabase-js'
import type { Category } from '../../types/src/category.ts'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import { isRecord, readNullableString, readNumber, readString } from './guards.ts'

export type CategoryInput = {
  id?: string
  name?: string
  parentId?: string | null
  icon?: string | null
  color?: string | null
  sortOrder?: number
}

export function mapCategoryRow(value: unknown): Category {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '카테고리 응답을 읽지 못했습니다.')
  const id = readString(value.id)
  const userId = readString(value.user_id)
  const name = readString(value.name)
  const createdAt = readString(value.created_at)
  const updatedAt = readString(value.updated_at) ?? createdAt
  if (!id || !userId || !name || !createdAt || !updatedAt) {
    throw new AppError('REQUEST_FAILED', '카테고리 응답을 읽지 못했습니다.')
  }
  return {
    id,
    userId,
    name,
    parentId: readNullableString(value.parent_id),
    icon: readNullableString(value.icon),
    color: readNullableString(value.color),
    sortOrder: readNumber(value.sort_order) ?? 0,
    createdAt,
    updatedAt,
  }
}

function now() {
  return new Date().toISOString()
}

export type CategoryRepository = {
  getCategories: () => Promise<Category[]>
  getCategory: (id: string) => Promise<Category>
  createCategory: (userId: string, input: CategoryInput) => Promise<Category>
  updateCategory: (id: string, input: CategoryInput) => Promise<Category>
  deleteCategory: (id: string) => Promise<void>
  reorderCategories: (orderedIds: string[]) => Promise<void>
}

export function createCategoryRepository(client: SupabaseClient<Database>): CategoryRepository {
  return {
    async getCategories() {
      const { data, error } = await client
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw mapDbError(error)
      return (data ?? []).map(mapCategoryRow)
    },

    async getCategory(id) {
      const { data, error } = await client.from('categories').select('*').eq('id', id).maybeSingle()
      if (error) throw mapDbError(error)
      if (!data) throw new AppError('CATEGORY_NOT_FOUND', '카테고리를 찾지 못했습니다.')
      return mapCategoryRow(data)
    },

    async createCategory(userId, input) {
      const name = input.name?.trim() ?? ''
      if (!name) throw new AppError('INVALID_INPUT', '카테고리 이름을 입력해 주세요.')
      const { data, error } = await client
        .from('categories')
        .insert({
          ...(input.id ? { id: input.id } : {}),
          user_id: userId,
          name,
          parent_id: input.parentId ?? null,
          icon: input.icon ?? null,
          color: input.color ?? null,
          sort_order: input.sortOrder ?? 0,
          updated_at: now(),
        })
        .select('*')
        .single()
      if (error) throw mapDbError(error, 'CATEGORY_NOT_FOUND')
      return mapCategoryRow(data)
    },

    async updateCategory(id, input) {
      const patch: Database['public']['Tables']['categories']['Update'] = { updated_at: now() }
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (!name) throw new AppError('INVALID_INPUT', '카테고리 이름을 입력해 주세요.')
        patch.name = name
      }
      if (input.parentId !== undefined) patch.parent_id = input.parentId
      if (input.icon !== undefined) patch.icon = input.icon
      if (input.color !== undefined) patch.color = input.color
      if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
      const { data, error } = await client.from('categories').update(patch).eq('id', id).select('*').maybeSingle()
      if (error) throw mapDbError(error)
      if (!data) throw new AppError('CATEGORY_NOT_FOUND', '카테고리를 찾지 못했습니다.')
      return mapCategoryRow(data)
    },

    async deleteCategory(id) {
      const { data, error } = await client.from('categories').delete().eq('id', id).select('id')
      if (error) throw mapDbError(error)
      if (!data || data.length === 0) throw new AppError('CATEGORY_NOT_FOUND', '카테고리를 찾지 못했습니다.')
    },

    async reorderCategories(orderedIds) {
      for (let index = 0; index < orderedIds.length; index += 1) {
        const id = orderedIds[index]
        if (!id) continue
        const { error } = await client
          .from('categories')
          .update({ sort_order: index, updated_at: now() })
          .eq('id', id)
        if (error) throw mapDbError(error)
      }
    },
  }
}
