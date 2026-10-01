import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCategoryTree } from './categoryTree.ts'
import type { Category } from '../../types/src/category.ts'

function category(patch: Partial<Category> & Pick<Category, 'id' | 'name' | 'parentId' | 'sortOrder'>): Category {
  return {
    userId: 'user',
    icon: null,
    color: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...patch,
  }
}

test('category tree keeps parents and children apart from the repository', () => {
  const tree = buildCategoryTree([
    category({ id: 'blanky', name: 'Blanky', parentId: 'project', sortOrder: 0 }),
    category({ id: 'study', name: '공부', parentId: 'school', sortOrder: 2 }),
    category({ id: 'school', name: '학교', parentId: null, sortOrder: 0 }),
    category({ id: 'exam', name: '시험', parentId: 'school', sortOrder: 1 }),
    category({ id: 'ai', name: '인공지능', parentId: 'school', sortOrder: 0 }),
    category({ id: 'project', name: '프로젝트', parentId: null, sortOrder: 1 }),
  ])
  assert.deepEqual(tree.map((node) => node.name), ['학교', '프로젝트'])
  assert.deepEqual(tree[0]?.children.map((node) => node.name), ['인공지능', '시험', '공부'])
  assert.deepEqual(tree[1]?.children.map((node) => node.name), ['Blanky'])
})
