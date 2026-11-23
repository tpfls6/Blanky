import { useSearchParams } from 'react-router-dom'

/** `?add=quick` opens the sheet, so links (planner, guide replay) and the Back button work with it. */
export const QUICK_ADD_PARAM = 'add'
export type QuickAddState = { quickAddText?: string } | null

/** Opens the quick-add sheet; `text` pre-fills the composer (example cards). */
export function useOpenQuickAdd() {
  const [, setParams] = useSearchParams()
  return (text?: string) => setParams((current) => {
    const next = new URLSearchParams(current)
    next.set(QUICK_ADD_PARAM, 'quick')
    return next
    // Replace: the sheet pushes its own Back entry once open.
  }, { replace: true, state: text ? { quickAddText: text } : null })
}

