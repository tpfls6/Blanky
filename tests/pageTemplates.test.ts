import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coercePage } from '../src/features/builder/schema.ts'
import {
  recordsForPage,
  packDiary,
  unpackDiary,
  packReading,
  unpackReading,
  packMemo,
  unpackMemo,
} from '../src/features/pages/pageRecords.ts'
import {
  coerceFieldLabels,
  coerceTemplate,
  fieldLabel,
  isSystemRecordType,
  pageTypeMarker,
  DEFAULT_FIELD_LABELS,
} from '../src/features/pages/templates.ts'
import type { CustomRecord, DiaryEntry } from '../src/types/records.ts'

function record(pageId: string, id: string, values: CustomRecord['values']): CustomRecord {
  return {
    id,
    typeId: pageId,
    title: 'row',
    values,
    templateVersion: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

test('two pages on the same template keep separate records', () => {
  const movie = 'page-movie'
  const book = 'page-book'
  const rows = [
    record(movie, 'a', { title: '기생충' }),
    record(book, 'b', { title: '데미안' }),
    record(movie, 'c', { title: '올드보이' }),
  ]
  assert.deepEqual(recordsForPage(rows, movie).map((item) => item.id), ['a', 'c'])
  assert.deepEqual(recordsForPage(rows, book).map((item) => item.id), ['b'])
})

test('renaming a label does not change stored keys', () => {
  const entry: DiaryEntry = {
    id: 'd1',
    date: '2026-10-01',
    title: '운동',
    body: '스쿼트',
    tags: ['하체'],
    mood: 'good',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
  const packed = packDiary(entry)
  assert.equal(packed.values.mood, 'good')
  assert.equal(packed.values.body, '스쿼트')
  assert.equal(fieldLabel('diary', 'mood', { mood: '운동 컨디션' }), '운동 컨디션')
  assert.equal(Object.keys(packed.values).includes('mood'), true)
  const roundtrip = unpackDiary({
    id: entry.id,
    typeId: 'page-1',
    title: packed.title,
    values: packed.values,
    templateVersion: 1,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  })
  assert.equal(roundtrip.mood, 'good')
  assert.equal(roundtrip.body, '스쿼트')
})

test('page diary marker is not the builtin diary marker', () => {
  assert.equal(pageTypeMarker('diary'), 'blanky:page:diary:v1')
  assert.notEqual(pageTypeMarker('diary'), 'blanky:system:diary:v1')
  assert.equal(isSystemRecordType(pageTypeMarker('memo')), true)
  assert.equal(isSystemRecordType('운동 기록'), false)
})

test('coercePage keeps template and labels and drops unknown templates', () => {
  const page = coercePage({
    id: 'p1',
    name: '영화',
    icon: 'Film',
    template: 'reading',
    fieldLabels: { title: '영화 제목', author: '감독', extra: '무시' },
    blocks: [],
  })
  assert.ok(page)
  assert.equal(page.template, 'reading')
  assert.equal(page.fieldLabels.title, '영화 제목')
  assert.equal(page.fieldLabels.author, '감독')
  assert.equal(page.fieldLabels.extra, undefined)
  assert.equal(coercePage({ id: 'p2', name: '옛', template: 'kanban', blocks: [] })?.template, null)
  assert.equal(coerceTemplate('memo'), 'memo')
  assert.equal(coerceTemplate('board'), null)
})

test('label fallbacks stay on the default copy', () => {
  assert.equal(fieldLabel('reading', 'title', {}), DEFAULT_FIELD_LABELS.reading.title)
  assert.equal(fieldLabel('reading', 'title', { title: ' 영화 제목 ' }), '영화 제목')
  assert.deepEqual(coerceFieldLabels({ title: '', author: '감독' }, 'reading'), { author: '감독' })
})

test('reading and memo pack keep internal keys', () => {
  const reading = unpackReading(
    record('p', 'r1', packReading({
      id: 'r1',
      title: '기생충',
      author: '봉준호',
      rating: 5,
      note: '좋았다',
      image: 'https://example.com/a.png',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    }).values),
  )
  assert.equal(reading.title, '기생충')
  assert.equal(reading.author, '봉준호')
  assert.equal(reading.rating, 5)
  const memo = unpackMemo(record('p', 'm1', packMemo({
    id: 'm1',
    title: '아이디어',
    body: '본문',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }).values))
  assert.equal(memo.title, '아이디어')
  assert.equal(memo.body, '본문')
  assert.equal(memo.categoryId, null)
})
test('reading page words follow custom labels with matching particles', async () => {
  const { josa, readingText } = await import('../src/pages/Reading/readingText.ts')
  assert.equal(josa('책', '을'), '책을')
  assert.equal(josa('영화', '을'), '영화를')
  assert.equal(josa('서재', '으로'), '서재로')
  assert.equal(josa('책장', '으로'), '책장으로')
  assert.equal(josa('서울', '으로'), '서울로')
  assert.equal(josa('Game', '을'), 'Game을(를)')
  const { createTranslator } = await import('../src/i18n/translate.ts')
  const ko = createTranslator('ko'), en = createTranslator('en')
  const builtin = readingText(ko, 'ko')
  assert.equal(builtin.item, '책')
  assert.equal(builtin.status('reading'), '읽는 중')
  assert.equal(builtin.say('itemMissing'), '책을 찾을 수 없어요.')
  assert.equal(builtin.count(3, '이'), '3권이')
  const english = readingText(en, 'en')
  assert.deepEqual([english.item, english.status('reading'), english.say('itemMissing'), english.count(1), english.count(3)], ['book', 'Reading', "Couldn't find this book.", '1 book', '3 books'])
  const movie = readingText(ko, 'ko', { item: '영화', shelf: '컬렉션', statusReading: '보는 중' })
  assert.equal(movie.say('emptyBody'), '검색해서 첫 영화를 추가하거나 다른 컬렉션을 선택해 보세요.')
  assert.equal(movie.item, '영화')
  assert.equal(movie.shelf, '컬렉션')
  assert.equal(movie.status('reading'), '보는 중')
  assert.equal(movie.status('done'), '완독')
  assert.deepEqual(movie.statuses().map(([id]) => id), ['want', 'reading', 'done', 'stopped'])
})

test('reading page wording keys are stored with the page', () => {
  const labels = coerceFieldLabels({ item: ' 영화 ', statusDone: '다 봤음', tagline: '보고 기억해요', unknown: 'x' }, 'reading')
  assert.deepEqual(labels, { item: '영화', tagline: '보고 기억해요', statusDone: '다 봤음' })
  assert.equal(DEFAULT_FIELD_LABELS.reading.shelf, '책장')
})
