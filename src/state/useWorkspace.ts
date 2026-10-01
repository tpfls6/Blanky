import { createContext, useContext } from 'react'
import type { WorkInput, WorkItem, WorkPatch, WorkspaceCategory } from '../types/work.ts'

export type WorkspaceValue = {
  phase: 'capture' | 'organizing' | 'workspace'
  items: WorkItem[]
  categories: WorkspaceCategory[]
  submitCapture: (text: string) => void
  finishOrganize: () => void
  openWorkspace: () => void
  addNote: (text: string) => void
  add: (input: WorkInput) => void
  remove: (id: string) => void
  toggle: (id: string) => void
  update: (id: string, patch: WorkPatch) => void
  moveTo: (id: string, date: string) => void
  placeAt: (id: string, date: string, startTime: string) => void
  addCategory: (name: string, parentId: string | null) => void
  renameCategory: (id: string, name: string) => void
  removeCategory: (id: string) => void
  moveCategory: (id: string, direction: -1 | 1) => void
  reorderCategory: (id: string, targetId: string) => void
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('Workspace missing')
  return value
}
