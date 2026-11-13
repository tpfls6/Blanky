import { useEffect, useState } from 'react'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { isSupabaseConfigured } from '../supabase/client.ts'
import { getCalendarSyncClient, synchronizeCalendars } from './index.ts'
import { errorLine, syncProblem } from '../../pages/Settings/calendarPanel.ts'

const AUTO_SYNC_AGE_MS = 5 * 60_000
/** Wait after the 1st..5th consecutive failure. Focus and saves do not skip the wait. */
export const CLIENT_RETRY_DELAYS_MS = [60_000, 2 * 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000] as const

export function retryDelay(failures: number): number {
  return CLIENT_RETRY_DELAYS_MS[Math.min(Math.max(failures, 1), CLIENT_RETRY_DELAYS_MS.length) - 1]
}

export function useCalendarAutoSync() {
  const { user } = useSession()
  const userId = user?.id
  const { refreshWork } = useLibrary()
  const { locale } = useI18n()
  const [problem, setProblem] = useState('')
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return
    let stopped = false, running = false, dirty = false
    let statusFailures = 0, statusRetryAt = 0, syncFailures = 0, syncRetryAt = 0
    let debounce: ReturnType<typeof setTimeout>
    const show = (line: string) => { if (!stopped) setProblem(line) }
    const check = async () => {
      if (stopped || running || document.visibilityState === 'hidden' || !navigator.onLine) return
      if (Date.now() < statusRetryAt) return
      running = true
      try {
        let status
        try {
          status = await getCalendarSyncClient().status()
        } catch (error) {
          statusFailures += 1
          statusRetryAt = Date.now() + retryDelay(statusFailures)
          show(errorLine(error, locale))
          return
        }
        statusFailures = 0
        statusRetryAt = 0
        // What the server recorded for the last sync; the settings screen reads the same value.
        show(syncProblem(status, locale)?.line ?? '')
        if (stopped || status.status !== 'ready' || !status.autoSync) return
        if (Date.now() < syncRetryAt) return
        const age = Date.now() - Date.parse(status.lastSync.at)
        if (!dirty && Number.isFinite(age) && age < AUTO_SYNC_AGE_MS) return
        dirty = false
        try {
          const report = await synchronizeCalendars(userId, refreshWork)
          syncFailures = 0
          syncRetryAt = 0
          if (report.lastSync) show(syncProblem({ ...status, lastSync: report.lastSync }, locale)?.line ?? '')
        } catch (error) {
          // Keep the pending local change, but back off so one error is not resent every minute.
          dirty = true
          syncFailures += 1
          syncRetryAt = Date.now() + retryDelay(syncFailures)
          show(errorLine(error, locale))
        }
      } finally { running = false }
    }
    const resume = () => { void check() }
    const changed = () => {
      dirty = true
      clearTimeout(debounce)
      debounce = setTimeout(resume, 800)
    }
    const synced = () => {
      // A sync finished elsewhere (e.g. "Sync now"); clear backoff and re-read the recorded result.
      syncFailures = 0
      syncRetryAt = 0
      statusRetryAt = 0
      resume()
    }
    void check()
    const timer = setInterval(resume, 60_000)
    window.addEventListener('blanky:work-saved', changed)
    window.addEventListener('blanky:calendar-synced', synced)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      stopped = true
      clearInterval(timer)
      clearTimeout(debounce)
      window.removeEventListener('blanky:work-saved', changed)
      window.removeEventListener('blanky:calendar-synced', synced)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [userId, refreshWork, locale])
  return problem
}
