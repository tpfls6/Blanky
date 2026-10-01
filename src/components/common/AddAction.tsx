type AddActionProps = {
  label: string
  onClick: () => void
}

export function AddAction({ label, onClick }: AddActionProps) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-neutral-500 hover:text-neutral-900">
      + {label}
    </button>
  )
}
