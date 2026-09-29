type NaturalLanguageInputProps = {
  value: string
  onChange: (value: string) => void
}

export function NaturalLanguageInput({
  value,
  onChange,
}: NaturalLanguageInputProps) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={3}
      placeholder="오늘 무엇을 해야 하나요?"
      aria-label="오늘 무엇을 해야 하나요?"
      className="mt-8 w-full resize-none border-b border-neutral-200 bg-transparent pb-3 text-xl leading-snug text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none sm:mt-12 sm:text-2xl"
    />
  )
}
