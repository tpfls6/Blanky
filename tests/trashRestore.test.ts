import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asPageTrash, parseTrash, toTrash, trashKindLabel } from '../src/utils/trash.ts'

test('a deleted custom page keeps its record type and records for 복구', () => {
  const page = { id: 'p1', name: '운동', icon: 'Dumbbell', description: '', sort: 2, schemaVersion: 1, blocks: [], template: 'checklist', fieldLabels: {}, createdAt: 't', updatedAt: 't' }
  const recordType = { id: 'p1', name: '운동', icon: 'Dumbbell', color: '#000', description: 'x', schemaVersion: 1, version: 1, blocks: [], createdAt: 't', updatedAt: 't' }
  const records = [
    { id: 'r1', typeId: 'p1', title: '달리기', values: {}, templateVersion: 1, createdAt: 't', updatedAt: 't' },
    { id: 'r2', typeId: 'other', title: '남의 기록', values: {}, templateVersion: 1, createdAt: 't', updatedAt: 't' },
  ]
  const row = parseTrash(JSON.parse(JSON.stringify(toTrash('page', { id: 'p1', page, recordType, records }, page.name))))
  assert.ok(row)
  assert.equal(row.kind, 'page')
  assert.equal(row.id, 'p1')
  assert.equal(trashKindLabel(row), '페이지')
  const bundle = asPageTrash(row.payload)
  assert.ok(bundle)
  assert.equal(bundle.page.name, '운동')
  assert.equal(bundle.recordType?.id, 'p1')
  assert.deepEqual(bundle.records.map(item => item.id), ['r1'], 'only the page own records come back')
  assert.equal(asPageTrash({ page: { id: 'p1' } }), null)
  assert.equal(asPageTrash({ id: 'p1', page, recordType: { ...recordType, id: 'other' }, records: [] })?.recordType, null)
})
