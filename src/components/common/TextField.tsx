import { useId } from 'react'

type TextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  error?: string
  autoComplete?: string
  placeholder?: string
  multiline?: boolean
}

const control = 'field mt-1 w-full'

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  error,
  autoComplete,
  placeholder,
  multiline = false,
}: TextFieldProps) {
  const id = useId()

  return (
    <label className="block" htmlFor={id}>
      <span className="text-xs text-neutral-500">{label}</span>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`${control} min-h-28 resize-y`}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={control}
        />
      )}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  )
}
