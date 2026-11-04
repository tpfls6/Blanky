import { useSyncExternalStore } from 'react'
import { applyUpdate, hasUpdate, subscribeUpdate } from '../../pwa/register.ts'
import { useI18n } from '../../i18n/useI18n.ts'

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

// App-wide notices for the installed app: a waiting update and lost connection.
export function AppStatusNotice() {
  const { t } = useI18n()
  const update = useSyncExternalStore(subscribeUpdate, hasUpdate, () => false)
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  if (!update && online) return null
  return (
    <div className="app-status-notice" role="status">
      {!online && <p>{t('pwa.offline')}</p>}
      {update && <p>{t('pwa.updateReady')} <button type="button" className="btn btn-primary" onClick={applyUpdate}>{t('pwa.reload')}</button></p>}
    </div>
  )
}
