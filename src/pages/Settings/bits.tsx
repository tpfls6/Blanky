import type { ReactNode } from 'react'

export function Section({ children }: { children: ReactNode }) {
  return <div className="space-y-8 [&>*+*]:border-t [&>*+*]:border-line [&>*+*]:pt-8">{children}</div>
}

export function Group({
  id,
  title,
  description,
  children,
}: {
  id?: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-sm font-medium tracking-tight">{title}</h2>
      {description ? <p className="mt-1 text-xs text-neutral-400">{description}</p> : null}
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  )
}

export function SettingsTabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
}: {
  label: string
  value: T
  tabs: readonly { id: T; label: string }[]
  onChange: (id: T) => void
}) {
  return (
    <div className="mb-8 flex flex-wrap gap-5 border-b border-line" role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const on = value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-selected={on}
            aria-controls={`settings-tab-panel-${tab.id}`}
            className={on ? 'tab tab-on' : 'tab'}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
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

