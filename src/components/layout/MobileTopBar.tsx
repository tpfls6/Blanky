import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, matchPath, useLocation } from 'react-router-dom'
import { CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV, mobileTabs, pageNav, visibleNav } from '../../constants/navigation.ts'
import { ROUTES } from '../../constants/routes.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { NotificationBell } from '../calendars/NotificationBell.tsx'

/** The phone ☰ "more" link; it reads as current on /more and on any page that is not in the bottom bar. */
export function MobileMoreLink({ className = 'mcal-ib', iconClassName = 'size-5.5', strokeWidth = 1.6 }: { className?: string; iconClassName?: string; strokeWidth?: number }) {
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
  const { pathname, search } = useLocation()
  // These lists draw their own one-line header with the menu and bell; a book's detail draws its ← · title · ⋮ bar
  // (also on a custom reading page, where the book opens as ?book=).
  if (pathname === ROUTES.schedule || pathname === ROUTES.memo || pathname === ROUTES.diary || matchPath(ROUTES.reading, pathname) || matchPath(`${ROUTES.reading}/:bookId`, pathname)
    || (matchPath('/pages/:pageId', pathname) && new URLSearchParams(search).has('book'))) return null

  return <MobileHeader />
}

export function MobileHeader({ children, search, tab = false }: { children?: ReactNode; search?: ReactNode; tab?: boolean }) {
  const layout = tab ? 'mobile-tab-header' : 'flex shrink-0 items-center gap-1 px-2 pb-1 pt-[calc(env(safe-area-inset-top)+0.25rem)]'
  return (
    <div className={`mobile-topbar sticky top-0 z-20 bg-surface md:hidden ${layout}`} data-mobile-topbar>
      {search ?? <>
        {tab ? <MobileMoreLink /> : <MobileMoreLink className="icon-btn mr-auto shrink-0" iconClassName="size-5" strokeWidth={1.5} />}
        {children}
        {isSupabaseConfigured ? <NotificationBell align="right" /> : null}
      </>}
    </div>
  )
}
