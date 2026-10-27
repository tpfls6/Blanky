import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asMemo, parseTrash, toTrash, trashKindLabel } from '../src/utils/trash.ts'

test('trash snapshot roundtrips and drops junk', () => {
  const memo = asMemo({ id: 'm1', title: '제목', body: '본문', categoryId: null, tags: [], createdAt: 't', updatedAt: 't' })
  assert.ok(memo)
  const row = toTrash('memo', memo, memo.title)
  assert.equal(parseTrash(row)?.id, 'm1')
  assert.equal(trashKindLabel(row), '메모')
  assert.equal(asMemo({ title: 'no-id' }), null)
  assert.equal(parseTrash({ kind: 'memo' }), null)
})
