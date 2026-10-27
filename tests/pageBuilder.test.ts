import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_TEMPLATES, blocksFromTemplate, filterMenu } from '../src/features/builder/catalog.ts'
import {
  coercePage,
  convertBlock,
  createBlock,
  createPage,
  duplicateBlock,
  emptyHistory,
  moveBy,
  normalizePages,
  patchBlock,
  pushHistory,
  redo,
  removeBlock,
  setColumnWidth,
  toColumns,
  undo,
} from '../src/features/builder/schema.ts'

test('coerce drops unknown blocks and keeps user text', () => {
  const page = coercePage({
    id: 'p1',
    name: ' 공부 ',
    blocks: [
      { id: 'bad', type: 'virus', props: { text: 'x' } },
      { id: 'ok', type: 'text', props: { text: '본문' } },
    ],
  })
  assert.ok(page)
  assert.equal(page.name, '공부')
  assert.equal(page.blocks.length, 1)
  assert.equal(page.blocks[0]?.props.text, '본문')
})

test('duplicate and convert keep content without sharing ids', () => {
  const text = createBlock('text', { text: '안녕' })
  const copy = duplicateBlock([text], text.id)
  assert.equal(copy.length, 2)
  assert.notEqual(copy[1]?.id, text.id)
  assert.equal(copy[1]?.props.text, '안녕')
  const heading = convertBlock([text], text.id, 'heading')
  assert.equal(heading[0]?.type, 'heading')
  assert.equal(heading[0]?.props.text, '안녕')
})

test('move, columns, and undo restore the previous tree', () => {
  const a = createBlock('text', { text: 'a' })
  const b = createBlock('text', { text: 'b' })
  const moved = moveBy([a, b], a.id, 1)
  assert.equal(moved[1]?.id, a.id)
  const cols = toColumns([a], a.id, 2)
  assert.equal(cols[0]?.type, 'columns')
  assert.equal(cols[0]?.children?.length, 2)
  const resized = setColumnWidth(cols, cols[0]?.children?.[0]?.id ?? '', 70)
  assert.equal(resized[0]?.children?.[0]?.props.width, 70)
  assert.equal((resized[0]?.children?.[1]?.props.width ?? 0) + 70, 100)
  const gone = removeBlock(moved, a.id)
  assert.equal(gone.length, 1)
  const history = pushHistory(emptyHistory(), [a])
  const undone = undo(history, [b])
  assert.equal(undone.blocks[0]?.id, a.id)
  const redone = redo(undone.history, undone.blocks)
  assert.equal(redone.blocks[0]?.id, b.id)
})

test('templates clone blocks so saved pages do not share ids', () => {
  const study = BUILTIN_TEMPLATES.find((item) => item.id === 'study')
  assert.ok(study)
  const once = blocksFromTemplate(study)
  const twice = blocksFromTemplate(study)
  assert.notEqual(once[0]?.id, twice[0]?.id)
  assert.ok(once.some((block) => block.type === 'widget-tasks'))
  const page = createPage('대시보드', 'House', once, 0)
  assert.equal(normalizePages([page, { id: 'x' }]).length, 1)
  assert.ok(filterMenu('할일').some((item) => item.id === 'tasks'))
  assert.equal(patchBlock(once, once[0]?.id ?? '', { text: '바꾼 제목' })[0]?.props.text, '바꾼 제목')
})
