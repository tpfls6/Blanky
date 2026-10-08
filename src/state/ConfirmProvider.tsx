import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/common/ConfirmDialog.tsx'
import { ConfirmContext, type Confirm, type ConfirmOptions } from './useConfirm.ts'

type Request = { id: number; message: string; options: ConfirmOptions; resolve: (value: boolean) => void }
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<Request[]>([])
  const pending = useRef<Request[]>([])
  const sequence = useRef(0)
  const confirm = useCallback<Confirm>((message, options = {}) => new Promise(resolve => {
    const request = { id: ++sequence.current, message, options, resolve }
    pending.current = [...pending.current, request]
    setRequests(pending.current)
  }), [])
  useEffect(() => () => { pending.current.forEach(request => request.resolve(false)); pending.current = [] }, [])
  const finish = (accepted: boolean) => {
    const [request, ...rest] = pending.current
    pending.current = rest
    setRequests(rest)
    request?.resolve(accepted)
  }
  const active = requests[0]
  return <ConfirmContext.Provider value={confirm}>{children}{active && <ConfirmDialog key={active.id} title={active.options.title ?? '삭제할까요?'} body={active.message} confirmLabel={active.options.confirmLabel ?? '삭제'} onCancel={() => finish(false)} onConfirm={() => finish(true)} />}</ConfirmContext.Provider>
}
