import type { ReactNode } from 'react'

export function Section({ children }: { children: ReactNode }) {
  return <div className="space-y-8 [&>*+*]:border-t [&>*+*]:border-line [&>*+*]:pt-8">{children}</div>
}

export function Choice<T extends string | number>({
  value,
  current,
  label,
  onPick,
}: {
  value: T
  current: T
  label: string
  onPick: (value: T) => void
}) {
  const on = current === value
  return (
    <button type="button" role="radio" aria-checked={on} onClick={() => onPick(value)} className={on ? 'choice choice-on' : 'choice'}>
      {label}
    </button>
  )
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange} className="flex w-full items-center justify-between gap-4 text-left text-sm">
      <span>
        {label}
        {hint ? <span className="mt-1 block text-xs text-neutral-400">{hint}</span> : null}
      </span>
      <span className={checked ? 'switch switch-on' : 'switch'} />
    </button>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-sm border border-line bg-surface px-6 py-5">
        <h2 id="confirm-title" className="text-base font-medium">{title}</h2>
        <p className="mt-2 text-sm text-neutral-500">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>취소</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function moveById<T extends { id: string }>(items: readonly T[], fromId: string, toId: string): T[] {
  const from = items.findIndex((item) => item.id === fromId)
  const to = items.findIndex((item) => item.id === toId)
  if (from < 0 || to < 0 || from === to) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
