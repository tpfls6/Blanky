import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cloneBlocks, coercePage, createBlock, findBlocksByText } from '../src/features/builder/schema.ts'
import { createBlock as createField } from '../src/features/records/registry.ts'
import { coerceRecordType, requiredError, validateField } from '../src/features/records/schema.ts'
import { builtinTemplates, forkCollections, remapCollections } from '../src/features/workspace/templates.ts'

test('builtin templates cover the starter set', () => {
  const names = builtinTemplates().map((item) => item.name)
  for (const name of ['빈 페이지', '운동 관리', '영화 기록', '링크 모음', '공부 관리', '프로젝트 관리']) {
    assert.ok(names.includes(name), name)
  }
})

test('template remap gives each page its own collection id', () => {
  const template = builtinTemplates().find((item) => item.id === 'tpl-workout')
  assert.ok(template)
  const first = crypto.randomUUID()
  const second = crypto.randomUUID()
  const a = remapCollections(cloneBlocks(template.blocks), new Map([[template.collections[0]?.id ?? '', first]]))
  const b = remapCollections(cloneBlocks(template.blocks), new Map([[template.collections[0]?.id ?? '', second]]))
  const idA = a.find((block) => block.type === 'collection')?.props.collectionId
  const idB = b.find((block) => block.type === 'collection')?.props.collectionId
  assert.equal(idA, first)
  assert.equal(idB, second)
  assert.notEqual(idA, template.collections[0]?.id)
})

test('user page coerce keeps description and collection blocks', () => {
  const page = coercePage({
    id: 'p1',
    name: '운동',
    description: '오늘',
    blocks: [{ id: 'c1', type: 'collection', props: { collectionId: 'col', view: 'card' } }],
  })
  assert.ok(page)
  assert.equal(page.description, '오늘')
  assert.equal(page.blocks[0]?.type, 'collection')
  assert.equal(page.blocks[0]?.props.view, 'card')
})

test('table and card views keep the same collection id', () => {
  const table = createBlock('collection', { collectionId: 'col-1', view: 'table' })
  const card = createBlock('collection', { collectionId: 'col-1', view: 'card' })
  assert.equal(table.props.collectionId, card.props.collectionId)
})

test('field validation keeps types separate', () => {
  assert.equal(validateField('number', 12), true)
  assert.equal(validateField('number', '12'), false)
  assert.equal(validateField('url', 'https://blanky.app'), true)
  assert.equal(validateField('url', 'not-a-url'), false)
  assert.equal(validateField('rating', 5), true)
  assert.equal(validateField('rating', 8), false)
  assert.equal(validateField('progress', 40), true)
  assert.equal(validateField('tags', ['gym']), true)
})

test('required number field fails on empty', () => {
  const type = coerceRecordType({
    id: 'x',
    name: '운동',
    icon: 'Dumbbell',
    color: '#3C8664',
    blocks: [createField('number', { label: '무게', required: true })],
  })
  assert.ok(type)
  const key = type.blocks.find((block) => block.type === 'number')?.fieldKey
  assert.ok(key)
  assert.ok(requiredError(type.blocks, { [key]: '' }))
})

test('fork clones nested collection blocks and schemas', () => {
  const type = coerceRecordType({
    id: 'col-1',
    name: '운동',
    icon: 'Dumbbell',
    color: '#3C8664',
    blocks: [{ id: 'f1', type: 'textField', fieldKey: 'name', props: { label: '운동명' } }],
  })
  assert.ok(type)
  const nested = [
    createBlock('columns', {}, [
      createBlock('column', { width: 50 }, [createBlock('collection', { collectionId: 'col-1', view: 'table' })]),
      createBlock('column', { width: 50 }, [createBlock('text', { text: '스쿼트' })]),
    ]),
  ]
  const once = forkCollections(nested, [type])
  const twice = forkCollections(nested, [type])
  const idA = once.blocks[0]?.children?.[0]?.children?.[0]?.props.collectionId
  const idB = twice.blocks[0]?.children?.[0]?.children?.[0]?.props.collectionId
  assert.ok(idA)
  assert.notEqual(idA, 'col-1')
  assert.notEqual(idA, idB)
  assert.equal(once.collections[0]?.id, idA)
  assert.notEqual(once.collections[0]?.blocks[0]?.id, type.blocks[0]?.id)
  assert.notEqual(once.collections[0]?.blocks.find((block) => block.type === 'textField')?.fieldKey, 'name')
})

test('movie and link starters fork without sharing collection ids', () => {
  for (const id of ['tpl-movie', 'tpl-links']) {
    const starter = builtinTemplates().find((item) => item.id === id)
    assert.ok(starter, id)
    const a = forkCollections(starter.blocks, [], starter.collections)
    const b = forkCollections(starter.blocks, [], starter.collections)
    const colA = a.blocks.find((block) => block.type === 'collection')?.props.collectionId
    const colB = b.blocks.find((block) => block.type === 'collection')?.props.collectionId
    assert.ok(colA)
    assert.notEqual(colA, colB)
    assert.equal(a.collections.length, 1)
    assert.equal(a.collections[0]?.id, colA)
  }
})

test('find in page matches nested text', () => {
  const nested = [
    createBlock('columns', {}, [
      createBlock('column', { width: 50 }, [createBlock('text', { text: '스쿼트 기록' })]),
      createBlock('column', { width: 50 }, [createBlock('text', { text: '다른 내용' })]),
    ]),
  ]
  const hits = findBlocksByText(nested, '스쿼트')
  assert.equal(hits.length, 1)
  assert.equal(findBlocksByText(nested, '없는말').length, 0)
})

test('field rename keeps the field key', () => {
  const type = coerceRecordType({
    id: 'x',
    name: '운동',
    icon: 'Dumbbell',
    color: '#3C8664',
    blocks: [{ id: 'f1', type: 'textField', fieldKey: 'name', props: { label: '운동명' } }],
  })
  assert.ok(type)
  const field = type.blocks.find((block) => block.fieldKey === 'name')
  assert.ok(field)
  assert.equal(field.fieldKey, 'name')
})
