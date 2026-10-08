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

export { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx'

