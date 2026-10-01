import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { freshLibrary } from '../data/freshLibrary.ts'
import { cloneBlock, coerceRecordType, selfCheckRecords, structureKey, type CustomRecordType } from '../features/records/schema.ts'
import { normalizeLayouts, type PageBlock, type PageId } from '../features/pages/layout.ts'
import {
  type Book,
  type BookStatus,
  type CustomRecord,
  type DiaryEntry,
  type EntryType,
  type FieldValue,
  type LibraryData,
  type Memo,
  type Settings,
} from '../types/records.ts'
import type { WorkInput, WorkPatch, WorkspaceCategory } from '../types/work.ts'
import { LibraryContext, type LibraryValue } from './useLibrary.ts'
import { selfCheckAccount } from '../utils/account.ts'
import { applyCapture, selfCheckEntries } from '../utils/entries.ts'
import { categoryKind, createWorkItem, selfCheckWork } from '../utils/work.ts'
import { applyAccent, clearAccent } from '../theme/accent.ts'
import { defaultPreferences, loadPreferences, normalizePreferences, pullPreferences, pushPreferences, savePreferences, syncNav } from '../services/preferences/index.ts'
import { libraryKey } from './storage.ts'
import {
  mirrorCategoryCreate,
  mirrorCategoryDelete,
  mirrorCategoryReorder,
  mirrorCategoryUpdate,
  mirrorRecordDelete,
  mirrorRecordSave,
  mirrorRecordTypeDelete,
  mirrorRecordTypeSave,
} from '../services/mirror.ts'
import { useSession } from './useSession.ts'

selfCheckWork()
selfCheckEntries()
selfCheckAccount()
selfCheckRecords()

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function normalizeCategory(value: unknown): WorkspaceCategory | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') return null
  const parentId = typeof row.parentId === 'string' ? row.parentId : null
  return {
    id: row.id,
    name: row.name,
    parentId,
    color: typeof row.color === 'string' ? row.color : null,
    icon: typeof row.icon === 'string' ? row.icon : null,
    kind: categoryKind({ parentId, kind: row.kind === 'area' || row.kind === 'project' || row.kind === 'topic' ? row.kind : undefined }),
  }
}

function normalizeRecord(value: unknown): CustomRecord | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.typeId !== 'string') return null
  const values = asRecord(row.values) ?? {}
  return {
    id: row.id,
    typeId: row.typeId,
    title: typeof row.title === 'string' ? row.title : '',
    values: values as Record<string, FieldValue>,
    templateVersion: typeof row.templateVersion === 'number' && row.templateVersion > 0 ? row.templateVersion : 1,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
  }
}

function loadLibrary(userId: string): LibraryData {
  try {
    const raw = localStorage.getItem(libraryKey(userId))
    if (!raw) return freshLibrary()
    const data = JSON.parse(raw) as Partial<LibraryData>
    if (!Array.isArray(data.items) || !data.settings || !Array.isArray(data.categories)) return freshLibrary()
    const recordTypes = Array.isArray(data.recordTypes) ? data.recordTypes.flatMap((item) => {
      const next = coerceRecordType(item)
      return next ? [next] : []
    }) : []
    const stored = loadPreferences(userId)
    const normalized = normalizePreferences(stored ?? data.settings)
    const settings = { ...normalized, nav: syncNav(normalized.nav, recordTypes.map((item) => item.id)) }
    return {
      categories: data.categories.flatMap((item) => {
        const next = normalizeCategory(item)
        return next ? [next] : []
      }),
      items: data.items,
      captures: Array.isArray(data.captures) ? data.captures : [],
      diaries: Array.isArray(data.diaries) ? data.diaries : [],
      memos: Array.isArray(data.memos) ? data.memos : [],
      books: Array.isArray(data.books) ? data.books : [],
      logs: Array.isArray(data.logs) ? data.logs : [],
      recordTypes,
      records: Array.isArray(data.records) ? data.records.flatMap((item) => {
        const next = normalizeRecord(item)
        return next ? [next] : []
      }) : [],
      settings,
      pageLayouts: normalizeLayouts(data.pageLayouts),
    }
  } catch {
    return freshLibrary()
  }
}

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyAppearance(settings: Settings) {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
  applyAccent(settings.accent, dark)
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const userId = user?.id ?? null
  const [loadedFor, setLoadedFor] = useState(userId)
  const [data, setData] = useState<LibraryData>(() => (userId ? loadLibrary(userId) : freshLibrary()))

  if (userId !== loadedFor) {
    setLoadedFor(userId)
    setData(userId ? loadLibrary(userId) : freshLibrary())
  }

  useLayoutEffect(() => {
    if (!userId) {
      document.documentElement.classList.remove('dark')
      clearAccent()
      return
    }
    applyAppearance(data.settings)
  }, [userId, data.settings])

  const remoteUser = useRef<string | null>(null)
  const settingsRef = useRef(data.settings)

  useEffect(() => {
    if (!userId) return
    let cancel = false
    remoteUser.current = null
    void pullPreferences().then((remote) => {
      if (cancel) return
      remoteUser.current = userId
      if (!remote) {
        void pushPreferences(settingsRef.current)
        return
      }
      setData((current) => ({
        ...current,
        settings: { ...remote, nav: syncNav(remote.nav, current.recordTypes.map((item) => item.id)) },
      }))
    })
    return () => {
      cancel = true
    }
  }, [userId])

  useEffect(() => {
    settingsRef.current = data.settings
    if (!userId || remoteUser.current !== userId) return
    void pushPreferences(data.settings)
  }, [userId, data.settings])

  useEffect(() => {
    if (!userId) return
    localStorage.setItem(libraryKey(userId), JSON.stringify(data))
    savePreferences(userId, data.settings)
    if (data.settings.theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyAppearance(data.settings)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [userId, data])

  const saveCapture = useCallback((content: string, type: EntryType) => {
    const trimmed = content.trim()
    if (!trimmed) return '내용을 입력해 주세요.'
    if (type === 'auto' && !data.settings.autoClassify) return '유형을 선택해 주세요.'
    setData((current) => applyCapture(current, trimmed, type))
    return null
  }, [data.settings.autoClassify])

  const addItem = useCallback((input: WorkInput) => {
    const item = createWorkItem(input)
    if (!item) return
    setData((current) => ({ ...current, items: [...current.items, item] }))
  }, [])

  const updateItem = useCallback((id: string, patch: WorkPatch) => {
    setData((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }, [])

  const toggleItem = useCallback((id: string) => {
    setData((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, status: item.status === 'done' ? 'todo' : 'done' } : item,
      ),
    }))
  }, [])

  const removeItem = useCallback((id: string) => {
    setData((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }))
  }, [])

  const addDiary = useCallback((entry: Pick<DiaryEntry, 'date' | 'body' | 'tags'>) => {
    const body = entry.body.trim()
    if (!body || !entry.date) return
    const createdAt = new Date().toISOString()
    setData((current) => ({
      ...current,
      diaries: [
        { id: crypto.randomUUID(), date: entry.date, body, tags: entry.tags, createdAt, updatedAt: createdAt },
        ...current.diaries,
      ],
    }))
  }, [])

  const updateDiary = useCallback((id: string, patch: Pick<DiaryEntry, 'date' | 'body' | 'tags'>) => {
    setData((current) => ({
      ...current,
      diaries: current.diaries.map((entry) =>
        entry.id === id ? { ...entry, ...patch, body: patch.body.trim(), updatedAt: new Date().toISOString() } : entry,
      ),
    }))
  }, [])

  const removeDiary = useCallback((id: string) => {
    setData((current) => ({ ...current, diaries: current.diaries.filter((entry) => entry.id !== id) }))
  }, [])

  const addMemo = useCallback((memo: Pick<Memo, 'title' | 'body' | 'categoryId' | 'tags'>) => {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    setData((current) => ({
      ...current,
      memos: [
        {
          id,
          title: memo.title.trim() || '제목 없음',
          body: memo.body,
          categoryId: memo.categoryId,
          tags: memo.tags,
          createdAt,
          updatedAt: createdAt,
        },
        ...current.memos,
      ],
    }))
    return id
  }, [])

  const updateMemo = useCallback((id: string, patch: Pick<Memo, 'title' | 'body' | 'categoryId' | 'tags'>) => {
    setData((current) => ({
      ...current,
      memos: current.memos.map((memo) =>
        memo.id === id
          ? { ...memo, ...patch, title: patch.title.trim() || '제목 없음', updatedAt: new Date().toISOString() }
          : memo,
      ),
    }))
  }, [])

  const removeMemo = useCallback((id: string) => {
    setData((current) => ({ ...current, memos: current.memos.filter((memo) => memo.id !== id) }))
  }, [])

  const addBook = useCallback((book: Omit<Book, 'id' | 'createdAt'>) => {
    const id = crypto.randomUUID()
    setData((current) => ({
      ...current,
      books: [{ ...book, id, title: book.title.trim() || '제목 없는 책', createdAt: new Date().toISOString() }, ...current.books],
    }))
    return id
  }, [])

  const updateBook = useCallback((id: string, patch: Partial<Omit<Book, 'id' | 'createdAt'>>) => {
    setData((current) => ({
      ...current,
      books: current.books.map((book) => (book.id === id ? { ...book, ...patch } : book)),
    }))
  }, [])

  const removeBook = useCallback((id: string) => {
    setData((current) => ({
      ...current,
      books: current.books.filter((book) => book.id !== id),
      logs: current.logs.filter((log) => log.bookId !== id),
    }))
  }, [])

  const addLog = useCallback((bookId: string, log: { date: string; page: number | null; note: string }) => {
    setData((current) => ({
      ...current,
      logs: [
        { id: crypto.randomUUID(), bookId, date: log.date, page: log.page, note: log.note.trim(), createdAt: new Date().toISOString() },
        ...current.logs,
      ],
      books: current.books.map((book) => {
        if (book.id !== bookId || log.page === null) return book
        const status: BookStatus = book.totalPages > 0 && log.page >= book.totalPages ? 'done' : book.status
        return {
          ...book,
          currentPage: Math.max(book.currentPage, log.page),
          status,
          finishedAt: status === 'done' ? book.finishedAt ?? log.date : book.finishedAt,
        }
      }),
    }))
  }, [])

  const addCategory = useCallback((name: string, parentId: string | null) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const category: WorkspaceCategory = {
      id: crypto.randomUUID(),
      name: trimmed,
      parentId,
      kind: parentId ? 'topic' : 'area',
      color: '#3A62B0',
      icon: parentId ? 'Tag' : 'Folder',
    }
    setData((current) => ({ ...current, categories: [...current.categories, category] }))
    mirrorCategoryCreate(category, 0)
  }, [])

  const updateCategory = useCallback((id: string, patch: Partial<Pick<WorkspaceCategory, 'name' | 'color' | 'icon' | 'kind'>>) => {
    setData((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== id) return category
        const name = patch.name === undefined ? category.name : patch.name.trim()
        if (!name) return category
        return { ...category, ...patch, name }
      }),
    }))
    mirrorCategoryUpdate(id, patch)
  }, [])

  const reorderCategories = useCallback((parentId: string | null, orderedIds: string[]) => {
    setData((current) => {
      const siblings = new Map(
        current.categories.filter((category) => category.parentId === parentId).map((category) => [category.id, category]),
      )
      const nextSiblings = orderedIds.flatMap((id) => {
        const category = siblings.get(id)
        return category ? [category] : []
      })
      if (nextSiblings.length !== siblings.size) return current
      let placed = false
      const categories: WorkspaceCategory[] = []
      for (const category of current.categories) {
        if (category.parentId !== parentId) {
          categories.push(category)
          continue
        }
        if (!placed) {
          categories.push(...nextSiblings)
          placed = true
        }
      }
      return { ...current, categories }
    })
    mirrorCategoryReorder(orderedIds)
  }, [])

  const removeCategory = useCallback((id: string) => {
    setData((current) => {
      const dropping = new Set(
        current.categories
          .filter((category) => category.id === id || category.parentId === id)
          .map((category) => category.id),
      )
      return {
        ...current,
        categories: current.categories.filter((category) => !dropping.has(category.id)),
        items: current.items.map((item) =>
          item.categoryId && dropping.has(item.categoryId) ? { ...item, categoryId: null } : item,
        ),
        memos: current.memos.map((memo) =>
          memo.categoryId && dropping.has(memo.categoryId) ? { ...memo, categoryId: null } : memo,
        ),
      }
    })
    mirrorCategoryDelete(id)
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  }, [])

  const resetPreferences = useCallback(() => {
    setData((current) => ({
      ...current,
      settings: defaultPreferences(current.recordTypes.map((item) => item.id)),
    }))
  }, [])

  const addRecordType = useCallback((input: Pick<CustomRecordType, 'name' | 'icon' | 'color' | 'description' | 'blocks'>) => {
    const name = input.name.trim()
    if (!name) return null
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const recordType: CustomRecordType = {
      id,
      name,
      icon: input.icon || 'StickyNote',
      color: input.color,
      description: input.description,
      schemaVersion: 1,
      version: 1,
      blocks: input.blocks,
      createdAt: now,
      updatedAt: now,
    }
    setData((current) => ({
      ...current,
      recordTypes: [...current.recordTypes, recordType],
      settings: { ...current.settings, nav: [...current.settings.nav, { id, visible: true }] },
    }))
    mirrorRecordTypeSave(recordType)
    return id
  }, [])

  const updateRecordType = useCallback((id: string, patch: Partial<Pick<CustomRecordType, 'name' | 'icon' | 'color' | 'description' | 'blocks'>>) => {
    const saved: { value: CustomRecordType | null } = { value: null }
    setData((current) => ({
      ...current,
      recordTypes: current.recordTypes.map((item) => {
        if (item.id !== id) return item
        const name = patch.name === undefined ? item.name : patch.name.trim()
        if (!name) return item
        const version = patch.blocks && structureKey(patch.blocks) !== structureKey(item.blocks) ? item.version + 1 : item.version
        const next = { ...item, ...patch, name, version, updatedAt: new Date().toISOString() }
        saved.value = next
        return next
      }),
    }))
    if (saved.value) mirrorRecordTypeSave(saved.value)
  }, [])

  const duplicateRecordType = useCallback((id: string) => {
    const source = data.recordTypes.find((item) => item.id === id)
    if (!source) return null
    const nextId = crypto.randomUUID()
    const now = new Date().toISOString()
    const copy: CustomRecordType = {
      ...source,
      id: nextId,
      name: `${source.name} 복사본`,
      blocks: source.blocks.map(cloneBlock),
      version: 1,
      createdAt: now,
      updatedAt: now,
    }
    setData((current) => {
      if (!current.recordTypes.some((item) => item.id === id)) return current
      return {
        ...current,
        recordTypes: [...current.recordTypes, copy],
        settings: { ...current.settings, nav: [...current.settings.nav, { id: nextId, visible: true }] },
      }
    })
    mirrorRecordTypeSave(copy)
    return nextId
  }, [data.recordTypes])

  const removeRecordType = useCallback((id: string) => {
    setData((current) => ({
      ...current,
      recordTypes: current.recordTypes.filter((item) => item.id !== id),
      records: current.records.filter((item) => item.typeId !== id),
      settings: { ...current.settings, nav: current.settings.nav.filter((item) => item.id !== id) },
    }))
    mirrorRecordTypeDelete(id)
  }, [])

  const addRecord = useCallback((typeId: string, input: { title: string; values: Record<string, FieldValue> }) => {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const templateVersion = data.recordTypes.find((item) => item.id === typeId)?.version ?? 1
    const title = input.title.trim() || '제목 없음'
    let stored = false
    setData((current) => {
      if (!current.recordTypes.some((item) => item.id === typeId)) return current
      stored = true
      return {
        ...current,
        records: [
          {
            id,
            typeId,
            title,
            values: input.values,
            templateVersion,
            createdAt,
            updatedAt: createdAt,
          },
          ...current.records,
        ],
      }
    })
    if (stored) mirrorRecordSave({ id, typeId, title, values: input.values, templateVersion }, true)
    return id
  }, [data.recordTypes])

  const updateRecord = useCallback((id: string, patch: { title: string; values: Record<string, FieldValue> }) => {
    const title = patch.title.trim() || '제목 없음'
    const saved: { typeId: string; templateVersion: number } | null = { typeId: '', templateVersion: 0 }
    let found = false
    setData((current) => ({
      ...current,
      records: current.records.map((item) => {
        if (item.id !== id) return item
        saved.typeId = item.typeId
        saved.templateVersion = item.templateVersion
        found = true
        return { ...item, title, values: patch.values, updatedAt: new Date().toISOString() }
      }),
    }))
    if (found) mirrorRecordSave({ id, typeId: saved.typeId, title, values: patch.values, templateVersion: saved.templateVersion }, false)
  }, [])

  const removeRecord = useCallback((id: string) => {
    setData((current) => ({ ...current, records: current.records.filter((item) => item.id !== id) }))
    mirrorRecordDelete(id)
  }, [])

  const setPageLayout = useCallback((pageId: PageId, blocks: PageBlock[]) => {
    setData((current) => ({ ...current, pageLayouts: { ...current.pageLayouts, [pageId]: blocks } }))
  }, [])

  const resetPageLayout = useCallback((pageId: PageId) => {
    setData((current) => {
      const pageLayouts = { ...current.pageLayouts }
      delete pageLayouts[pageId]
      return { ...current, pageLayouts }
    })
  }, [])

  const value: LibraryValue = {
    ...data,
    saveCapture,
    addItem,
    updateItem,
    toggleItem,
    removeItem,
    addDiary,
    updateDiary,
    removeDiary,
    addMemo,
    updateMemo,
    removeMemo,
    addBook,
    updateBook,
    removeBook,
    addLog,
    addCategory,
    updateCategory,
    reorderCategories,
    removeCategory,
    updateSettings,
    resetPreferences,
    addRecordType,
    updateRecordType,
    duplicateRecordType,
    removeRecordType,
    addRecord,
    updateRecord,
    removeRecord,
    setPageLayout,
    resetPageLayout,
  }

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}
