import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { NavLink, useLocation } from 'react-router-dom'
import { CUSTOM_NAV, STORE_NAV, THEMES_NAV, TRASH_NAV, SETTINGS_NAV, visibleNav } from '../../constants/navigation.ts'
import { useLibrary } from '../../state/useLibrary.ts'

export function MobileNav() {
  const { pathname } = useLocation()
  const { settings, recordTypes } = useLibrary()
  const items = [...visibleNav(settings.nav, recordTypes), CUSTOM_NAV, STORE_NAV, THEMES_NAV, TRASH_NAV, SETTINGS_NAV]

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="모바일 메뉴"
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
                <span className="max-w-16 truncate">{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
