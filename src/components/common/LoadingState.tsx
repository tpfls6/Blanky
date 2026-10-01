type LoadingStateProps = {
  title: string
  steps: readonly string[]
  visibleCount: number
}

export function LoadingState({ title, steps, visibleCount }: LoadingStateProps) {
  const progress = Math.min(visibleCount / steps.length, 1)

  return (
    <div className="flex min-h-svh items-center justify-center px-6">
      <div className="w-full max-w-sm -translate-y-[8vh]">
        <p className="text-lg text-neutral-800" aria-live="polite">
          {title}
        </p>
        <div className="mt-4 h-px w-full bg-neutral-100" aria-hidden="true">
          <div
            className="h-px bg-neutral-800 transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <ul className="mt-6 space-y-2">
          {steps.slice(0, visibleCount).map((step) => (
            <li key={step} className="text-sm text-neutral-500">
              {step}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
