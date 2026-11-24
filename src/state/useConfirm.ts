import { createContext, useContext } from 'react'

/** danger (default) for destructive actions, neutral for leave/discard prompts. */
export type ConfirmTone = 'danger' | 'neutral'
export type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; tone?: ConfirmTone }
export type Confirm = (message: string, options?: ConfirmOptions) => Promise<boolean>
export const ConfirmContext = createContext<Confirm | null>(null)
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('ConfirmProvider missing')
  return confirm
}
