import { Menu } from 'lucide-react'
import { Link, matchPath, useLocation } from 'react-router-dom'
import { CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV, mobileTabs, pageNav, visibleNav } from '../../constants/navigation.ts'
import { ROUTES } from '../../constants/routes.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { NotificationBell } from '../calendars/NotificationBell.tsx'

/** The phone ☰ "more" link; it reads as current on /more and on any page that is not in the bottom bar. */
export function MobileMoreLink({ className, iconClassName, strokeWidth }: { className: string; iconClassName: string; strokeWidth: number }) {
  const { settings, customPages } = useLibrary()
  const { t } = useI18n()
  const { pathname } = useLocation()
  const { rest } = mobileTabs([...visibleNav(settings.nav), ...pageNav(customPages), CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV], settings.mobileBarIds)
  const activeRest = rest.find((item) => matchPath({ path: new URL(item.to, 'http://x').pathname, end: item.end ?? false }, pathname))
  const moreActive = pathname === ROUTES.more || Boolean(activeRest)
  return (
    <Link to={ROUTES.more} data-mobile-tab="more" className={className} aria-current={moreActive ? 'page' : undefined} aria-label={t('nav.more')}>
      <Menu className={iconClassName} strokeWidth={strokeWidth} aria-hidden="true" />
    </Link>
  )
}

/** Phones: "more" sits top-left so all five bottom tabs stay free; the bell sits top-right on every page. */
export function MobileTopBar() {
  const { pathname } = useLocation()
  const { customPages } = useLibrary()
  // The schedule, memo and diary screens draw their own one-line header (menu, title, search, bell);
  // so do custom diary pages (/pages/<id> with the diary template). Other custom pages keep this bar.
  const pageId = matchPath('/pages/:pageId', pathname)?.params.pageId
  const customDiary = Boolean(pageId) && customPages.some(page => page.id === pageId && page.template === 'diary')
  if (pathname === ROUTES.schedule || pathname === ROUTES.memo || pathname === ROUTES.diary || customDiary) return null

  return (
    <div className="mobile-topbar sticky top-0 z-20 flex shrink-0 items-center justify-between bg-surface px-2 pb-1 pt-[calc(env(safe-area-inset-top)+0.25rem)] md:hidden" data-mobile-topbar>
      <MobileMoreLink className="icon-btn" iconClassName="size-5" strokeWidth={1.5} />
      {isSupabaseConfigured ? <NotificationBell align="right" /> : null}
    </div>
  )
}
