import { useState } from 'react'
import { NaturalLanguageInput } from '../../components/schedule/NaturalLanguageInput.tsx'

export function HomePage() {
  const [draft, setDraft] = useState('')

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-8 sm:py-16 md:py-20">
      <h1 className="text-2xl font-medium tracking-tight text-neutral-900 sm:text-3xl">
        Today
      </h1>
      <NaturalLanguageInput value={draft} onChange={setDraft} />
      <p className="mt-10 text-sm text-neutral-500 sm:mt-16">
        오늘의 일정이 아직 없습니다.
      </p>
    </section>
  )
}
