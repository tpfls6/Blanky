import assert from 'node:assert/strict'
import { test } from 'node:test'
import { forkSnapshot, sameInstallShape } from '../src/features/marketplace/install.ts'
import { officialListings } from '../src/features/marketplace/official.ts'
import { coerceSnapshot, packageSnapshot, safeHttpsUrl, SanitizeError } from '../src/features/marketplace/sanitize.ts'
import { builtinTemplates } from '../src/features/workspace/templates.ts'
import { createPage } from '../src/features/builder/schema.ts'

test('official listings are the four complete notebooks', () => {
  const names = officialListings().map((item) => item.name)
  assert.deepEqual([...names].sort(), ['가계부', '공부 내용 기록', '여행 기록', '영화 기록'].sort())
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

test('system page templates keep pageType through package and install', () => {
  const page = createPage('내 일기', 'BookOpen', [])
  page.template = 'diary'
  page.fieldLabels = { title: '오늘의 한줄' }
  const snapshot = packageSnapshot({
    source: page,
    name: '내 일기',
    description: '일기 템플릿',
    category: 'free',
    tags: ['일기'],
    thumbnailUrl: '',
    gallery: [],
    language: 'ko',
    guide: '',
    samples: [],
  })
  assert.equal(snapshot.pageType, 'diary')
  assert.equal(snapshot.fieldLabels?.title, '오늘의 한줄')
  assert.equal(snapshot.blocks.length, 0)
  const installed = forkSnapshot(snapshot)
  assert.equal(installed.page.template, 'diary')
  assert.equal(installed.page.fieldLabels?.title, '오늘의 한줄')
  assert.equal(installed.page.blocks.length, 0)
  const again = coerceSnapshot(JSON.parse(JSON.stringify(snapshot)))
  assert.equal(again?.pageType, 'diary')
  assert.equal(again?.fieldLabels?.title, '오늘의 한줄')
})

test('finance install keeps number fields and does not share collection ids', () => {
  const listing = officialListings().find((item) => item.name === '가계부')
  assert.ok(listing)
  const installed = forkSnapshot(listing.snapshot)
  const amount = installed.collections[0]?.blocks.find((block) => block.props.label === '금액')
  assert.ok(amount?.fieldKey)
  assert.equal(installed.records[0]?.values[amount.fieldKey], 2800000)
})
