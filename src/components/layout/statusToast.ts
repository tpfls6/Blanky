// One short-lived result line shown in the app status notice stack (next to the PWA notices).
// `sticky` toasts (results that need a look, failures) stay until replaced, dismissed or acted on.
export type StatusToast = { id: number; text: string; tone: 'saved' | 'failed'; sticky?: boolean; action?: { label: string; run: () => void } }

const DURATION = 4000
const listeners = new Set<() => void>()
let current: StatusToast | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const emit = () => listeners.forEach(listener => listener())

export function showStatusToast(toast: Omit<StatusToast, 'id'>) {
  current = { ...toast, id: ++seq }
  emit()
  holdStatusToast(false)
}

export function dismissStatusToast() {
  clearTimeout(timer)
  if (!current) return
  current = null
  emit()
}

/** Pointer or focus on the toast keeps it up; leaving restarts the countdown. */
export function holdStatusToast(hold: boolean) {
  clearTimeout(timer)
  if (!hold && current && !current.sticky) timer = setTimeout(dismissStatusToast, DURATION)
}

export function subscribeStatusToast(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const getStatusToast = () => current
