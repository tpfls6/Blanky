import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { Ellipsis, X } from 'lucide-react'
import { useRef } from 'react'
import { matchPath, NavLink, useLocation } from 'react-router-dom'
import { chromeNavLabel, CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV, pageNav, visibleNav, type NavItem } from '../../constants/navigation.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'

// The bar shows the first few menus; the rest open in a sheet so nothing hides off-screen.
const BAR_SIZE = 4

export function MobileNav() {
  const { settings, customPages } = useLibrary()
  const { t } = useI18n()
  const { pathname } = useLocation()
  const sheet = useRef<HTMLDialogElement>(null)
  const items = [...visibleNav(settings.nav), ...pageNav(customPages), CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV]
  const overflow = items.length > BAR_SIZE + 1
  const bar = overflow ? items.slice(0, BAR_SIZE) : items
  const rest = overflow ? items.slice(BAR_SIZE) : []
  const restActive = rest.some((item) => matchPath({ path: new URL(item.to, 'http://x').pathname, end: item.end ?? false }, pathname))

  const link = (item: NavItem, className: string) => {
    const Icon = item.icon
    return (
      <NavLink data-theme-slot="sidebar-item" to={item.to} end={item.end} className={className}>
        <span className="relative">
          <ThemeIcon name={item.id} fallback={Icon} strokeWidth={1.5} aria-hidden="true" />
          {item.color ? <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full" style={{ backgroundColor: item.color }} /> : null}
        </span>
        <span className="max-w-full truncate">{chromeNavLabel(item.id, t, item.label)}</span>
      </NavLink>
    )
  }

  return (
    <nav
      className="mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label={t('nav.mobile')}
    >
      <ul className="flex">
        {bar.map((item) => <li key={item.id} className="min-w-0 flex-1">{link(item, 'mobile-link')}</li>)}
        {overflow && (
          <li className="min-w-0 flex-1">
            <button type="button" className="mobile-link w-full" aria-haspopup="dialog" aria-current={restActive ? 'page' : undefined} onClick={() => sheet.current?.showModal()}>
              <Ellipsis strokeWidth={1.5} aria-hidden="true" />
              <span>{t('nav.more')}</span>
            </button>
          </li>
        )}
      </ul>
      {overflow && (
        <dialog ref={sheet} data-theme-slot="modal" className="mobile-nav-sheet" aria-label={t('nav.allMenus')} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
          <form method="dialog" className="mobile-nav-sheet-head">
            <h2>{t('nav.allMenus')}</h2>
            <button className="btn btn-ghost" aria-label={t('close')}><X aria-hidden="true" strokeWidth={1.5} /></button>
          </form>
          {/* Close on any menu tap, including the page already open. */}
          <ul onClick={(event) => { if ((event.target as Element).closest('a')) event.currentTarget.closest('dialog')?.close() }}>
            {rest.map((item) => <li key={item.id}>{link(item, 'mobile-sheet-link')}</li>)}
          </ul>
        </dialog>
      )}
    </nav>
  )
}
