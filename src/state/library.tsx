import { mergeCategories } from '../utils/mergeCategories.ts'
import { getDiaryRecords, saveDiaryRecord, deleteDiaryRecord, hasSyncedDiary } from '../services/diary/index.ts'
import { loadWork, saveWork, workFromSchedule, type Activity } from '../services/schedule/workStore.ts'
import type { Schedule } from '@blanky/types'
import type { ScheduleBatchResult } from '@blanky/api'
import { isGoogleOriginWork } from '../services/calendarSync/origin.ts'
import { getScheduleRepository } from '../services/schedule/index.ts'
import { isSupabaseConfigured } from '../services/supabase/client.ts'
import type { WorkItem } from '../types/work.ts'
import { withPersonalCalendar } from '../services/calendar/local.ts'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { freshLibrary } from '../data/freshLibrary.ts'
import { cloneBlock, coerceRecordType, selfCheckRecords, structureKey, type CustomRecordType } from '../features/records/schema.ts'
import { forkCollections, snapshotCollections } from '../features/workspace/templates.ts'
import { DEFAULT_SWATCH } from '../constants/swatches.ts'
import { cloneBlocks, createPage, normalizePages, touchPage, type BuilderBlock, type UserPage } from '../features/builder/schema.ts'
import { pageTypeMarker, type PageTemplateKind } from '../features/pages/templates.ts'
import { listUserPages } from '../services/pages/index.ts'
import { getAllCustomRecords, getCustomRecordTypes } from '../services/records/index.ts'
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
import { asBookTrash, asCustomRecord, asDiary, asMemo, asWork, parseTrash, toTrash, withTrash } from '../utils/trash.ts'
import { categoryKind, createWorkItem, selfCheckWork } from '../utils/work.ts'
import { applyAccent, clearAccent } from '../theme/accent.ts'
import { applyDocumentLocale, guestOrBrowserLocale, touchDeviceLocale, writeGuestLocale } from '../i18n/storage.ts'
import { defaultPreferences, loadPreferences, normalizePreferences, pullPreferences, pushPreferences, savePreferences, syncNav } from '../services/preferences/index.ts'
import { libraryKey } from './storage.ts'
import {
  mirrorCategoryCreate,
  mirrorCategoryDelete,
  mirrorCategoryReorder,
  mirrorCategoryUpdate,
  mirrorRecordDelete,
  mirrorRecordSave,
  mirrorPageDelete,
  mirrorPageSave,
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
  return withPersonalCalendar(loadStoredLibrary(userId), userId)
}

function loadStoredLibrary(userId: string): LibraryData {
  try {
    const raw = localStorage.getItem(libraryKey(userId))
    if (!raw) return withFirstLocale(freshLibrary())
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
      activities: Array.isArray(data.activities) ? data.activities : [],
      personalCalendar: data.personalCalendar,
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
      trash: Array.isArray(data.trash) ? data.trash.flatMap((item) => {
        const next = parseTrash(item)
        return next ? [next] : []
      }) : [],
      settings,
      pageLayouts: normalizeLayouts(data.pageLayouts),
      customPages: normalizePages(data.customPages),
      pageTemplates: normalizePages(data.pageTemplates),
    }
  } catch {
    return withFirstLocale(freshLibrary())
  }
}

function withFirstLocale(data: LibraryData): LibraryData {
  return { ...data, settings: { ...data.settings, locale: guestOrBrowserLocale() } }
}

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyAppearance(settings: Settings) {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
  applyAccent(settings.accent, dark)
  applyDocumentLocale(settings.locale)
}

function dropWorkItems(current: LibraryData, removed: WorkItem[], source: Activity['source']): LibraryData {
  const ids = new Set(removed.map(item => item.id))
  const activities = removed.map(before => ({
    id: crypto.randomUUID(),
    entityId: before.id,
    before,
    after: null,
    action: 'deleted' as const,
    source,
    createdAt: new Date().toISOString(),
  }))
  return {
    ...current,
    items: current.items.filter(item => !ids.has(item.id)),
    activities: [...activities, ...(current.activities ?? [])],
    trash: removed.reduce((trash, item) => withTrash({ trash }, toTrash('item', item, item.title)), current.trash),
  }
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
      applyDocumentLocale(guestOrBrowserLocale())
      return
    }
    applyAppearance(data.settings)
    touchDeviceLocale(userId, data.settings.locale)
    writeGuestLocale(data.settings.locale)
  }, [userId, data.settings])

  const [diaryError, setDiaryError] = useState('')
  const [diaryLoading, setDiaryLoading] = useState(Boolean(userId))
  const diaryReady = useRef<Promise<unknown>>(Promise.resolve())
  const diaryQueue = useRef<Promise<unknown>>(Promise.resolve())
  const diaryUser = useRef(userId)
  useLayoutEffect(() => { diaryUser.current = userId }, [userId])
  useEffect(() => {
    let cancelled = false
    if (!userId) return
    const owner = userId
    diaryReady.current = (async () => {
      await Promise.resolve()
      if (cancelled) return
      setDiaryLoading(true)
      setDiaryError('')
      const remote = await getDiaryRecords(owner)
      const local = loadLibrary(owner).diaries
      const migrated: DiaryEntry[] = []
      for (const entry of local) {
        if (cancelled) return
        if (!remote.some(row => row.id === entry.id) && !hasSyncedDiary(owner, entry.id) && (entry.body.trim() || entry.title?.trim())) migrated.push(await saveDiaryRecord(owner, entry))
      }
      if (!cancelled) setData(current => ({ ...current, diaries: [...remote, ...migrated] }))
    })().catch(error => {
      if (!cancelled) setDiaryError(error instanceof Error ? error.message : '기록을 불러오지 못했습니다.')
      throw error
    }).finally(() => { if (!cancelled) setDiaryLoading(false) })
    void diaryReady.current.catch(() => undefined)
    return () => { cancelled = true }
  }, [userId])

  const commitDiary = useCallback((entry: DiaryEntry): Promise<DiaryEntry> => {
    const operation = diaryQueue.current.catch(() => undefined).then(async () => {
      await diaryReady.current
      if (!userId || diaryUser.current !== userId) throw new Error('로그인이 필요합니다.')
      const saved = await saveDiaryRecord(userId, { ...entry, updatedAt: new Date().toISOString() })
      if (diaryUser.current !== userId) throw new Error('사용자가 변경되었습니다.')
      setData(current => {
        const next = { ...current, diaries: [saved, ...current.diaries.filter(row => row.id !== saved.id && row.id !== entry.id)] }
        localStorage.setItem(libraryKey(userId), JSON.stringify(next))
        return next
      })
      return saved
    })
    diaryQueue.current = operation
    return operation
  }, [userId])
  const eraseDiary = useCallback((id: string): Promise<void> => {
    const operation = diaryQueue.current.catch(() => undefined).then(async () => {
      await diaryReady.current
      if (!userId || diaryUser.current !== userId) throw new Error('로그인이 필요합니다.')
      await deleteDiaryRecord(userId, id)
      if (diaryUser.current !== userId) throw new Error('사용자가 변경되었습니다.')
      setData(current => {
        const entry = current.diaries.find(row => row.id === id)
        const next = {
          ...current,
          diaries: current.diaries.filter(row => row.id !== id),
          trash: entry ? withTrash(current, toTrash('diary', entry, entry.title?.trim() || entry.body.slice(0, 40) || '일기')) : current.trash,
        }
        localStorage.setItem(libraryKey(userId), JSON.stringify(next))
        return next
      })
    })
    diaryQueue.current = operation
    return operation
  }, [userId])

  const [workError, setWorkError] = useState('')
  const remoteIds = useRef(new Set<string>())
  const activeUser = useRef(userId)
  useLayoutEffect(() => { activeUser.current = userId }, [userId])
  const workLoaded = useRef(!isSupabaseConfigured)
  const ready = useRef<Promise<unknown>>(Promise.resolve())
  const workQueue = useRef<Promise<unknown>>(Promise.resolve())
  useEffect(() => {
    remoteIds.current = new Set()
    workLoaded.current = !isSupabaseConfigured
    if (!userId || !isSupabaseConfigured) return
    let cancelled = false
    ready.current = loadWork().then(remote => {
      if (cancelled) return
      remoteIds.current = new Set(remote.items.map(item => item.id))
      workLoaded.current = true
      setWorkError('')
      setData(current => {
        const merged = mergeCategories(current.categories, remote.categories)
        return { ...current, categories: merged.categories,
          items: [...current.items.filter(item => (!item.calendarId || item.calendarId.startsWith('local-personal:')) && !remoteIds.current.has(item.id)), ...remote.items].map(merged.remap),
          memos: current.memos.map(merged.remap), activities: remote.activities }
      })
    }).catch((error: unknown) => {
      if (!cancelled) setWorkError(error instanceof Error
        ? `서버 일정 조회 실패: ${error.message}`
        : '서버 일정을 불러오지 못했습니다. 연결 및 DB 마이그레이션을 확인해 주세요.')
    })
    return () => { cancelled = true }
  }, [userId])

  const commitWork = useCallback((before: WorkItem | null, after: WorkItem | null, source: Activity['source'] = 'manual'): Promise<WorkItem | null> => {
    const operation = workQueue.current.catch(() => undefined).then(async () => {
      await ready.current
      if (!workLoaded.current) throw new Error('서버 데이터를 먼저 불러와야 합니다.')
      if (!userId || activeUser.current !== userId) throw new Error('로그인이 필요합니다.')
      let saved = after
      if (after) {
          const normalized = createWorkItem(after, { inferEndTime: source !== 'ai_chat' })
        if (!normalized) throw new Error('제목과 날짜를 확인해 주세요.')
        saved = { ...normalized, id: after.id, calendarId: after.calendarId ?? data.personalCalendar?.id, createdByUserId: after.createdByUserId ?? userId }
      }
      let categories: WorkspaceCategory[] = []
      if (saved) {
        const result = await saveWork(userId, before, saved, Boolean(before && remoteIds.current.has(before.id)), source, data.categories)
        saved = result.item
        categories = result.categories
      }
      else if (before && isSupabaseConfigured && remoteIds.current.has(before.id)) await getScheduleRepository().remove(before.id)
      if (activeUser.current !== userId) throw new Error('사용자가 변경되었습니다.')
      if (saved && isSupabaseConfigured) remoteIds.current.add(saved.id)
      if (!saved && before) remoteIds.current.delete(before.id)
      const activity: Activity = { id: crypto.randomUUID(), entityId: saved?.id ?? before!.id, before, after: saved,
        action: !before ? 'created' : !saved ? 'deleted' : saved.status === 'done' && before.status !== 'done' ? 'completed' : 'updated', source, createdAt: new Date().toISOString() }
      setData(current => {
        const merged = mergeCategories(current.categories, categories)
        return { ...current, categories: merged.categories,
          items: [...current.items.filter(item => item.id !== before?.id && item.id !== saved?.id), ...(saved ? [saved] : [])].map(merged.remap),
          memos: current.memos.map(merged.remap), activities: [activity, ...(current.activities ?? [])],
          trash: !saved && before ? withTrash(current, toTrash('item', before, before.title)) : current.trash }
      })
      setWorkError('')
      return saved
    })
    workQueue.current = operation
    return operation
  }, [userId, data.categories, data.personalCalendar?.id])

  const applyWorkBatch = useCallback((input: { key: string; deletes: WorkItem[]; source?: Activity['source'] }): Promise<ScheduleBatchResult> => {
    const operation = workQueue.current.catch(() => undefined).then(async () => {
      await ready.current
      if (!workLoaded.current) throw new Error('서버 데이터를 먼저 불러와야 합니다.')
      if (!userId || activeUser.current !== userId) throw new Error('로그인이 필요합니다.')
      const unique = [...new Map(input.deletes.map(item => [item.id, item])).values()]
      const source = input.source ?? 'ai_chat'
      if (!unique.length) return { status: 'unchanged' as const, deletedIds: [], google: 'idle' as const }
      if (unique.some(isGoogleOriginWork)) throw new Error('Google에서 가져온 일정은 원본을 지우지 않았어요.')
      const remote = unique.filter(item => remoteIds.current.has(item.id))
      if (isSupabaseConfigured && remote.length && remote.length !== unique.length) {
        throw new Error('로컬과 서버 일정을 한 번에 변경할 수 없습니다.')
      }
      let result: ScheduleBatchResult
      if (isSupabaseConfigured && remote.length === unique.length) {
        result = await getScheduleRepository().applyBatch(input.key, unique.map(item => item.id))
        if (activeUser.current !== userId) throw new Error('사용자가 변경되었습니다.')
        for (const id of result.deletedIds) remoteIds.current.delete(id)
      } else {
        result = { status: 'applied', deletedIds: unique.map(item => item.id), google: 'idle' }
      }
      let rejected = false
      setData(current => {
        const gone = unique.filter(item => result.deletedIds.includes(item.id))
        if (gone.some(item => !current.items.some(row => row.id === item.id))) {
          if (!isSupabaseConfigured) {
            rejected = true
            return current
          }
        }
        const live = gone.filter(item => current.items.some(row => row.id === item.id))
        return live.length ? dropWorkItems(current, live, source) : current
      })
      if (rejected) throw new Error('일정 변경에 실패하여 기존 일정이 유지되었습니다.')
      setWorkError('')
      if (typeof window !== 'undefined') {
        ;(window as Window & { __blankyLastBatch?: ScheduleBatchResult }).__blankyLastBatch = result
      }
      return result
    })
    workQueue.current = operation
    return operation
  }, [userId])
  useEffect(() => {
    const host = window as Window & { __blankyApplyWorkBatch?: typeof applyWorkBatch }
    host.__blankyApplyWorkBatch = applyWorkBatch
    return () => { delete host.__blankyApplyWorkBatch }
  }, [applyWorkBatch])

  const adoptPlannerSchedules = useCallback((rows: Schedule[]) => {
    if(!userId||activeUser.current!==userId||rows.some(row=>row.userId!==userId))throw new Error('로그인 사용자가 변경되었어요.')
    const items=rows.map(workFromSchedule), ids=new Set(items.map(item=>item.id))
    ids.forEach(id=>remoteIds.current.add(id))
    setData(current=>({...current,items:[...current.items.filter(item=>!ids.has(item.id)),...items]}))
  },[userId])
  const refreshWork = useCallback(async()=>{
    if(!userId||!isSupabaseConfigured)return
    const remote=await loadWork()
    if(activeUser.current!==userId)throw new Error('로그인 사용자가 변경되었어요.')
    const ids=new Set(remote.items.map(item=>item.id));remoteIds.current=ids
    setData(current=>({...current,items:[...current.items.filter(item=>(!item.calendarId||item.calendarId.startsWith('local-personal:'))&&!ids.has(item.id)),...remote.items],activities:remote.activities}))
  },[userId])

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
    const preview = applyCapture(data, trimmed, type)
    const diary = preview.diaries.find(entry => !data.diaries.some(existing => existing.id === entry.id))
    setData((current) => {
      const next = applyCapture(current, trimmed, type)
      const result = diary ? { ...next, diaries: [diary, ...current.diaries] } : next
      return userId ? withPersonalCalendar(result, userId) : result
    })
    if (diary) void commitDiary(diary).catch(error => setDiaryError(error instanceof Error ? error.message : '기록을 저장하지 못했습니다.'))
    return null
  }, [data, userId, commitDiary])

  const addItem = useCallback((input: WorkInput) => {
    const item = createWorkItem(input)
    if (item) void commitWork(null, item).catch(() => setWorkError('일정을 저장하지 못했습니다. 다시 시도해 주세요.'))
  }, [commitWork])
  const updateItem = useCallback((id: string, patch: WorkPatch) => {
    const item = data.items.find(row => row.id === id)
    if (item) void commitWork(item, { ...item, ...patch }).catch(() => setWorkError('변경을 저장하지 못했습니다.'))
  }, [commitWork, data.items])
  const toggleItem = useCallback((id: string) => {
    const item = data.items.find(row => row.id === id)
    if (item) void commitWork(item, { ...item, status: item.status === 'done' ? 'todo' : 'done' }).catch(() => setWorkError('완료 상태를 저장하지 못했습니다.'))
  }, [commitWork, data.items])
  const removeItem = useCallback((id: string) => {
    const item = data.items.find(row => row.id === id)
    if (item) void commitWork(item, null).catch(() => setWorkError('삭제하지 못했습니다.'))
  }, [commitWork, data.items])

  const addDiary = useCallback((entry: Pick<DiaryEntry, 'date' | 'body' | 'tags'>) => {
    const now = new Date().toISOString()
    if (entry.body.trim()) void commitDiary({ ...entry, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).catch(error => setDiaryError(String(error)))
  }, [commitDiary])
  const updateDiary = useCallback((id: string, patch: Pick<DiaryEntry, 'date' | 'body' | 'tags'>) => {
    const entry = data.diaries.find(row => row.id === id)
    if (entry) void commitDiary({ ...entry, ...patch }).catch(error => setDiaryError(String(error)))
  }, [commitDiary, data.diaries])
  const removeDiary = useCallback((id: string) => {
    void eraseDiary(id).catch(error => setDiaryError(String(error)))
  }, [eraseDiary])

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
    setData((current) => {
      const memo = current.memos.find((item) => item.id === id)
      return {
        ...current,
        memos: current.memos.filter((item) => item.id !== id),
        trash: memo ? withTrash(current, toTrash('memo', memo, memo.title)) : current.trash,
      }
    })
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
    setData((current) => {
      const book = current.books.find((item) => item.id === id)
      const logs = current.logs.filter((log) => log.bookId === id)
      return {
        ...current,
        books: current.books.filter((item) => item.id !== id),
        logs: current.logs.filter((log) => log.bookId !== id),
        trash: book ? withTrash(current, toTrash('book', { id: book.id, book, logs }, book.title)) : current.trash,
      }
    })
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

  const addRecord = useCallback((typeId: string, input: { id?: string; title: string; values: Record<string, FieldValue> }) => {
    const id = input.id ?? crypto.randomUUID()
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
    setData((current) => {
      const record = current.records.find((item) => item.id === id)
      return {
        ...current,
        records: current.records.filter((item) => item.id !== id),
        trash: record ? withTrash(current, toTrash('record', record, record.title)) : current.trash,
      }
    })
    mirrorRecordDelete(id)
  }, [])

  const restoreTrash = useCallback(async (id: string) => {
    const row = data.trash.find((item) => item.id === id)
    if (!row) return
    if (row.kind === 'diary') {
      const entry = asDiary(row.payload)
      if (!entry) return
      await commitDiary(entry)
      setData((current) => ({ ...current, trash: current.trash.filter((item) => item.id !== id) }))
      return
    }
    if (row.kind === 'item') {
      const item = asWork(row.payload)
      if (!item) return
      await commitWork(null, item)
      setData((current) => ({ ...current, trash: current.trash.filter((item) => item.id !== id) }))
      return
    }
    setData((current) => {
      const next = current.trash.filter((item) => item.id !== id)
      if (row.kind === 'memo') {
        const memo = asMemo(row.payload)
        if (!memo || current.memos.some((item) => item.id === memo.id)) return { ...current, trash: next }
        return { ...current, trash: next, memos: [memo, ...current.memos] }
      }
      if (row.kind === 'record') {
        const record = asCustomRecord(row.payload)
        if (!record || current.records.some((item) => item.id === record.id)) return { ...current, trash: next }
        mirrorRecordSave({ id: record.id, typeId: record.typeId, title: record.title, values: record.values, templateVersion: record.templateVersion }, true)
        return { ...current, trash: next, records: [record, ...current.records] }
      }
      if (row.kind === 'book') {
        const bundle = asBookTrash(row.payload)
        if (!bundle || current.books.some((item) => item.id === bundle.book.id)) return { ...current, trash: next }
        return { ...current, trash: next, books: [bundle.book, ...current.books], logs: [...bundle.logs, ...current.logs] }
      }
      return { ...current, trash: next }
    })
  }, [commitDiary, commitWork, data.trash])

  const purgeTrash = useCallback((id: string) => {
    setData((current) => ({ ...current, trash: current.trash.filter((item) => item.id !== id) }))
  }, [])

  const emptyTrash = useCallback(() => {
    setData((current) => ({ ...current, trash: [] }))
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

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return
    let cancel = false
    void Promise.all([listUserPages('page'), listUserPages('template'), getCustomRecordTypes(), getAllCustomRecords()]).then(([pages, templates, types, remoteRecords]) => {
      if (cancel) return
      setData((current) => {
        const merge = (local: UserPage[], remote: UserPage[]) => {
          const map = new Map(local.map((item) => [item.id, item]))
          for (const row of remote) {
            const existing = map.get(row.id)
            if (!existing || row.updatedAt >= existing.updatedAt) map.set(row.id, row)
          }
          return [...map.values()].sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt))
        }
        const customPages = merge(current.customPages, pages)
        const pageTemplates = merge(current.pageTemplates, templates)
        for (const page of customPages) {
          const remote = pages.find((item) => item.id === page.id)
          if (!remote || page.updatedAt > remote.updatedAt) mirrorPageSave(page, 'page')
        }
        for (const page of pageTemplates) {
          const remote = templates.find((item) => item.id === page.id)
          if (!remote || page.updatedAt > remote.updatedAt) mirrorPageSave(page, 'template')
        }
        const recordMap = new Map(current.recordTypes.map((item) => [item.id, item]))
        for (const page of [...customPages, ...pageTemplates]) {
          for (const item of page.collections ?? []) {
            const next = coerceRecordType(item)
            if (next && !recordMap.has(next.id)) recordMap.set(next.id, next)
          }
        }
        for (const item of types) {
          const next = coerceRecordType({
            id: item.id,
            name: item.name,
            icon: item.icon,
            color: item.color,
            description: item.description,
            schemaVersion: item.schemaVersion,
            version: item.version,
            blocks: item.blocks,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })
          if (next) recordMap.set(next.id, next)
        }
        const records = new Map(current.records.map((item) => [item.id, item]))
        for (const item of remoteRecords) {
          records.set(item.id, {
            id: item.id,
            typeId: item.recordTypeId,
            title: item.title,
            values: item.values as Record<string, FieldValue>,
            templateVersion: item.templateVersion,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })
        }
        return { ...current, customPages, pageTemplates, recordTypes: [...recordMap.values()], records: [...records.values()] }
      })
    }).catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [userId])

  const addUserPage = useCallback((input: { name?: string; icon?: string; blocks?: BuilderBlock[]; template?: PageTemplateKind; fieldLabels?: Record<string, string> }) => {
    const page = createPage(input.name ?? '새 페이지', input.icon ?? 'StickyNote', input.blocks ?? [], data.customPages.length)
    page.template = input.template ?? null
    page.fieldLabels = input.fieldLabels ?? {}
    if (input.template) page.blocks = []
    const recordType: CustomRecordType | null = input.template
      ? {
          id: page.id,
          name: page.name,
          icon: page.icon,
          color: DEFAULT_SWATCH,
          description: pageTypeMarker(input.template),
          schemaVersion: 1,
          version: 1,
          blocks: [],
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        }
      : null
    setData((current) => ({
      ...current,
      customPages: [...current.customPages, { ...page, sort: current.customPages.length }],
      recordTypes: recordType ? [...current.recordTypes, recordType] : current.recordTypes,
    }))
    if (recordType) mirrorRecordTypeSave(recordType)
    mirrorPageSave({ ...page, sort: data.customPages.length })
    return page.id
  }, [data.customPages.length])

  const updateUserPage = useCallback((id: string, patch: Partial<Pick<UserPage, 'name' | 'icon' | 'description' | 'sort' | 'blocks' | 'template' | 'fieldLabels'>>) => {
    const saved: { value: UserPage | null } = { value: null }
    setData((current) => ({
      ...current,
      customPages: current.customPages.map((item) => {
        if (item.id !== id) return item
        const next = touchPage(item, patch)
        saved.value = next
        return next
      }),
    }))
    if (saved.value) {
      mirrorPageSave(saved.value)
      if (saved.value.template) {
        const type = data.recordTypes.find((item) => item.id === id)
        if (!type) {
          const recordType: CustomRecordType = {
            id,
            name: saved.value.name,
            icon: saved.value.icon,
            color: DEFAULT_SWATCH,
            description: pageTypeMarker(saved.value.template),
            schemaVersion: 1,
            version: 1,
            blocks: [],
            createdAt: saved.value.createdAt,
            updatedAt: saved.value.updatedAt,
          }
          setData((current) => ({ ...current, recordTypes: [...current.recordTypes, recordType] }))
          mirrorRecordTypeSave(recordType)
        } else if (patch.name !== undefined || patch.icon !== undefined) {
          updateRecordType(id, { name: saved.value.name, icon: saved.value.icon })
        }
      }
    }
  }, [data.recordTypes, updateRecordType])

  const duplicateUserPage = useCallback((id: string) => {
    const source = data.customPages.find((item) => item.id === id)
    if (!source) return null
    const forked = source.template ? { blocks: [] as BuilderBlock[], collections: [] as CustomRecordType[] } : forkCollections(source.blocks, data.recordTypes)
    const copy = createPage(`${source.name} 복사본`, source.icon, forked.blocks, data.customPages.length)
    copy.description = source.description
    copy.template = source.template
    copy.fieldLabels = { ...source.fieldLabels }
    if (source.template) copy.blocks = []
    const pageType: CustomRecordType | null = source.template
      ? {
          id: copy.id,
          name: copy.name,
          icon: copy.icon,
          color: DEFAULT_SWATCH,
          description: pageTypeMarker(source.template),
          schemaVersion: 1,
          version: 1,
          blocks: [],
          createdAt: copy.createdAt,
          updatedAt: copy.updatedAt,
        }
      : null
    setData((current) => ({
      ...current,
      recordTypes: [...current.recordTypes, ...forked.collections, ...(pageType ? [pageType] : [])],
      customPages: [...current.customPages, copy],
      settings: { ...current.settings, nav: syncNav(current.settings.nav, [...current.recordTypes.map((item) => item.id), ...forked.collections.map((item) => item.id)]) },
    }))
    for (const item of forked.collections) mirrorRecordTypeSave(item)
    if (pageType) mirrorRecordTypeSave(pageType)
    mirrorPageSave(copy)
    return copy.id
  }, [data.customPages, data.recordTypes])

  const removeUserPage = useCallback((id: string) => {
    setData((current) => ({
      ...current,
      customPages: current.customPages.filter((item) => item.id !== id),
      recordTypes: current.recordTypes.filter((item) => item.id !== id),
      records: current.records.filter((item) => item.typeId !== id),
    }))
    mirrorPageDelete(id)
    mirrorRecordTypeDelete(id)
  }, [])

  const moveUserPage = useCallback((id: string, delta: -1 | 1) => {
    setData((current) => {
      const index = current.customPages.findIndex((item) => item.id === id)
      const nextIndex = index + delta
      if (index < 0 || nextIndex < 0 || nextIndex >= current.customPages.length) return current
      const list = current.customPages.slice()
      const [item] = list.splice(index, 1)
      list.splice(nextIndex, 0, item)
      const customPages = list.map((page, sort) => {
        const next = page.sort === sort ? page : touchPage(page, { sort })
        if (next !== page) mirrorPageSave(next)
        return next
      })
      return { ...current, customPages }
    })
  }, [])

  const savePageTemplate = useCallback((pageId: string, name?: string) => {
    const source = data.customPages.find((item) => item.id === pageId)
    if (!source) return null
    const collections = snapshotCollections(source.blocks, data.recordTypes)
    const template = { ...createPage(name?.trim() || source.name, source.icon, cloneBlocks(source.blocks), data.pageTemplates.length), collections }
    setData((current) => ({ ...current, pageTemplates: [...current.pageTemplates, template] }))
    mirrorPageSave(template, 'template')
    return template.id
  }, [data.customPages, data.pageTemplates.length, data.recordTypes])

  const addPageFromTemplate = useCallback((template: { name: string; icon: string; blocks: BuilderBlock[]; collections?: CustomRecordType[] }) => {
    const forked = forkCollections(template.blocks, data.recordTypes, template.collections ?? [])
    const page = createPage(template.name, template.icon, forked.blocks, data.customPages.length)
    setData((current) => ({
      ...current,
      recordTypes: [...current.recordTypes, ...forked.collections],
      customPages: [...current.customPages, page],
      settings: { ...current.settings, nav: syncNav(current.settings.nav, [...current.recordTypes.map((item) => item.id), ...forked.collections.map((item) => item.id)]) },
    }))
    for (const item of forked.collections) mirrorRecordTypeSave(item)
    mirrorPageSave(page)
    return page.id
  }, [data.customPages.length, data.recordTypes])

  const adoptInstalledPage = useCallback((input: { page: UserPage; collections: CustomRecordType[]; records: CustomRecord[] }, persist = true) => {
    setData((current) => {
      if (current.customPages.some((item) => item.id === input.page.id)) return current
      const page = { ...input.page, sort: current.customPages.length }
      return {
        ...current,
        recordTypes: [...current.recordTypes, ...input.collections.filter((item) => !current.recordTypes.some((row) => row.id === item.id))],
        records: [...input.records.filter((item) => !current.records.some((row) => row.id === item.id)), ...current.records],
        customPages: [...current.customPages, page],
        settings: { ...current.settings, nav: syncNav(current.settings.nav, [...current.recordTypes.map((item) => item.id), ...input.collections.map((item) => item.id)]) },
      }
    })
    if (persist) {
      for (const item of input.collections) mirrorRecordTypeSave(item)
      for (const item of input.records) mirrorRecordSave({ id: item.id, typeId: item.typeId, title: item.title, values: item.values, templateVersion: item.templateVersion }, true)
      mirrorPageSave(input.page)
    }
    return input.page.id
  }, [])

  const removePageTemplate = useCallback((id: string) => {
    setData((current) => ({ ...current, pageTemplates: current.pageTemplates.filter((item) => item.id !== id) }))
    mirrorPageDelete(id)
  }, [])

  const value: LibraryValue = {
    ...data,
    commitDiary,
    eraseDiary,
    diaryError,
    diaryLoading,
    commitWork,
    applyWorkBatch,
    adoptPlannerSchedules,
    refreshWork,
    workError,
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
    restoreTrash,
    purgeTrash,
    emptyTrash,
    setPageLayout,
    resetPageLayout,
    addUserPage,
    updateUserPage,
    duplicateUserPage,
    removeUserPage,
    moveUserPage,
    savePageTemplate,
    addPageFromTemplate,
    adoptInstalledPage,
    removePageTemplate,
  }

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}
