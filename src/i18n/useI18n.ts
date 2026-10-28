import { useCallback, useMemo } from 'react'
import { applyDocumentLocale, guestOrBrowserLocale, writeGuestLocale } from './storage.ts'
import { coerceLocale, type AppLocale } from './locale.ts'
import { createTranslator } from './translate.ts'
import { useLibrary } from '../state/useLibrary.ts'
import { useSession } from '../state/useSession.ts'

export function useI18n() {
  const { user } = useSession()
  const { settings, updateSettings } = useLibrary()
  const locale = user ? coerceLocale(settings.locale) : guestOrBrowserLocale()
  const t = useMemo(() => createTranslator(locale), [locale])

  const setLocale = useCallback((next: AppLocale) => {
    writeGuestLocale(next)
    applyDocumentLocale(next)
    if (user) updateSettings({ locale: next })
  }, [updateSettings, user])

  return { locale, t, setLocale }
}
