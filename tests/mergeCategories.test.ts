import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeCategories } from '../src/utils/mergeCategories.ts'
const projectId = '11111111-1111-4111-8111-111111111111'
const blankyId = '22222222-2222-4222-8222-222222222222'
const local = [
  { id: 'project', name: 'Project', parentId: null, kind: 'area' as const },
  { id: 'blanky', name: 'Blanky', parentId: 'project', kind: 'project' as const },
  { id: 'stockmate', name: 'StockMate', parentId: 'project' },
]
const remote = [
  { id: projectId, name: 'Project', parentId: null },
  { id: blankyId, name: 'Blanky', parentId: projectId },
]
test('time assignment reconciles legacy folders and remaps all records, including unassigned tasks', () => {
  const merged = mergeCategories(local, remote)
  assert.equal(merged.categories.filter(c => c.name === 'Project').length, 1)
  assert.equal(merged.categories.find(c => c.id === 'stockmate')?.parentId, projectId)
  assert.equal(merged.categories.find(c => c.id === blankyId)?.kind, 'project')
  assert.deepEqual([{ categoryId:'blanky', startTime:'12:00' }, { categoryId:'blanky', startTime:null }, { categoryId:'stockmate', startTime:null }].map(merged.remap), [
    { categoryId:blankyId, startTime:'12:00' }, { categoryId:blankyId, startTime:null }, { categoryId:'stockmate', startTime:null },
  ])
  assert.equal(merged.remap({categoryId:'project'}).categoryId, projectId)
  assert.equal(merged.remap({categoryId:null}).categoryId, null)
})
test('reload repairs previously split folders and repeated merges are stable', () => {
  const once = mergeCategories([...local, ...remote], remote)
  assert.deepEqual(mergeCategories(once.categories,remote).categories,once.categories)
  assert.equal(once.categories.length,3)
})
test('same names under different parents stay separate', () => {
  const merged=mergeCategories(local,[{id:blankyId,name:'Blanky',parentId:null}])
  assert.equal(merged.remap({categoryId:'blanky'}).categoryId,'blanky')
})
test('distinct UUID categories and ambiguous matches are never merged by name', () => {
  const otherId='33333333-3333-4333-8333-333333333333'
  assert.equal(mergeCategories([{id:otherId,name:'Project',parentId:null}],remote).categories.length,3)
  const merged=mergeCategories(local,[...remote,{id:otherId,name:'Project',parentId:null}])
  assert.equal(merged.remap({categoryId:'project'}).categoryId,'project')
})
