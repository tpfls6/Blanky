import { useEffect, useState } from 'react'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { isSupabaseConfigured } from '../supabase/client.ts'
import { getCalendarSyncClient, synchronizeCalendars } from './index.ts'
import { errorLine } from '../../pages/Settings/calendarPanel.ts'

export function useCalendarAutoSync() {
  const { user } = useSession()
  const userId = user?.id
  const { refreshWork } = useLibrary()
  const { locale } = useI18n()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return
    let stopped = false, running = false, dirty = false
    let debounce: ReturnType<typeof setTimeout>
    const check = async () => {
      if (stopped || running || document.visibilityState === 'hidden' || !navigator.onLine) return
      running = true
      try {
        const status = await getCalendarSyncClient().status()
        if (!stopped) setError('')
        if (stopped || status.status !== 'ready' || !status.autoSync) return
        const age = Date.now() - Date.parse(status.lastSync.at)
        if (!dirty && Number.isFinite(age) && age < 5 * 60_000) return
        dirty = false
        try { await synchronizeCalendars(userId, refreshWork) }
        catch (error) { dirty = true; throw error }
        if (!stopped) setError('')
      } catch (error) {
        if (!stopped) setError(errorLine(error, locale))
      } finally { running = false }
    }
    const resume = () => { void check() }
    const changed = () => {
      dirty = true
      clearTimeout(debounce)
      debounce = setTimeout(resume, 800)
    }
    void check()
    const timer = setInterval(resume, 60_000)
    window.addEventListener('blanky:work-saved', changed)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      stopped = true
      clearInterval(timer)
      clearTimeout(debounce)
      window.removeEventListener('blanky:work-saved', changed)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [userId, refreshWork, locale])
  return error
}
