import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { NavLink } from 'react-router-dom'
import { chromeNavLabel, CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV, mobileTabs, pageNav, visibleNav, type NavItem } from '../../constants/navigation.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'

/** Keep daily actions on the bar; other destinations live on the menu page opened from the top bar. */
export function MobileNav() {
  const { settings, customPages } = useLibrary()
  const { t } = useI18n()
  const items = [...visibleNav(settings.nav), ...pageNav(customPages), CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV]
  const { bar } = mobileTabs(items, settings.mobileBarIds)

  const link = (item: NavItem) => {
    const label = chromeNavLabel(item.id, t, item.label)
    return (
      <NavLink data-theme-slot="sidebar-item" data-mobile-tab={item.id} to={item.to} end={item.end} className="mobile-link" aria-label={label}>
        <span className="relative">
          <ThemeIcon name={item.id} fallback={item.icon} strokeWidth={1.5} aria-hidden="true" />
          {item.color ? <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full" style={{ backgroundColor: item.color }} /> : null}
        </span>
        <span className="max-w-full truncate" aria-hidden="true">{label}</span>
      </NavLink>
    )
  }

  return (
    <nav className="mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={t('nav.mobile')}>
      <ul className="flex">
        {bar.map((item) => <li key={item.id} className="min-w-0 flex-1">{link(item)}</li>)}
      </ul>
    </nav>
  )
}
