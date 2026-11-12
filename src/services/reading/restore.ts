import type { ReadingRepository } from '@blanky/api'
import type { BookPatch, LibraryBook } from '@blanky/types'
import { sameBook } from '../../../packages/types/src/reading.ts'
import type { ReadingCopy, RestoreProgress } from '../../utils/trash.ts'
import { readingError } from './messages.ts'

/** The store calls a 복구 needs; the reading library's own repository and a custom page's both have them. */
export type CopyStore = Pick<ReadingRepository, 'getMyBooks' | 'getHighlights' | 'getReadingNotes' | 'addBook' | 'updateBook'
  | 'removeBook' | 'addBookToShelf' | 'createHighlight' | 'updateHighlight' | 'createReadingNote' | 'updateReadingNote'>

/** Why a 복구 stopped. `conflict`: the library already holds the same book that this 복구 did not write
 *  (added again since the delete), so nothing is overwritten and the trash keeps the snapshot. */
export class ReadingRestoreError extends Error {
  readonly reason: 'conflict' | 'failed'
  constructor(reason: 'conflict' | 'failed', message: string) {
    super(message)
    this.name = 'ReadingRestoreError'
    this.reason = reason
  }
}

/** Reads one book with its shelves, quotes and notes as they stand, for the trash. Nothing is removed yet:
 *  the snapshot is kept first and the book deleted after it (see keepThenRemove). */
export async function snapshotBook(repo: CopyStore, id: string): Promise<Pick<ReadingCopy, 'book' | 'shelves' | 'highlights' | 'notes'>> {
  const [library, highlights, notes] = await Promise.all([repo.getMyBooks(), repo.getHighlights(id), repo.getReadingNotes(id)])
  const book = library.books.find(row => row.id === id)
  if (!book) throw new Error(readingError('bookMissing'))
  return { book, shelves: library.memberships.filter(row => row.user_book_id === id).map(row => row.shelf_id), highlights, notes }
}

/** The order of a delete into the trash: the snapshot is kept (and saved) first, then the book is deleted;
 *  a delete that fails takes the snapshot back out, so the book is never gone without it and never both
 *  there and in the trash once this returns. */
export async function keepThenRemove(keep: () => void, remove: () => Promise<void>, undo: () => void): Promise<void> {
  keep()
  try {
    await remove()
  } catch (error) {
    undo()
    throw error
  }
}

const recordOf = (book: LibraryBook): Required<BookPatch> => ({
  reading_status: book.reading_status, rating: book.rating, current_page: book.current_page, total_pages: book.total_pages,
  progress: book.progress, started_at: book.started_at, finished_at: book.finished_at, review: book.review, tags: book.tags,
})

/** Writes a snapshot back, one step at a time, each one safe to run again:
 *  - the book: found by `copy.restore` when an earlier try created it, otherwise added and its id handed to
 *    `record` before anything else is written, so a retry (even after a reload) knows it as its own;
 *  - its record (status, rating, review, tags, pages, dates), set to the snapshot's every time;
 *  - the shelves that still exist, then quotes and notes under their old ids: missing ones are created,
 *    ones an earlier try wrote are set back to the snapshot.
 *  The same book already in the library that this 복구 did not create (added again since the delete) is a
 *  conflict: nothing is written to it. The book still there under its own id means the delete never
 *  landed (`intact`), so nothing needs writing either. */
export async function writeCopy(repo: CopyStore, copy: ReadingCopy, record: (progress: RestoreProgress) => void | Promise<void>): Promise<{ bookId: string; intact: boolean; updatedAt?: string }> {
  const library = await repo.getMyBooks()
  const { book } = copy, metadata = book.book
  const ours = copy.restore?.bookId
  const existing = library.books.find(row => row.id === ours) ?? library.books.find(row => sameBook(row.book, metadata))
  if (existing && existing.id !== ours) {
    if (existing.id === book.id) return { bookId: existing.id, intact: true }
    throw new ReadingRestoreError('conflict', readingError('restoreConflict'))
  }
  let id: string | null | undefined = existing?.id
  if (!id) {
    id = await repo.addBook({ external_source: metadata.external_source, external_id: metadata.external_id, isbn10: metadata.isbn10, isbn13: metadata.isbn13, title: metadata.title, author: metadata.author, publisher: metadata.publisher, published_date: metadata.published_date, description: metadata.description, cover_url: metadata.cover_url, page_count: metadata.page_count, ...(metadata.categories ? { categories: metadata.categories } : {}) }, book.reading_status, [])
    if (!id) throw new ReadingRestoreError('failed', readingError('restoreFailed'))
    await record({ bookId: id })
  }
  const saved = await repo.updateBook(id, recordOf(book))
  const shelves = copy.shelves.filter(shelf => library.shelves.some(row => row.id === shelf))
  for (const shelf of shelves)
    if (!library.memberships.some(row => row.user_book_id === id && row.shelf_id === shelf)) await repo.addBookToShelf(id, shelf)
  const [highlights, notes] = await Promise.all([repo.getHighlights(id), repo.getReadingNotes(id)])
  // Oldest first, so the newest entry is still listed first.
  for (const item of [...copy.highlights].reverse()) {
    const input = { content: item.content, page_number: item.page_number, note: item.note, tags: item.tags, source_type: item.source_type, source_url: item.source_url, source_title: item.source_title }
    const written = highlights.find(row => row.id === item.id)
    if (!written) await repo.createHighlight(id, input, item.id)
    else if (!sameHighlight(written, item)) await repo.updateHighlight(item.id, input)
  }
  for (const item of [...copy.notes].reverse()) {
    const written = notes.find(row => row.id === item.id)
    if (!written) await repo.createReadingNote(id, { content: item.content, tags: item.tags }, item.id)
    else if (!sameNote(written, item)) await repo.updateReadingNote(item.id, { content: item.content, tags: item.tags })
  }
  return { bookId: id, intact: false, updatedAt: saved?.updated_at }
}

const sameList = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
const sameNumber = (a: number | null | undefined, b: number | null | undefined) => (a ?? null) === null ? (b ?? null) === null : Number(a) === Number(b)
const sameText = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null)
type HighlightLike = { content: string; page_number: number | null; note: string; tags: string[]; source_type: string; source_url: string | null; source_title: string | null }
function sameHighlight(a: HighlightLike, b: HighlightLike): boolean {
  return a.content === b.content && sameNumber(a.page_number, b.page_number) && sameText(a.note, b.note) && sameList(a.tags, b.tags)
    && a.source_type === b.source_type && sameText(a.source_url, b.source_url) && sameText(a.source_title, b.source_title)
}
function sameNote(a: { content: string; tags: string[] }, b: { content: string; tags: string[] }): boolean {
  return a.content === b.content && sameList(a.tags, b.tags)
}

/** Reads the restored book back and checks it against the snapshot: its record, the shelves that still
 *  exist, and every quote and note. Only a 복구 that passes may take the row out of the trash. */
export async function verifyCopy(repo: CopyStore, copy: ReadingCopy, bookId: string): Promise<void> {
  const [library, highlights, notes] = await Promise.all([repo.getMyBooks(), repo.getHighlights(bookId), repo.getReadingNotes(bookId)])
  const row = library.books.find(item => item.id === bookId)
  const want = recordOf(copy.book)
  const fail = () => { throw new ReadingRestoreError('failed', readingError('restoreUnverified')) }
  if (!row) return fail()
  const got = recordOf(row)
  if (got.reading_status !== want.reading_status || !sameNumber(got.rating, want.rating) || !sameNumber(got.current_page, want.current_page)
    || !sameNumber(got.total_pages, want.total_pages) || !sameNumber(got.progress, want.progress) || !sameText(got.started_at, want.started_at)
    || !sameText(got.finished_at, want.finished_at) || got.review !== want.review || !sameList(got.tags, want.tags)) return fail()
  for (const shelf of copy.shelves)
    if (library.shelves.some(item => item.id === shelf) && !library.memberships.some(item => item.user_book_id === bookId && item.shelf_id === shelf)) return fail()
  for (const item of copy.highlights) {
    const written = highlights.find(row => row.id === item.id)
    if (!written || !sameHighlight(written, item)) return fail()
  }
  for (const item of copy.notes) {
    const written = notes.find(row => row.id === item.id)
    if (!written || !sameNote(written, item)) return fail()
  }
}
