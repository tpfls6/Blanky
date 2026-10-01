import { useState } from 'react'
import { NaturalLanguageInput } from '../schedule/NaturalLanguageInput.tsx'
import { useWorkspace } from '../../state/useWorkspace.ts'

export function CaptureScreen() {
  const { submitCapture, openWorkspace } = useWorkspace()
  const [value, setValue] = useState('')

  return (
    <div className="flex min-h-svh items-center justify-center px-6">
      <p className="fixed top-5 left-5 text-sm text-neutral-900">Blanky</p>
      <div className="w-full max-w-xl -translate-y-[8vh]">
        <NaturalLanguageInput
          value={value}
          onChange={setValue}
          onSubmit={() => submitCapture(value)}
          variant="capture"
        />
        <button
          type="button"
          onClick={openWorkspace}
          className="mt-6 text-sm text-neutral-400 hover:text-neutral-800"
        >
          직접 추가
        </button>
      </div>
    </div>
  )
}
