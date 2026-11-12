import { Menu } from 'lucide-react'
import { Link, matchPath, useLocation } from 'react-router-dom'
import { CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV, mobileTabs, pageNav, visibleNav } from '../../constants/navigation.ts'
import { ROUTES } from '../../constants/routes.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { NotificationBell } from '../calendars/NotificationBell.tsx'

/** Phones: "more" sits top-left so all five bottom tabs stay free; the bell sits top-right on every page. */
export function MobileTopBar() {
  const { settings, customPages } = useLibrary()
  const { t } = useI18n()
  const { pathname } = useLocation()
  const { rest } = mobileTabs([...visibleNav(settings.nav), ...pageNav(customPages), CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV], settings.mobileBarIds)
  const activeRest = rest.find((item) => matchPath({ path: new URL(item.to, 'http://x').pathname, end: item.end ?? false }, pathname))
  const moreActive = pathname === ROUTES.more || Boolean(activeRest)

  return (
    <div className="mobile-topbar sticky top-0 z-20 flex shrink-0 items-center justify-between bg-surface px-2 pb-1 pt-[calc(env(safe-area-inset-top)+0.25rem)] md:hidden" data-mobile-topbar>
      <Link to={ROUTES.more} data-mobile-tab="more" className="icon-btn" aria-current={moreActive ? 'page' : undefined} aria-label={t('nav.more')}>
        <Menu className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </Link>
      {isSupabaseConfigured ? <NotificationBell align="right" /> : null}
    </div>
  )
}
