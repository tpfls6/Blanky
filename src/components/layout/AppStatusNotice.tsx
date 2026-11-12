import { useEffect, useRef, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { applyUpdate, hasUpdate, subscribeUpdate } from '../../pwa/register.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { dismissStatusToast, getStatusToast, holdStatusToast, subscribeStatusToast } from './statusToast.ts'

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

// App-wide notices for the installed app: a waiting update, lost connection and short result toasts.
// The live region stays mounted so screen readers announce lines as they appear.
export function AppStatusNotice() {
  const { t } = useI18n()
  const update = useSyncExternalStore(subscribeUpdate, hasUpdate, () => false)
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const toast = useSyncExternalStore(subscribeStatusToast, getStatusToast, () => null)
  const action = toast?.action
  // ESC dismisses the toast when focus is on it, or from anywhere while no dialog, sheet or panel owns ESC.
  const shown = Boolean(toast)
  // Closing from inside the toast hands focus back to where it came from instead of dropping it on <body>.
  const returnTo = useRef<HTMLElement | null>(null)
  const close = () => {
    const back = returnTo.current
    returnTo.current = null
    dismissStatusToast()
    if (back?.isConnected) back.focus()
  }
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })
  useEffect(() => {
    if (!shown) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      const own = (event.target as Element | null)?.closest?.('[data-status-toast]')
      if (!own && document.querySelector('dialog[open], [aria-modal="true"], #home-chat-panel[data-state="open"]')) return
      event.preventDefault()
      if (own) closeRef.current()
      else dismissStatusToast()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown])
  return (
    <div className="app-status-notice" role="status" aria-live="polite">
      {!online && <p>{t('pwa.offline')}</p>}
      {update && <p>{t('pwa.updateReady')} <button type="button" className="btn btn-primary" onClick={applyUpdate}>{t('pwa.reload')}</button></p>}
      {toast && <p key={toast.id} data-status-toast={toast.tone}
        onPointerEnter={() => holdStatusToast(true)} onPointerLeave={() => holdStatusToast(false)}
        onFocus={event => { if (!event.currentTarget.contains(event.relatedTarget)) returnTo.current = event.relatedTarget as HTMLElement | null; holdStatusToast(true) }} onBlur={() => holdStatusToast(false)}>
        <span className="min-w-0 truncate">{toast.text}</span>
        {action && <button type="button" className="btn btn-ghost shrink-0" onClick={() => { dismissStatusToast(); action.run() }}>{action.label}</button>}
        <button type="button" className="icon-btn status-toast-close" aria-label={t('dismissNotice')} onClick={close}><X aria-hidden="true" className="size-4" /></button>
      </p>}
    </div>
  )
}
