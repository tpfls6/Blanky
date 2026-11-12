import type { Book, CustomRecord, DiaryEntry, FieldValue, Memo, ReadingLog } from '../types/records.ts'
import type { WorkItem } from '../types/work.ts'
import type { Highlight, LibraryBook, ReadingNote } from '@blanky/types'
import type { UserPage } from '../features/builder/schema.ts'
import type { CustomRecordType } from '../features/records/schema.ts'

export const TRASH_KINDS = ['memo', 'record', 'diary', 'item', 'book', 'page'] as const
export type TrashKind = (typeof TRASH_KINDS)[number]

export type TrashItem = {
  id: string
  kind: TrashKind
  title: string
  deletedAt: string
  payload: unknown
}

/** A reading-library book as it stood when it was deleted, with what hung off it, so restoring can write it
 *  back. `legacyBookId` names the 서재 book it was imported from; `synced` keeps whether the copy was still
 *  untouched since the app last wrote it (see reopensCopy). */
export type ReadingCopy = {
  book: LibraryBook
  shelves: string[]
  highlights: Highlight[]
  notes: ReadingNote[]
  legacyBookId?: string
  synced?: boolean
  /** The custom reading page the book was on; none for the reading page's own library. */
  pageId?: string
  /** What a 복구 that has not finished yet already wrote: the reading-library book it created, so a retry
   *  (even after a reload) finishes that one instead of treating it as somebody else's. */
  restore?: RestoreProgress
}

export type RestoreProgress = { bookId: string }

/** A deleted custom page with its own record type and the records written on it, so 복구 brings all back. */
export type PageTrash = { id: string; page: UserPage; recordType: CustomRecordType | null; records: CustomRecord[] }

/** A deleted book: the 서재 book with its logs, its reading-library copy, or both. */
export type BookTrash = { book: Book | null; logs: ReadingLog[]; copy: ReadingCopy | null }

export const TRASH_KIND_LABEL: Record<TrashKind, string> = {
  memo: '메모',
  record: '기록',
  diary: '일기',
  item: '일정',
  book: '책',
  page: '페이지',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function tags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []
}

export function toTrash(kind: TrashKind, payload: unknown, title: string): TrashItem {
  const id = asRecord(payload)?.id
  return {
    id: typeof id === 'string' ? id : '',
    kind,
    title: title.trim() || TRASH_KIND_LABEL[kind],
    deletedAt: new Date().toISOString(),
    payload,
  }
}

export function parseTrash(value: unknown): TrashItem | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.deletedAt !== 'string') return null
  if (!TRASH_KINDS.includes(row.kind as TrashKind)) return null
  return {
    id: row.id,
    kind: row.kind as TrashKind,
    title: text(row.title).trim() || TRASH_KIND_LABEL[row.kind as TrashKind],
    deletedAt: row.deletedAt,
    payload: row.payload,
  }
}

export function trashKindLabel(item: TrashItem): string {
  if (item.kind !== 'item') return TRASH_KIND_LABEL[item.kind]
  return asRecord(item.payload)?.kind === 'task' ? '할 일' : '일정'
}

/** The `trash.kind.*` key naming a row's kind on the trash page, in the app's language. */
export function trashKindKey(item: TrashItem): string {
  if (item.kind !== 'item') return 'trash.kind.' + item.kind
  return asRecord(item.payload)?.kind === 'task' ? 'trash.kind.task' : 'trash.kind.item'
}

export function withTrash(current: { trash: TrashItem[] }, row: TrashItem) {
  return [row, ...current.trash.filter((item) => item.id !== row.id)]
}

export function asMemo(value: unknown): Memo | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.body !== 'string') return null
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    categoryId: typeof row.categoryId === 'string' ? row.categoryId : null,
    tags: tags(row.tags),
    createdAt: text(row.createdAt, new Date().toISOString()),
    updatedAt: text(row.updatedAt, new Date().toISOString()),
  }
}

export function asDiary(value: unknown): DiaryEntry | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.date !== 'string' || typeof row.body !== 'string') return null
  return {
    id: row.id,
    title: typeof row.title === 'string' ? row.title : undefined,
    mood: typeof row.mood === 'string' ? row.mood : undefined,
    weather: typeof row.weather === 'string' ? row.weather : undefined,
    isFavorite: row.isFavorite === true,
    date: row.date,
    body: row.body,
    tags: tags(row.tags),
    createdAt: text(row.createdAt, new Date().toISOString()),
    updatedAt: text(row.updatedAt, new Date().toISOString()),
  }
}

export function asCustomRecord(value: unknown): CustomRecord | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.typeId !== 'string') return null
  const values = asRecord(row.values) ?? {}
  return {
    id: row.id,
    typeId: row.typeId,
    title: text(row.title),
    values: values as Record<string, FieldValue>,
    templateVersion: typeof row.templateVersion === 'number' && row.templateVersion > 0 ? row.templateVersion : 1,
    createdAt: text(row.createdAt, new Date().toISOString()),
    updatedAt: text(row.updatedAt, new Date().toISOString()),
  }
}

export function asWork(value: unknown): WorkItem | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.date !== 'string') return null
  if (row.kind !== 'event' && row.kind !== 'task') return null
  return row as unknown as WorkItem
}

function asReadingCopy(value: unknown): ReadingCopy | null {
  const row = asRecord(value)
  const book = asRecord(row?.book)
  const metadata = asRecord(book?.book)
  if (!row || !book || !metadata || typeof book.id !== 'string' || typeof metadata.title !== 'string') return null
  const list = (items: unknown) => (Array.isArray(items) ? items : []).filter(item => typeof asRecord(item)?.id === 'string' && typeof asRecord(item)?.content === 'string')
  return {
    book: book as unknown as LibraryBook,
    shelves: Array.isArray(row.shelves) ? row.shelves.filter((id): id is string => typeof id === 'string') : [],
    highlights: list(row.highlights) as Highlight[],
    notes: list(row.notes) as ReadingNote[],
    legacyBookId: typeof row.legacyBookId === 'string' ? row.legacyBookId : undefined,
    synced: row.synced === true,
    pageId: typeof row.pageId === 'string' ? row.pageId : undefined,
    restore: typeof asRecord(row.restore)?.bookId === 'string' ? { bookId: asRecord(row.restore)!.bookId as string } : undefined,
  }
}

export function asBookTrash(value: unknown): BookTrash | null {
  const row = asRecord(value)
  const copy = asReadingCopy(row?.copy)
  // Older rows kept the book itself as the payload; a reading-page delete of a book not from 서재 has none.
  const raw = row && 'copy' in row ? asRecord(row.book) : asRecord(row?.book ?? value)
  const book = raw && typeof raw.id === 'string' && typeof raw.title === 'string' ? raw as unknown as Book : null
  if (!book && !copy) return null
  const logs = book && Array.isArray(row?.logs) ? row.logs : []
  return {
    book,
    logs: logs.filter((log): log is ReadingLog => {
      const item = asRecord(log)
      return Boolean(item && typeof item.id === 'string' && item.bookId === book?.id)
    }),
    copy,
  }
}

export function selfCheckTrash() {
  const memo = asMemo({ id: 'm1', title: '제목', body: '본문', categoryId: null, tags: ['a'], createdAt: 't', updatedAt: 't' })
  if (!memo || memo.title !== '제목') throw new Error('trash memo parse')
  const row = toTrash('memo', memo, memo.title)
  const parsed = parseTrash(row)
  if (!parsed || parsed.id !== 'm1' || trashKindLabel(parsed) !== '메모') throw new Error('trash roundtrip')
  if (asMemo({ title: 'no-id' }) || parseTrash({ kind: 'memo' })) throw new Error('trash rejects junk')
}

selfCheckTrash()

export function asPageTrash(value: unknown): PageTrash | null {
  const row = asRecord(value)
  const page = asRecord(row?.page)
  if (!row || !page || typeof page.id !== 'string' || typeof page.name !== 'string' || !Array.isArray(page.blocks)) return null
  const type = asRecord(row.recordType)
  const recordType = type && type.id === page.id && typeof type.name === 'string' && Array.isArray(type.blocks) ? type as unknown as CustomRecordType : null
  const records = (Array.isArray(row.records) ? row.records : []).flatMap((item) => {
    const record = asCustomRecord(item)
    return record && record.typeId === page.id ? [record] : []
  })
  return { id: page.id, page: page as unknown as UserPage, recordType, records }
}
