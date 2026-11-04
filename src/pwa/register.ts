// Registers /sw.js in production builds and reports when a new version waits.
// The waiting worker only takes over after the user chooses to reload, so a
// half-filled form is never swapped out under them.
type Listener = () => void

let waiting: ServiceWorker | null = null
const listeners = new Set<Listener>()

function setWaiting(worker: ServiceWorker | null) {
  waiting = worker
  listeners.forEach((listener) => listener())
}

export function subscribeUpdate(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function hasUpdate(): boolean {
  return waiting !== null
}

export function applyUpdate() {
  if (!waiting) return
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      const track = (worker: ServiceWorker | null) => {
        worker?.addEventListener('statechange', () => {
          // An installed worker beside an active controller is an update, not the first install.
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker)
        })
      }
      if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting)
      track(registration.installing)
      registration.addEventListener('updatefound', () => track(registration.installing))
      // Installed apps can stay open for days; look for a deploy whenever they return to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => undefined)
      })
    }).catch((error: unknown) => console.warn('Service worker registration failed', error))
  })
}
