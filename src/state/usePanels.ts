import { useCallback, useState } from 'react'
import type { WorkKind } from '../types/work.ts'

export type ComposerSeed = {
  kind: WorkKind
  date: string
}

export function usePanels() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composer, setComposer] = useState<ComposerSeed | null>(null)

  const openItem = useCallback((id: string) => {
    setComposer(null)
    setSelectedId(id)
  }, [])

  const openComposer = useCallback((seed: ComposerSeed) => {
    setSelectedId(null)
    setComposer(seed)
  }, [])

  const closeItem = useCallback(() => setSelectedId(null), [])
  const closeComposer = useCallback(() => setComposer(null), [])

  return {
    selectedId,
    composer,
    openItem,
    openComposer,
    closeItem,
    closeComposer,
  }
}
