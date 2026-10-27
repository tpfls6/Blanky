import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { NavLink, useLocation } from 'react-router-dom'
import { iconByName } from '../../constants/icons.ts'
import { ROUTES } from '../../constants/routes.ts'
import { chromeNavLabel, CUSTOM_NAV, STORE_NAV, THEMES_NAV, TRASH_NAV, SETTINGS_NAV, visibleNav, type NavItem } from '../../constants/navigation.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'

export function MobileNav() {
  const { pathname } = useLocation()
  const { settings, recordTypes, customPages } = useLibrary()
  const { t } = useI18n()
  const pages: NavItem[] = customPages.map((page) => ({ id: page.id, label: page.name, to: ROUTES.page(page.id), icon: iconByName(page.icon) }))
  const items = [...visibleNav(settings.nav, recordTypes), ...pages, CUSTOM_NAV, STORE_NAV, THEMES_NAV, TRASH_NAV, SETTINGS_NAV]

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label={t('nav.mobile')}
    >
      <ul className="flex overflow-x-auto">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <li key={item.id} className="min-w-14 flex-1">
              <NavLink data-theme-slot="sidebar-item" to={item.to} end={item.end} aria-current={item.id === SETTINGS_NAV.id && pathname === THEMES_NAV.to ? false : 'page'} className={() => 'mobile-link'}>
                <span className="relative">
                  <ThemeIcon name={item.id} fallback={Icon} strokeWidth={1.5} aria-hidden="true" />
                  {item.color ? <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full" style={{ backgroundColor: item.color }} /> : null}
                </span>
                <span className="max-w-16 truncate">{chromeNavLabel(item.id, t, item.label)}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
