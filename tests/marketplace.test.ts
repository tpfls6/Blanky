import assert from 'node:assert/strict'
import { test } from 'node:test'
import { forkSnapshot, sameInstallShape } from '../src/features/marketplace/install.ts'
import { officialListings } from '../src/features/marketplace/official.ts'
import { packageSnapshot, safeHttpsUrl, SanitizeError } from '../src/features/marketplace/sanitize.ts'
import { builtinTemplates } from '../src/features/workspace/templates.ts'
import { createPage } from '../src/features/builder/schema.ts'

test('official listings cover the five starter templates', () => {
  const names = officialListings().map((item) => item.name)
  for (const name of ['운동 관리', '영화 기록', '링크 모음', '공부 관리', '프로젝트 관리']) {
    assert.ok(names.includes(name), name)
  }
  assert.ok(officialListings().every((item) => item.status === 'published' && item.creatorId === null))
})

test('packaging keeps collection schema and drops live-looking pii', () => {
  const starter = builtinTemplates().find((item) => item.id === 'tpl-movie')
  assert.ok(starter)
  const page = { ...createPage(starter.name, starter.icon, starter.blocks), collections: starter.collections }
  const snapshot = packageSnapshot({
    source: page,
    name: '영화 기록',
    description: '본 영화와 감상',
    category: 'media',
    tags: ['영화'],
    thumbnailUrl: 'https://images.example.com/cover.png',
    gallery: [],
    language: 'ko',
    guide: '별점과 감상평을 남기세요.',
    samples: [{ collectionId: starter.collections[0]!.id, title: '기생충', values: { note: '좋았다' } }],
  })
  assert.equal(snapshot.collections.length, 1)
  assert.ok(snapshot.collections[0]?.blocks.some((block) => block.props.label === '별점'))
  assert.throws(() => packageSnapshot({
    source: page,
    name: '영화 기록',
    description: 'contact me at leak@example.com',
    category: 'media',
    tags: [],
    thumbnailUrl: '',
    gallery: [],
    language: 'ko',
    guide: '',
    samples: [],
  }), SanitizeError)
})

test('dangerous urls are rejected and https is kept', () => {
  assert.equal(safeHttpsUrl('javascript:alert(1)'), null)
  assert.equal(safeHttpsUrl('http://blanky.app'), null)
  assert.equal(safeHttpsUrl('https://blanky.app/docs'), 'https://blanky.app/docs')
})

test('install forks ids so the listing snapshot stays unchanged', () => {
  const listing = officialListings().find((item) => item.name === '영화 기록')
  assert.ok(listing)
  const first = forkSnapshot(listing.snapshot)
  const second = forkSnapshot(listing.snapshot)
  const sourceId = listing.snapshot.collections[0]?.id
  assert.ok(sourceId)
  assert.notEqual(first.page.id, second.page.id)
  assert.notEqual(first.collections[0]?.id, sourceId)
  assert.notEqual(first.collections[0]?.id, second.collections[0]?.id)
  assert.equal(first.page.blocks.find((block) => block.type === 'collection')?.props.collectionId, first.collections[0]?.id)
  assert.ok(first.records.length >= 1)
  assert.equal(first.records[0]?.typeId, first.collections[0]?.id)
  const sourceKey = listing.snapshot.collections[0]?.blocks.find((block) => block.props.label === '영화 제목')?.fieldKey
  const destKey = first.collections[0]?.blocks.find((block) => block.props.label === '영화 제목')?.fieldKey
  assert.ok(sourceKey)
  assert.ok(destKey)
  assert.notEqual(sourceKey, destKey)
  assert.equal(first.records[0]?.values[destKey], '기생충')
  assert.equal(listing.snapshot.collections[0]?.id, sourceId)
  assert.ok(sameInstallShape(listing.snapshot, first))
})

test('workout install keeps number fields and does not share collection ids', () => {
  const listing = officialListings().find((item) => item.name === '운동 관리')
  assert.ok(listing)
  const installed = forkSnapshot(listing.snapshot)
  const weight = installed.collections[0]?.blocks.find((block) => block.props.label === '무게')
  assert.ok(weight?.fieldKey)
  assert.equal(installed.records[0]?.values[weight.fieldKey], 60)
})
