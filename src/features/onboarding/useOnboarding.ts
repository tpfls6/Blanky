import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { onboardingKey } from '../../state/storage.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { deviceTourKey, finishTour, isTourDone, TOUR_PARAM, type PageTourId } from './tourState.ts'

export { TOUR_PARAM }

function readLocalDone(userId: string, page: PageTourId): boolean {
  try { return localStorage.getItem(deviceTourKey(onboardingKey(userId), page)) === '1' } catch { return false }
}

function writeLocalDone(userId: string, page: PageTourId) {
  try { localStorage.setItem(deviceTourKey(onboardingKey(userId), page), '1') } catch { /* the synced preference still records it */ }
}

/**
 * Completion lives in two places: the synced preference (follows the account to other devices)
 * and a per-user device key (survives a preference reset or an unreachable server).
 */
export function useOnboarding(page: PageTourId = 'home') {
  const { user } = useSession()
  const { settings, settingsReady, updateSettings } = useLibrary()
  const [params, setParams] = useSearchParams()
  const userId = user?.id ?? null
  const localDone = userId ? readLocalDone(userId, page) : true
  const synced = isTourDone(settings, page)
  const done = synced || localDone
  const replay = params.get(TOUR_PARAM) === '1'

  useEffect(() => {
    if (!userId || !settingsReady) return
    // A device that finished the tour before the server knew about it catches the account up.
    if (localDone && !synced) {
      const patch = finishTour(settings, page)
      if (patch) updateSettings(patch)
    }
  }, [userId, settingsReady, localDone, synced, settings, page, updateSettings])

  /** Marks completion only; used when a link inside the tour already navigates away. */
  const complete = useCallback(() => {
    if (userId) writeLocalDone(userId, page)
    const patch = finishTour(settings, page)
    if (patch) updateSettings(patch)
  }, [userId, settings, page, updateSettings])

  const close = useCallback(() => {
    complete()
    if (params.has(TOUR_PARAM)) {
      const next = new URLSearchParams(params)
      next.delete(TOUR_PARAM)
      setParams(next, { replace: true })
    }
  }, [complete, params, setParams])

  return { open: Boolean(userId) && (replay || (settingsReady && !done)), replay, complete, close }
}
