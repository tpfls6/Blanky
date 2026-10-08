import type { Account } from '../../state/useSession.ts'
import { libraryKey, USERS_KEY } from '../../state/storage.ts'

// Only transfer browser records after the corresponding server identity signs in.
export function retainLegacyLibrary(user: Account, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  try {
    if (storage.getItem(libraryKey(user.id))) return
    const accounts: Account[] = JSON.parse(storage.getItem(USERS_KEY) ?? '[]')
    const legacy = accounts.find(account => account.email.toLowerCase() === user.email.toLowerCase())
    if (!legacy || legacy.id === user.id) return
    const raw = storage.getItem(libraryKey(legacy.id))
    if (!raw) return
    const data = JSON.parse(raw)
    if (!Array.isArray(data.items)) return
    delete data.personalCalendar
    data.items = data.items.map((item: Record<string, unknown>) => {
      const next = { ...item }
      if (typeof next.calendarId === 'string' && next.calendarId.startsWith('local-personal:')) delete next.calendarId
      delete next.createdByUserId
      return next
    })
    storage.setItem(libraryKey(user.id), JSON.stringify(data))
  } catch { /* Invalid legacy data does not prevent real authentication. */ }
}

