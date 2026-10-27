import { createContext, useContext } from 'react'
import type { Book, CustomRecordType, DiaryEntry, EntryType, FieldValue, LibraryData, Memo, Settings } from '../types/records.ts'
import type { PageBlock, PageId } from '../features/pages/layout.ts'
import type { WorkInput, WorkPatch, WorkspaceCategory } from '../types/work.ts'

export type LibraryValue = LibraryData & {
  commitDiary: (entry: DiaryEntry) => Promise<DiaryEntry>
  eraseDiary: (id: string) => Promise<void>
  diaryError: string
  diaryLoading: boolean
  commitWork: (before: import('../types/work.ts').WorkItem | null, after: import('../types/work.ts').WorkItem | null, source?: 'manual' | 'ai_chat') => Promise<import('../types/work.ts').WorkItem | null>
  workError: string
  adoptPlannerSchedules: (rows: import('@blanky/types').Schedule[]) => void
  refreshWork: () => Promise<void>
  saveCapture: (content: string, type: EntryType) => string | null
  addItem: (input: WorkInput) => void
  updateItem: (id: string, patch: WorkPatch) => void
  toggleItem: (id: string) => void
  removeItem: (id: string) => void
  addDiary: (entry: Pick<DiaryEntry, 'date' | 'body' | 'tags'>) => void
  updateDiary: (id: string, patch: Pick<DiaryEntry, 'date' | 'body' | 'tags'>) => void
  removeDiary: (id: string) => void
  addMemo: (memo: Pick<Memo, 'title' | 'body' | 'categoryId' | 'tags'>) => string
  updateMemo: (id: string, patch: Pick<Memo, 'title' | 'body' | 'categoryId' | 'tags'>) => void
  removeMemo: (id: string) => void
  addBook: (book: Omit<Book, 'id' | 'createdAt'>) => string
  updateBook: (id: string, patch: Partial<Omit<Book, 'id' | 'createdAt'>>) => void
  removeBook: (id: string) => void
  addLog: (bookId: string, log: { date: string; page: number | null; note: string }) => void
  addCategory: (name: string, parentId: string | null) => void
  updateCategory: (id: string, patch: Partial<Pick<WorkspaceCategory, 'name' | 'color' | 'icon' | 'kind'>>) => void
  reorderCategories: (parentId: string | null, orderedIds: string[]) => void
  removeCategory: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  resetPreferences: () => void
  addRecordType: (input: Pick<CustomRecordType, 'name' | 'icon' | 'color' | 'description' | 'blocks'>) => string | null
  updateRecordType: (id: string, patch: Partial<Pick<CustomRecordType, 'name' | 'icon' | 'color' | 'description' | 'blocks'>>) => void
  duplicateRecordType: (id: string) => string | null
  removeRecordType: (id: string) => void
  addRecord: (typeId: string, input: { title: string; values: Record<string, FieldValue> }) => string
  updateRecord: (id: string, patch: { title: string; values: Record<string, FieldValue> }) => void
  removeRecord: (id: string) => void
  setPageLayout: (pageId: PageId, blocks: PageBlock[]) => void
  resetPageLayout: (pageId: PageId) => void
}

export const LibraryContext = createContext<LibraryValue | null>(null)

export function useLibrary(): LibraryValue {
  const value = useContext(LibraryContext)
  if (!value) throw new Error('Library missing')
  return value
}
