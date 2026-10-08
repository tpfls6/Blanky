import { useLayoutEffect, useRef, useState } from 'react'

export function InlineName({
  value,
  onCommit,
  label,
  emptyMessage = '이름을 입력해주세요.',
  className = 'text-sm',
}: {
  value: string
  onCommit: (next: string) => void
  label: string
  emptyMessage?: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const editing = draft !== null

  useLayoutEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const stop = (save: boolean) => {
    if (done.current) return
    const next = (inputRef.current?.value ?? draft ?? '').trim()
    if (save && !next) {
      inputRef.current?.setCustomValidity(emptyMessage)
      inputRef.current?.reportValidity()
      return
    }
    done.current = true
    inputRef.current?.setCustomValidity('')
    setDraft(null)
    if (save && next !== value) onCommit(next)
  }

  if (!editing) {
    return (
      <span
        data-no-drag
        title="더블클릭해서 수정"
        onDoubleClick={() => {
          done.current = false
          setDraft(value)
        }}
        className={`min-w-0 flex-1 cursor-text truncate ${className}`}
      >
        {value}
      </span>
    )
  }

  return (
    <input data-theme-slot="input"
      ref={inputRef}
      data-no-drag
      value={draft}
      aria-label={label}
      onChange={(event) => {
        event.currentTarget.setCustomValidity('')
        setDraft(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          stop(true)
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          stop(false)
        }
      }}
      onBlur={() => stop(Boolean((inputRef.current?.value ?? '').trim()))}
      className={`min-w-0 flex-1 bg-transparent outline-none ${className}`}
    />
  )
}
