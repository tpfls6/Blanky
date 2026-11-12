import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Highlight, LibraryBook, ReadingNote, ReadingShelfBook, Shelf } from '../packages/types/src/reading.ts'
import { sameBook } from '../packages/types/src/reading.ts'
import { keepThenRemove, ReadingRestoreError, snapshotBook, verifyCopy, writeCopy, type CopyStore } from '../src/services/reading/restore.ts'
import { withBookRestored, withoutBook, withRestoreProgress } from '../src/utils/readingLogs.ts'
import { asBookTrash, parseTrash, type ReadingCopy, type TrashItem } from '../src/utils/trash.ts'
import type { Book, ReadingLog } from '../src/types/records.ts'

/** An in-memory reading store that behaves like the real ones where 복구 depends on it: addBook keeps one
 *  book per title (sameBook) under a new id, removeBook takes its quotes, notes and shelf links along, and
 *  quote and note ids are unique. `failNext(step)` makes the next call of that step throw once. */
function memoryStore() {
  const state = { books: [] as LibraryBook[], shelves: [] as Shelf[], memberships: [] as ReadingShelfBook[], highlights: [] as Highlight[], notes: [] as ReadingNote[] }
  const failing = new Map<string, number>()
  const calls = new Map<string, number>()
  let serial = 0
  const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, serial++)).toISOString()
  const step = (name: string) => {
    const count = (calls.get(name) ?? 0) + 1
    calls.set(name, count)
    const at = failing.get(name)
    if (at !== undefined && count >= at) { failing.delete(name); throw new Error('injected ' + name) }
  }
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
  const repo: CopyStore = {
    async getMyBooks() { step('getMyBooks'); return clone({ books: state.books, shelves: state.shelves, memberships: state.memberships }) },
    async getHighlights(id) { step('getHighlights'); return clone(state.highlights.filter(row => row.user_book_id === id)) },
    async getReadingNotes(id) { step('getReadingNotes'); return clone(state.notes.filter(row => row.user_book_id === id)) },
    async addBook(book, status) {
      step('addBook')
      const found = state.books.find(row => sameBook(row.book, book))
      if (found) return found.id
      const now = stamp(), id = 'ub-' + serial
      state.books.unshift({ id, user_id: 'u', book_id: 'm-' + id, reading_status: status, rating: null, current_page: 0, total_pages: book.page_count, progress: 0, started_at: null, finished_at: null, review: '', tags: [], created_at: now, updated_at: now, book: { ...book, id: 'm-' + id, created_at: now } })
      return id
    },
    async updateBook(id, patch) {
      step('updateBook')
      const book = state.books.find(row => row.id === id)
      if (!book) throw new Error('missing')
      Object.assign(book, patch, { updated_at: stamp() })
      return clone(book)
    },
    async removeBook(id) {
      step('removeBook')
      state.books = state.books.filter(row => row.id !== id)
      state.memberships = state.memberships.filter(row => row.user_book_id !== id)
      state.highlights = state.highlights.filter(row => row.user_book_id !== id)
      state.notes = state.notes.filter(row => row.user_book_id !== id)
    },
    async addBookToShelf(bookId, shelfId) {
      step('addBookToShelf')
      if (!state.memberships.some(row => row.user_book_id === bookId && row.shelf_id === shelfId)) state.memberships.push({ user_id: 'u', user_book_id: bookId, shelf_id: shelfId, created_at: stamp() })
    },
    async createHighlight(bookId, input, id = 'h-' + serial++) {
      step('createHighlight')
      if (state.highlights.some(row => row.id === id)) throw new Error('duplicate highlight')
      const now = stamp(), row = { ...input, id, user_id: 'u', user_book_id: bookId, created_at: now, updated_at: now }
      state.highlights.unshift(row)
      return clone(row)
    },
    async updateHighlight(id, input) {
      step('updateHighlight')
      const row = state.highlights.find(item => item.id === id)!
      Object.assign(row, input, { updated_at: stamp() })
      return clone(row)
    },
    async createReadingNote(bookId, input, id = 'n-' + serial++) {
      step('createReadingNote')
      if (state.notes.some(row => row.id === id)) throw new Error('duplicate note')
      const now = stamp(), row = { ...input, id, user_id: 'u', user_book_id: bookId, created_at: now, updated_at: now }
      state.notes.unshift(row)
      return clone(row)
    },
    async updateReadingNote(id, input) {
      step('updateReadingNote')
      const row = state.notes.find(item => item.id === id)!
      Object.assign(row, input, { updated_at: stamp() })
      return clone(row)
    },
  }
  return { repo, state, failNext: (name: string, at = 1) => failing.set(name, (calls.get(name) ?? 0) + at) }
}

const legacy: Book = { id: 'legacy-1', title: '데미안', author: '헤세', cover: null, startedAt: '2026-01-02', finishedAt: null, currentPage: 120, totalPages: 300, status: 'reading', createdAt: '2026-01-01T00:00:00.000Z' }
const logs: ReadingLog[] = [
  { id: 'log-1', bookId: 'legacy-1', date: '2026-01-02', page: 50, note: '', createdAt: '2026-01-02T00:00:00.000Z' },
  { id: 'log-2', bookId: 'legacy-1', date: '2026-01-03', page: 120, note: '좋은 장', createdAt: '2026-01-03T00:00:00.000Z' },
]

/** A library with one fully recorded book: rating, review, tags, pages, dates, two shelves, quotes and notes. */
async function seeded() {
  const store = memoryStore()
  const { repo, state } = store
  state.shelves.push({ id: 'shelf-a', user_id: 'u', name: '인생책', description: '', icon: '', color: '', sort_order: 0, created_at: 't', updated_at: 't' } as Shelf,
    { id: 'shelf-b', user_id: 'u', name: '다시 읽기', description: '', icon: '', color: '', sort_order: 1, created_at: 't', updated_at: 't' } as Shelf)
  const id = (await repo.addBook({ external_source: 'blanky-legacy', external_id: 'u:legacy-1', title: '데미안', author: '헤세', cover_url: null, page_count: 300, isbn10: null, isbn13: null, publisher: null, published_date: null, description: null }, 'reading'))!
  await repo.updateBook(id, { rating: 4.5, current_page: 120, total_pages: 300, progress: 40, started_at: '2026-01-02', finished_at: null, review: '알을 깨고 나오는 이야기', tags: ['고전', '성장'], reading_status: 'reading' })
  await repo.addBookToShelf(id, 'shelf-a')
  await repo.addBookToShelf(id, 'shelf-b')
  await repo.createHighlight(id, { content: '새는 알에서 나오려고 투쟁한다.', page_number: 98, note: '핵심', tags: ['명문장'], source_type: 'manual', source_url: null, source_title: null }, 'h-old')
  await repo.createHighlight(id, { content: '두 번째 문장', page_number: null, note: '', tags: [], source_type: 'manual', source_url: null, source_title: null }, 'h-old-2')
  await repo.createReadingNote(id, { content: '다시 읽고 싶다', tags: ['메모'] }, 'n-old')
  return { ...store, id }
}

type Local = { books: Book[]; logs: ReadingLog[]; trash: TrashItem[] }

/** The reading-page delete as the library runs it (trashReadingBook): snapshot, row kept, then the delete. */
async function trashBook(store: ReturnType<typeof memoryStore>, id: string, local: Local): Promise<Local> {
  const copy: ReadingCopy = { ...(await snapshotBook(store.repo, id)), legacyBookId: 'legacy-1', synced: false }
  const row = withoutBook(local, 'legacy-1', copy).trash[0]
  let next = local
  await keepThenRemove(() => { next = { ...next, trash: [row, ...next.trash] } }, () => store.repo.removeBook(id), () => { next = { ...next, trash: next.trash.filter(item => item !== row) } })
  return { ...next, books: next.books.filter(item => item.id !== 'legacy-1'), logs: next.logs.filter(item => item.bookId !== 'legacy-1') }
}

/** The 복구 as the library runs it (restoreBook), on the row as saved: a reload between tries is a JSON
 *  round trip. Progress is written into the row before anything else; the row only leaves once all passed.
 *  `failLocal` stops it at the last step (서재 book, logs and the row leaving go together). */
async function restore(store: ReturnType<typeof memoryStore>, local: Local, rowId: string, failLocal = false): Promise<Local> {
  let saved: Local = JSON.parse(JSON.stringify(local))
  saved = { ...saved, trash: saved.trash.map(item => parseTrash(item)!) }
  const row = saved.trash.find(item => item.id === rowId)
  const bundle = row ? asBookTrash(row.payload) : null
  if (!row || !bundle) return saved
  try {
    if (bundle.copy) {
      const result = await writeCopy(store.repo, bundle.copy, progress => { saved = { ...saved, trash: saved.trash.map(item => item.id === rowId ? withRestoreProgress(item, progress) : item) } })
      if (!result.intact) await verifyCopy(store.repo, bundle.copy, result.bookId)
    }
    if (failLocal) throw new Error('injected local')
    return withBookRestored(saved, rowId, bundle)
  } catch (error) {
    // The caller sees the failure; what was saved so far (the row with its progress) stays.
    throw Object.assign(error as Error, { saved })
  }
}

async function attempt(run: () => Promise<Local>): Promise<{ ok: true; local: Local } | { ok: false; local: Local; error: Error }> {
  try { return { ok: true, local: await run() } }
  catch (error) { return { ok: false, local: (error as { saved: Local }).saved, error: error as Error } }
}

function assertRestored(store: ReturnType<typeof memoryStore>, before: { book: LibraryBook; highlights: Highlight[]; notes: ReadingNote[] }, local: Local) {
  const { state } = store
  assert.equal(state.books.length, 1, 'exactly one copy of the book')
  const book = state.books[0]
  for (const key of ['reading_status', 'rating', 'current_page', 'total_pages', 'progress', 'started_at', 'finished_at', 'review'] as const) assert.deepEqual(book[key], before.book[key], key)
  assert.deepEqual(book.tags, before.book.tags)
  assert.deepEqual(state.memberships.filter(row => row.user_book_id === book.id).map(row => row.shelf_id).sort(), ['shelf-a', 'shelf-b'])
  const pick = (rows: { id: string; content: string; tags: string[] }[]) => rows.map(row => [row.id, row.content, row.tags.join()]).sort()
  assert.deepEqual(pick(state.highlights.filter(row => row.user_book_id === book.id)), pick(before.highlights))
  assert.equal(state.highlights.find(row => row.id === 'h-old')?.note, '핵심')
  assert.equal(state.highlights.find(row => row.id === 'h-old')?.page_number, 98)
  assert.deepEqual(pick(state.notes.filter(row => row.user_book_id === book.id)), pick(before.notes))
  assert.deepEqual(local.books.map(item => item.id), ['legacy-1'], '서재 book back once')
  assert.deepEqual(local.logs.map(item => item.id).sort(), ['log-1', 'log-2'], 'its logs back once')
  assert.equal(local.trash.length, 0, 'the row leaves only now')
}

const STEPS: [string, number?][] = [['addBook'], ['updateBook'], ['addBookToShelf', 2], ['createHighlight', 2], ['createReadingNote'], ['getHighlights', 2], ['getMyBooks', 2]]

for (const [step, at] of STEPS) {
  test(`복구 stopped at ${step}${at ? ' (call ' + at + ')' : ''} keeps the row, and a retry after a reload brings every field back`, async () => {
    const store = await seeded()
    const before = { book: store.state.books[0], highlights: [...store.state.highlights], notes: [...store.state.notes] }
    const snapshot = JSON.parse(JSON.stringify(before)) as typeof before
    let local = await trashBook(store, store.id, { books: [legacy], logs: [...logs], trash: [] })
    assert.equal(store.state.books.length, 0)
    store.failNext(step, at)
    const first = await attempt(() => restore(store, local, local.trash[0].id))
    assert.equal(first.ok, false, 'the injected failure surfaces')
    local = first.local
    assert.equal(local.trash.length, 1, 'snapshot kept')
    assert.equal(local.books.length, 0, '서재 book not back yet')
    const second = await attempt(() => restore(store, local, local.trash[0].id))
    assert.ok(second.ok, second.ok ? '' : second.error.message)
    assertRestored(store, snapshot, second.local)
  })
}

test('복구 stopped at the last local step (서재 book, logs, row) finishes on retry without a second copy', async () => {
  const store = await seeded()
  const snapshot = JSON.parse(JSON.stringify({ book: store.state.books[0], highlights: store.state.highlights, notes: store.state.notes }))
  let local = await trashBook(store, store.id, { books: [legacy], logs: [...logs], trash: [] })
  const first = await attempt(() => restore(store, local, local.trash[0].id, true))
  assert.equal(first.ok, false)
  local = first.local
  assert.equal(local.trash.length, 1)
  assert.equal(store.state.books.length, 1, 'remote copy already written')
  const second = await attempt(() => restore(store, local, local.trash[0].id))
  assert.ok(second.ok)
  assertRestored(store, snapshot, second.local)
})

test('a retry sets a record an earlier try changed back to the snapshot (only on the book this 복구 created)', async () => {
  const store = await seeded()
  const snapshot = JSON.parse(JSON.stringify({ book: store.state.books[0], highlights: store.state.highlights, notes: store.state.notes }))
  let local = await trashBook(store, store.id, { books: [legacy], logs: [...logs], trash: [] })
  store.failNext('createReadingNote')
  local = (await attempt(() => restore(store, local, local.trash[0].id))).local
  // Someone edits the half-restored book meanwhile: rating, a quote's text.
  store.state.books[0].rating = 1
  store.state.highlights.find(row => row.id === 'h-old')!.content = '바뀐 문장'
  const done = await attempt(() => restore(store, local, local.trash[0].id))
  assert.ok(done.ok)
  assertRestored(store, snapshot, done.local)
})

test('the same book added again since the delete is a conflict: nothing overwritten, the row stays', async () => {
  const store = await seeded()
  let local = await trashBook(store, store.id, { books: [legacy], logs: [...logs], trash: [] })
  const again = (await store.repo.addBook(store.state.books[0]?.book ?? { external_source: 'blanky-legacy', external_id: 'u:legacy-1', title: '데미안', author: '헤세', cover_url: null, page_count: 300, isbn10: null, isbn13: null, publisher: null, published_date: null, description: null }, 'want'))!
  await store.repo.updateBook(again, { rating: 2, review: '새로 읽는 중' })
  const result = await attempt(() => restore(store, local, local.trash[0].id))
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.error instanceof ReadingRestoreError && result.error.reason === 'conflict')
  local = result.local
  assert.equal(local.trash.length, 1, 'snapshot kept')
  assert.equal(store.state.books.length, 1)
  assert.equal(store.state.books[0].rating, 2, 'the book added again is untouched')
  assert.equal(store.state.books[0].review, '새로 읽는 중')
  assert.equal(store.state.highlights.length, 0, 'no quotes written into it')
  assert.equal(local.books.length, 0, 'no 서재 book either')
})

test('restoring again after a success writes nothing new; a stale copy without progress is a conflict', async () => {
  const store = await seeded()
  const snapshot = JSON.parse(JSON.stringify({ book: store.state.books[0], highlights: store.state.highlights, notes: store.state.notes }))
  const deleted = await trashBook(store, store.id, { books: [legacy], logs: [...logs], trash: [] })
  store.failNext('updateBook')
  const partial = (await attempt(() => restore(store, deleted, deleted.trash[0].id))).local
  const done = await attempt(() => restore(store, partial, partial.trash[0].id))
  assert.ok(done.ok)
  // The same row (with progress) run again, as a double click would, finds its own book and changes nothing.
  const again = await attempt(() => restore(store, partial, partial.trash[0].id))
  assert.ok(again.ok)
  assertRestored(store, snapshot, done.local)
  assert.equal(store.state.highlights.length, 2)
  // A tab that still has the row from before the first try (no progress) must not take the book over.
  const stale = await attempt(() => restore(store, deleted, deleted.trash[0].id))
  assert.ok(!stale.ok && stale.error instanceof ReadingRestoreError && stale.error.reason === 'conflict')
  assert.equal(store.state.books.length, 1)
})

test('a book still in the library under its own id (the delete never landed) is left as it is', async () => {
  const store = await seeded()
  const copy: ReadingCopy = { ...(await snapshotBook(store.repo, store.id)) }
  store.state.books[0].review = '삭제 뒤에 고친 감상'
  const result = await writeCopy(store.repo, copy, () => { throw new Error('nothing to record') })
  assert.deepEqual(result, { bookId: store.id, intact: true })
  assert.equal(store.state.books[0].review, '삭제 뒤에 고친 감상')
})

test('a failed delete takes the snapshot back out and leaves the book where it was', async () => {
  const store = await seeded()
  store.failNext('removeBook')
  const local: Local = { books: [legacy], logs: [...logs], trash: [] }
  await assert.rejects(trashBook(store, store.id, local), /injected removeBook/)
  assert.equal(store.state.books.length, 1, 'book still in the library')
  assert.equal(store.state.highlights.length, 2)
  // trashBook returns nothing on failure; run the parts again to see the state it leaves.
  let next = local
  const row = withoutBook(local, 'legacy-1', { ...(await snapshotBook(store.repo, store.id)) }).trash[0]
  store.failNext('removeBook')
  await assert.rejects(keepThenRemove(() => { next = { ...next, trash: [row, ...next.trash] } }, () => store.repo.removeBook(store.id), () => { next = { ...next, trash: next.trash.filter(item => item !== row) } }))
  assert.equal(next.trash.length, 0, 'no row for a book that was not deleted')
  assert.deepEqual(next.books.map(item => item.id), ['legacy-1'])
  // A delete that succeeds keeps the row, saved before the book went.
  const done = await trashBook(store, store.id, local)
  assert.equal(done.trash.length, 1)
  assert.equal(store.state.books.length, 0)
  assert.equal(asBookTrash(done.trash[0].payload)?.copy?.highlights.length, 2)
})

test('restore progress survives the trash row being saved and read back', () => {
  const row = withoutBook({ books: [legacy], logs, trash: [] as TrashItem[] }, 'legacy-1', { book: { id: 'ub-1', book: { title: '데미안' } } as unknown as LibraryBook, shelves: [], highlights: [], notes: [], pageId: 'page-1' }).trash[0]
  const saved = parseTrash(JSON.parse(JSON.stringify(withRestoreProgress(row, { bookId: 'ub-9' }))))!
  const bundle = asBookTrash(saved.payload)!
  assert.equal(bundle.copy?.restore?.bookId, 'ub-9')
  assert.equal(bundle.copy?.pageId, 'page-1')
  assert.equal(bundle.logs.length, 2)
  // A row without a copy (an older 서재-only row) is left alone.
  const plain = withoutBook({ books: [legacy], logs, trash: [] as TrashItem[] }, 'legacy-1').trash[0]
  assert.equal(withRestoreProgress(plain, { bookId: 'x' }), plain)
})

test('the last local step adds only what is missing', () => {
  const bundle = { book: legacy, logs }
  const fresh = withBookRestored({ books: [], logs: [], trash: [{ id: 'legacy-1' } as TrashItem, { id: 'other' } as TrashItem] }, 'legacy-1', bundle)
  assert.deepEqual(fresh.books.map(item => item.id), ['legacy-1'])
  assert.deepEqual(fresh.trash.map(item => item.id), ['other'])
  const kept = { ...legacy, currentPage: 200 }
  const again = withBookRestored({ books: [kept], logs: [logs[0]], trash: [] }, 'legacy-1', bundle)
  assert.equal(again.books.length, 1)
  assert.equal(again.books[0].currentPage, 200, 'a 서재 book with that id is kept as it is')
  assert.deepEqual(again.logs.map(item => item.id).sort(), ['log-1', 'log-2'])
})
