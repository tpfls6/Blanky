import type { Book, CustomRecord, DiaryEntry, FieldValue, Memo, ReadingLog } from '../types/records.ts'
import type { WorkItem } from '../types/work.ts'

export const TRASH_KINDS = ['memo', 'record', 'diary', 'item', 'book'] as const
export type TrashKind = (typeof TRASH_KINDS)[number]

export type TrashItem = {
  id: string
  kind: TrashKind
  title: string
  deletedAt: string
  payload: unknown
}

export type BookTrash = { book: Book; logs: ReadingLog[] }

export const TRASH_KIND_LABEL: Record<TrashKind, string> = {
  memo: '메모',
  record: '기록',
  diary: '일기',
  item: '일정',
  book: '책',
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

export function asBookTrash(value: unknown): BookTrash | null {
  const row = asRecord(value)
  const book = asRecord(row?.book ?? value)
  if (!book || typeof book.id !== 'string' || typeof book.title !== 'string') return null
  const logs = Array.isArray(row?.logs) ? row.logs : []
  return {
    book: book as unknown as Book,
    logs: logs.filter((log): log is ReadingLog => {
      const item = asRecord(log)
      return Boolean(item && typeof item.id === 'string' && item.bookId === book.id)
    }),
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
