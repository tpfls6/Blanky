import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../constants/routes.ts'
import { createSeed, noteFromText, CATEGORIES } from '../data/mockWorkspace.ts'
import type { RepeatRule, WorkInput, WorkItem, WorkPatch, WorkspaceCategory } from '../types/work.ts'
import { createWorkItem, placedTimes, reorderAmongSiblings, selfCheckWork } from '../utils/work.ts'
import { daySpan, shiftISO } from '../utils/date.ts'
import { WorkspaceContext, type WorkspaceValue } from './useWorkspace.ts'

selfCheckWork()

type Phase = WorkspaceValue['phase']

const STORAGE_KEY = 'blanky.workspace.v1'

function normalizeItem(value: unknown): WorkItem | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<WorkItem>
  if (
    typeof item.id !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.date !== 'string'
  ) {
    return null
  }
  if (item.kind !== 'task' && item.kind !== 'event') return null
  const priority =
    item.priority === 'low' || item.priority === 'high' || item.priority === 'medium'
      ? item.priority
      : 'medium'
  const repeat: RepeatRule =
    item.repeat === 'daily' || item.repeat === 'weekly' || item.repeat === 'monthly'
      ? item.repeat
      : 'none'

  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    description: typeof item.description === 'string' ? item.description : '',
    date: item.date,
    startTime: typeof item.startTime === 'string' ? item.startTime : null,
    endTime: typeof item.endTime === 'string' ? item.endTime : null,
    duration: typeof item.duration === 'number' ? item.duration : null,
    categoryId: typeof item.categoryId === 'string' ? item.categoryId : null,
    priority,
    status: item.status === 'done' ? 'done' : 'todo',
    dueDate: typeof item.dueDate === 'string' ? item.dueDate : null,
    endDate: typeof item.endDate === 'string' && item.endDate > item.date ? item.endDate : null,
    allDay: item.allDay === true,
    repeat,
  }
}

function normalizeCategory(value: unknown): WorkspaceCategory | null {
  if (!value || typeof value !== 'object') return null
  const category = value as Partial<WorkspaceCategory>
  if (typeof category.id !== 'string' || typeof category.name !== 'string' || !category.name.trim()) {
    return null
  }
  return {
    id: category.id,
    name: category.name.trim(),
    parentId: typeof category.parentId === 'string' ? category.parentId : null,
  }
}

function readStored(): { phase: Phase; items: WorkItem[]; categories: WorkspaceCategory[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { phase: 'capture', items: [], categories: CATEGORIES }
    const data = JSON.parse(raw) as { phase?: string; items?: unknown; categories?: unknown }
    const categories = Array.isArray(data.categories)
      ? data.categories.map(normalizeCategory).filter((category) => category !== null)
      : CATEGORIES
    if (data.phase !== 'workspace' || !Array.isArray(data.items)) {
      return { phase: 'capture', items: [], categories: categories.length > 0 ? categories : CATEGORIES }
    }
    const items = data.items.map(normalizeItem).filter((item) => item !== null)
    return { phase: 'workspace', items, categories: categories.length > 0 ? categories : CATEGORIES }
  } catch {
    return { phase: 'capture', items: [], categories: CATEGORIES }
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [stored] = useState(readStored)
  const [phase, setPhase] = useState<Phase>(stored.phase)
  const [items, setItems] = useState<WorkItem[]>(stored.items)
  const [categories, setCategories] = useState<WorkspaceCategory[]>(stored.categories)
  const pendingText = useRef('')

  useEffect(() => {
    if (phase !== 'workspace') return
    // ponytail: one browser key. Replace with the schedule repository when the API is connected.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ phase, items, categories }))
  }, [phase, items, categories])

  const submitCapture = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    pendingText.current = trimmed
    setPhase('organizing')
  }, [])

  const finishOrganize = useCallback(() => {
    const text = pendingText.current
    pendingText.current = ''
    setItems((current) => {
      const base = current.length > 0 ? current : createSeed()
      return text ? [...base, noteFromText(text)] : base
    })
    setPhase('workspace')
    navigate(ROUTES.home)
  }, [navigate])

  const openWorkspace = useCallback(() => {
    setItems((current) => (current.length > 0 ? current : createSeed()))
    setPhase('workspace')
    navigate(ROUTES.home)
  }, [navigate])

  const addNote = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setItems((current) => [...current, noteFromText(trimmed)])
  }, [])

  const add = useCallback((input: WorkInput) => {
    const item = createWorkItem(input)
    if (!item) return
    setItems((current) => [...current, item])
  }, [])

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toggle = useCallback((id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: item.status === 'done' ? 'todo' : 'done' }
          : item,
      ),
    )
  }, [])

  const update = useCallback((id: string, patch: WorkPatch) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }, [])

  const moveTo = useCallback((id: string, date: string) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        if (item.endDate && item.endDate > item.date) {
          return { ...item, date, endDate: shiftISO(date, daySpan(item.date, item.endDate)) }
        }
        return { ...item, date }
      }),
    )
  }, [])

  const placeAt = useCallback((id: string, date: string, startTime: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, date, allDay: false, ...placedTimes(item, startTime) } : item,
      ),
    )
  }, [])

  const addCategory = useCallback((name: string, parentId: string | null) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCategories((current) => [
      ...current,
      { id: crypto.randomUUID(), name: trimmed, parentId },
    ])
  }, [])

  const renameCategory = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCategories((current) =>
      current.map((category) => (category.id === id ? { ...category, name: trimmed } : category)),
    )
  }, [])

  const removeCategory = useCallback((id: string) => {
    setCategories((current) => {
      const dropping = new Set(
        current
          .filter((category) => category.id === id || category.parentId === id)
          .map((category) => category.id),
      )
      setItems((itemsNow) =>
        itemsNow.map((item) =>
          item.categoryId && dropping.has(item.categoryId) ? { ...item, categoryId: null } : item,
        ),
      )
      return current.filter((category) => !dropping.has(category.id))
    })
  }, [])

  const moveCategory = useCallback((id: string, direction: -1 | 1) => {
    setCategories((current) => {
      const item = current.find((category) => category.id === id)
      if (!item) return current
      const siblings = current.filter((category) => category.parentId === item.parentId)
      const position = siblings.findIndex((category) => category.id === id)
      const target = siblings[position + direction]
      if (!target) return current
      return reorderAmongSiblings(current, id, target.id)
    })
  }, [])

  const reorderCategory = useCallback((id: string, targetId: string) => {
    setCategories((current) => reorderAmongSiblings(current, id, targetId))
  }, [])

  return (
    <WorkspaceContext.Provider
      value={{
        phase,
        items,
        categories,
        submitCapture,
        finishOrganize,
        openWorkspace,
        addNote,
        add,
        remove,
        toggle,
        update,
        moveTo,
        placeAt,
        addCategory,
        renameCategory,
        removeCategory,
        moveCategory,
        reorderCategory,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}
