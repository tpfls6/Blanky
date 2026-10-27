import type { CustomRecord, DiaryEntry, FieldValue, Memo } from '../../types/records.ts'
import { pageTypeMarker, type PageTemplateKind } from './templates.ts'

function diaryTitle(entry: Pick<DiaryEntry, 'title' | 'body'>): string {
  return entry.title?.trim() || entry.body.trim().split(/[\n.!?。]/)[0].slice(0, 48) || '제목 없는 기록'
}

export type PageReadingItem = {
  id: string
  title: string
  author: string
  rating: number | null
  note: string
  image: string
  createdAt: string
  updatedAt: string
}

function asString(value: FieldValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: FieldValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function recordsForPage(records: readonly CustomRecord[], pageId: string): CustomRecord[] {
  return records.filter((item) => item.typeId === pageId)
}

export function packDiary(entry: DiaryEntry): { title: string; values: Record<string, FieldValue> } {
  return {
    title: diaryTitle(entry),
    values: {
      kind: pageTypeMarker('diary'),
      manualTitle: entry.title ?? '',
      body: entry.body,
      date: entry.date,
      mood: entry.mood ?? '',
      weather: entry.weather ?? '',
      tags: entry.tags,
      isFavorite: entry.isFavorite ?? false,
      createdAt: entry.createdAt,
    },
  }
}

export function unpackDiary(record: CustomRecord): DiaryEntry {
  const values = record.values
  const tags = Array.isArray(values.tags) ? values.tags.filter((tag): tag is string => typeof tag === 'string') : []
  return {
    id: record.id,
    title: asString(values.manualTitle) || record.title,
    body: asString(values.body),
    date: asString(values.date) || record.createdAt.slice(0, 10),
    mood: asString(values.mood) || undefined,
    weather: asString(values.weather) || undefined,
    tags,
    isFavorite: values.isFavorite === true,
    createdAt: asString(values.createdAt) || record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function packMemo(entry: Pick<Memo, 'id' | 'title' | 'body' | 'createdAt' | 'updatedAt'>): { title: string; values: Record<string, FieldValue> } {
  return {
    title: entry.title.trim() || '제목 없는 메모',
    values: {
      kind: pageTypeMarker('memo'),
      title: entry.title,
      body: entry.body,
      createdAt: entry.createdAt,
    },
  }
}

export function unpackMemo(record: CustomRecord): Memo {
  return {
    id: record.id,
    title: asString(record.values.title) || record.title,
    body: asString(record.values.body),
    categoryId: null,
    tags: [],
    createdAt: asString(record.values.createdAt) || record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function packReading(item: PageReadingItem): { title: string; values: Record<string, FieldValue> } {
  return {
    title: item.title.trim() || '제목 없음',
    values: {
      kind: pageTypeMarker('reading'),
      title: item.title,
      author: item.author,
      rating: item.rating ?? '',
      note: item.note,
      image: item.image,
      createdAt: item.createdAt,
    },
  }
}

export function unpackReading(record: CustomRecord): PageReadingItem {
  return {
    id: record.id,
    title: asString(record.values.title) || record.title,
    author: asString(record.values.author),
    rating: asNumber(record.values.rating),
    note: asString(record.values.note),
    image: asString(record.values.image),
    createdAt: asString(record.values.createdAt) || record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function packRecord(template: PageTemplateKind, entry: DiaryEntry | Memo | PageReadingItem): { title: string; values: Record<string, FieldValue> } {
  if (template === 'diary') return packDiary(entry as DiaryEntry)
  if (template === 'reading') return packReading(entry as PageReadingItem)
  return packMemo(entry as Memo)
}
