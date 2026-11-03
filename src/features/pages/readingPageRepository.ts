import type { LibraryBook } from '@blanky/types'
import { createReadingStoreRepository, type ReadingStore } from '../../services/reading/local.ts'
import type { CustomRecord, FieldValue } from '../../types/records.ts'
import { packReading, unpackReading } from './pageRecords.ts'

export const READING_STATE_KIND = 'blanky.page.reading-state'
type RecordInput = { title: string; values: Record<string, FieldValue> }

// Keep legacy page records readable. Rich reading data uses the existing values
// payload, so page templates and the custom_records schema do not change.
export function pageReadingBook(record: CustomRecord, userId: string): LibraryBook {
  if (typeof record.values.readingBook === 'string') return JSON.parse(record.values.readingBook) as LibraryBook
  const old = unpackReading(record)
  return {
    id: old.id, user_id: userId, book_id: old.id, reading_status: 'want', rating: old.rating,
    current_page: 0, total_pages: null, progress: 0, started_at: null, finished_at: null,
    review: old.note, tags: [], created_at: old.createdAt, updated_at: old.updatedAt,
    book: { id: old.id, external_source: 'blanky-page', external_id: old.id,
      title: old.title, author: old.author, cover_url: old.image || null,
      isbn10: null, isbn13: null, publisher: null, published_date: null,
      description: null, page_count: null, created_at: old.createdAt },
  }
}

export function createPageReadingRepository(userId: string, pageId: string, storage: {
  records: () => readonly CustomRecord[]
  put: (id: string | null, input: RecordInput) => Promise<void>
  remove: (id: string) => Promise<void>
}) {
  const scoped = () => storage.records().filter(row => row.typeId === pageId)
  return createReadingStoreRepository(userId, {
    read: () => {
      const rows = scoped()
      const state = rows.find(row => row.values.kind === READING_STATE_KIND)
      const related = state && typeof state.values.readingState === 'string'
        ? JSON.parse(state.values.readingState) as Omit<ReadingStore, 'books'>
        : { shelves: [], memberships: [], highlights: [], notes: [] }
      return { ...related, books: rows.filter(row => row.values.kind !== READING_STATE_KIND).map(row => pageReadingBook(row, userId)) }
    },
    save: async next => {
      const previous = scoped()
      const state = previous.find(row => row.values.kind === READING_STATE_KIND)
      for (const book of next.books) {
        const old = previous.find(row => row.id === book.id)
        const packed = packReading({ id: book.id, title: book.book.title, author: book.book.author,
          image: book.book.cover_url ?? '', rating: book.rating, note: book.review,
          createdAt: book.created_at, updatedAt: book.updated_at })
        const input = { title: packed.title, values: { ...old?.values, ...packed.values, readingBook: JSON.stringify(book) } }
        if (JSON.stringify(old?.values) !== JSON.stringify(input.values)) await storage.put(old?.id ?? book.id, input)
      }
      const related = JSON.stringify({ shelves: next.shelves, memberships: next.memberships, highlights: next.highlights, notes: next.notes })
      if (related !== state?.values.readingState) {
        await storage.put(state?.id ?? null, { title: 'Reading workspace', values: { kind: READING_STATE_KIND, readingState: related } })
      }
      for (const old of previous) {
        if (old.values.kind !== READING_STATE_KIND && !next.books.some(book => book.id === old.id)) await storage.remove(old.id)
      }
    },
  })
}
