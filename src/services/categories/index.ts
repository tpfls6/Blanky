import { AppError, createCategoryRepository, type CategoryInput } from '@blanky/api'
import type { Category, CategoryNode } from '@blanky/types'
import { buildCategoryTree } from '@blanky/utils'
import { getCurrentUserId } from '../auth/index.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'

async function repository() {
  if (!isSupabaseConfigured) throw new AppError('UNAUTHORIZED', '로그인이 필요합니다.')
  const userId = await getCurrentUserId()
  if (!userId) throw new AppError('UNAUTHORIZED', '로그인이 필요합니다.')
  return { userId, categories: createCategoryRepository(getSupabaseClient()) }
}

export async function getCategories(): Promise<Category[]> {
  const { categories } = await repository()
  return categories.getCategories()
}

export async function getCategory(id: string): Promise<Category> {
  const { categories } = await repository()
  return categories.getCategory(id)
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const { userId, categories } = await repository()
  return categories.createCategory(userId, input)
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  const { categories } = await repository()
  return categories.updateCategory(id, input)
}

export async function deleteCategory(id: string): Promise<void> {
  const { categories } = await repository()
  return categories.deleteCategory(id)
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const { categories } = await repository()
  return categories.reorderCategories(orderedIds)
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  return buildCategoryTree(await getCategories())
}
