import { ArrowUp } from 'lucide-react'
import { useEffect, useRef } from 'react'

type NaturalLanguageInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  variant?: 'capture' | 'inline'
}

export function NaturalLanguageInput({
  value,
  onChange,
  onSubmit,
  variant = 'inline',
}: NaturalLanguageInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const capture = variant === 'capture'
  const canSubmit = value.trim().length > 0

  useEffect(() => {
    const field = ref.current
    if (!field) return
    field.style.height = 'auto'
    const max = window.innerHeight * 0.4
    const next = Math.min(field.scrollHeight, max)
    field.style.height = `${next}px`
    field.style.overflowY = field.scrollHeight > max ? 'auto' : 'hidden'
  }, [value])

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        rows={1}
        autoFocus={capture}
        placeholder="오늘 무엇을 해야 하나요?"
        aria-label="오늘 무엇을 해야 하나요?"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return
          event.preventDefault()
          if (canSubmit) onSubmit()
        }}
        className={[
          'w-full resize-none bg-transparent text-neutral-900 placeholder:text-neutral-300 focus:outline-none',
          capture
            ? 'min-h-16 text-2xl leading-snug sm:text-[1.75rem]'
            : 'min-h-10 text-base leading-relaxed',
        ].join(' ')}
      />
      <div className={capture ? 'mt-4 flex justify-end' : 'mt-2 flex justify-end'}>
        <button
          type="button"
          aria-label="전송"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="p-1 text-neutral-400 hover:text-neutral-800 disabled:opacity-30"
        >
          <ArrowUp className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
