import { useEffect, useState } from 'react'
import { todayISO } from '../utils/date.ts'

/** Today's local date; re-renders at midnight and when a backgrounded tab returns on a new day. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const sync = () => setToday(todayISO())
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
    const timer = window.setTimeout(sync, midnight + 1000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [today])
  return today
}
