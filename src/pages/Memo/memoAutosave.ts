export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed'

type Timer = ReturnType<typeof setTimeout>

/**
 * Debounced autosave for one editor. Each change is a full snapshot, so only the newest one matters:
 * saves run one after another (an older save can never land after a newer one), a failed save is kept
 * for a retry unless a newer snapshot already replaced it, and `flush` saves whatever is waiting now.
 */
export function createAutosave<T>({ save, onStatus, delay = 800, setTimer = setTimeout, clearTimer = clearTimeout }: {
  save: (value: T) => void | Promise<void>
  onStatus: (status: AutosaveStatus, error?: string) => void
  delay?: number
  setTimer?: (run: () => void, ms: number) => Timer
  clearTimer?: (timer: Timer) => void
}) {
  let draft: { value: T } | null = null
  let timer: Timer | null = null
  let seq = 0
  let stopped = false
  // Resolves to whether the newest started save succeeded.
  let chain: Promise<boolean> = Promise.resolve(true)

  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer)
    timer = null
  }
  const flush = (): Promise<boolean> => {
    cancelTimer()
    if (!draft || stopped) return chain
    const { value } = draft
    draft = null
    const mine = ++seq
    onStatus('saving')
    chain = chain.then(async () => {
      try {
        await save(value)
        if (mine === seq && !draft) onStatus('saved')
        return true
      } catch (error) {
        // A newer snapshot (queued or waiting) carries this one's changes too.
        if (mine === seq && !draft) {
          draft = { value }
          onStatus('failed', error instanceof Error ? error.message : undefined)
        }
        return false
      }
    })
    return chain
  }
  return {
    change(value: T) {
      if (stopped) return
      draft = { value }
      onStatus('pending')
      cancelTimer()
      timer = setTimer(() => { timer = null; void flush() }, delay)
    },
    flush,
    /** Drops what is waiting and ignores changes until `resume` (the memo is being deleted). */
    stop() { cancelTimer(); draft = null; stopped = true },
    resume() { stopped = false },
    get dirty() { return draft !== null },
  }
}

/** Title used when the title field is left empty: the body's first non-empty line, else the fallback. */
export function memoAutoTitle(title: string, plainBody: string, fallback: string): string {
  return title.trim() || plainBody.split('\n').map(line => line.trim()).find(Boolean)?.slice(0, 80) || fallback
}
