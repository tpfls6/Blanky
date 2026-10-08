import { createContext, useContext } from 'react'

export type ConfirmOptions = { title?: string; confirmLabel?: string }
export type Confirm = (message: string, options?: ConfirmOptions) => Promise<boolean>
export const ConfirmContext = createContext<Confirm | null>(null)
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('ConfirmProvider missing')
  return confirm
}
