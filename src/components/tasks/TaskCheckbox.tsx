import { Check } from 'lucide-react'

type TaskCheckboxProps = {
  checked: boolean
  label: string
  onChange: () => void
}

export function TaskCheckbox({ checked, label, onChange }: TaskCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="inline-flex size-4 shrink-0 items-center justify-center"
    >
      <span
        className={[
          'flex size-4 items-center justify-center rounded-[3px] border',
          checked ? 'border-neutral-800' : 'border-neutral-300',
        ].join(' ')}
      >
        {checked ? (
          <Check className="size-3 text-neutral-800" strokeWidth={2} aria-hidden="true" />
        ) : null}
      </span>
    </button>
  )
}
