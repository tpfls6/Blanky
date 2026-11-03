import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ envDir: false, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { createPageReadingRepository, READING_STATE_KIND } = await server.ssrLoadModule('/src/features/pages/readingPageRepository.ts')
  const { packMemo, unpackMemo, packReading, recordsForPage } = await server.ssrLoadModule('/src/features/pages/pageRecords.ts')
  let records = []
  const now = new Date().toISOString()
  const record = (id, typeId, input) => ({ id, typeId, ...input, templateVersion: 1, createdAt: now, updatedAt: now })
  const legacy = { id: 'legacy', title: 'Old book', author: 'Author', image: '', note: 'Original review', rating: 4.5, createdAt: now, updatedAt: now }
  records.push(record(legacy.id, 'page-a', packReading(legacy)))
  const storage = pageId => ({
    records: () => records,
    put: async (id, input) => {
      id ??= crypto.randomUUID()
      records = [record(id, pageId, input), ...records.filter(row => row.id !== id)]
    },
    remove: async id => { records = records.filter(row => row.id !== id) },
  })
  const a = createPageReadingRepository('owner', 'page-a', storage('page-a'))
  const b = createPageReadingRepository('owner', 'page-b', storage('page-b'))
  assert.equal((await a.getUserBook('legacy')).review, legacy.note)
  assert.equal((await b.getMyBooks()).books.length, 0)
  const shelf = await a.createShelf({ name: 'Shelf', description: '', icon: 'BookOpen', color: '#3C8664', sort_order: 0 })
  await a.updateShelf(shelf.id, { ...shelf, name: 'Updated shelf' })
  await a.addBookToShelf('legacy', shelf.id)
  await a.addBookToShelf('legacy', shelf.id)
  assert.equal((await a.getMyBooks()).memberships.length, 1)
  const metadata = { ...((await a.getUserBook('legacy')).book), external_id: 'new', title: 'New book', categories: ['Fiction'] }
  const id = await a.addBook(metadata, 'reading', [shelf.id])
  await a.updateBook(id, { rating: 5, review: 'Updated review', tags: ['one'], reading_status: 'done' })
  await a.setBookCategories(id, ['Computers', 'Custom category', 'Computers'])
  assert.deepEqual((await a.getUserBook(id)).book.categories, ['Computers', 'Custom category'])
  await a.updateBookMetadata(id, { title: 'Renamed book', author: 'New author', cover_url: null, categories: ['Science'] })
  assert.deepEqual((await a.getUserBook(id)).book.categories, ['Science'])
  await a.setBookCategories(id, [])
  assert.deepEqual((await a.getUserBook(id)).book.categories, [])
  const h = await a.createHighlight(id, { content: 'Quote', page_number: 2, note: 'Note', tags: [], source_type: 'manual', source_url: null, source_title: null })
  await a.updateHighlight(h.id, { ...h, content: 'Edited quote' })
  const n = await a.createReadingNote(id, { content: 'Reading note', tags: ['tag'] })
  await a.updateReadingNote(n.id, { content: 'Edited note', tags: [] })
  assert.equal((await a.getHighlights(id))[0].content, 'Edited quote')
  assert.equal((await a.getReadingNotes(id))[0].content, 'Edited note')
  await assert.rejects(() => b.addBookToShelf(id, shelf.id))
  await assert.rejects(() => b.updateBook(id, { rating: 1 }))
  assert.equal((await b.getMyBooks()).shelves.length, 0)
  const reloaded = createPageReadingRepository('owner', 'page-a', storage('page-a'))
  assert.equal((await reloaded.getUserBook(id)).review, 'Updated review')
  assert.equal((await reloaded.getMyBooks()).shelves[0].name, 'Updated shelf')
  assert.equal(recordsForPage(records, 'page-a').length, 2, 'metadata is not a book record')
  assert.equal(records.filter(row => row.values.kind === READING_STATE_KIND).length, 1)
  await a.removeBookFromShelf(id, shelf.id)
  await a.deleteShelf(shelf.id)
  assert.equal((await a.getMyBooks()).memberships.length, 0)
  assert.equal((await a.getMyBooks()).books.length, 2)
  await a.removeBook(id)
  assert.equal((await a.getHighlights(id)).length, 0)
  assert.equal((await a.getReadingNotes(id)).length, 0)
  assert.equal((await a.getUserBook('legacy')).review, legacy.note)
  const memo = { id: 'memo', title: 'Memo', body: 'Body', categoryId: 'category', tags: ['tag'], createdAt: now, updatedAt: now }
  assert.deepEqual(unpackMemo(record('memo', 'memo-page', packMemo(memo))), memo)
  console.log('PASS custom reading legacy compatibility, book/shelf/category CRUD, memberships, notes/highlights, reload, page isolation, memo category/tag round trip')
} finally { await server.close() }
