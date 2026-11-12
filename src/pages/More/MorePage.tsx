import { CalendarDays, ChevronRight, ListFilter, Repeat2, Settings, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { chromeNavLabel, CUSTOM_NAV, mobileTabs, pageNav, SETTINGS_NAV, STORE_NAV, TRASH_NAV, visibleNav, type NavItem } from '../../constants/navigation.ts'
import { ROUTES } from '../../constants/routes.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import './more.css'

export function MorePage() {
  const { settings, customPages } = useLibrary()
  const { user } = useSession()
  const { t } = useI18n()
  const pages = pageNav(customPages)
  const { rest } = mobileTabs([...visibleNav(settings.nav), ...pages, CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV], settings.mobileBarIds)
  const pageIds = new Set(pages.map((page) => page.id))
  const manageIds = new Set(['custom', 'store', 'trash', 'settings'])
  const groups = [
    { title: t('nav.records'), items: rest.filter((item) => !pageIds.has(item.id) && !manageIds.has(item.id)) },
    { title: t('nav.pages'), items: rest.filter((item) => pageIds.has(item.id)) },
    { title: t('nav.manage'), items: [{ id: 'mobile-navigation', label: t('settings.navigation.mobileEdit'), to: '/settings/general#navigation', icon: ListFilter }, ...rest.filter((item) => manageIds.has(item.id))] },
  ]
  const menuRow = (item: NavItem) => (
    <li key={item.id}>
      <Link to={item.to} className="more-menu-row" data-more-link={item.id}>
        <ThemeIcon name={item.id} fallback={item.icon} size={20} strokeWidth={1.5} aria-hidden="true" />
        <span>{chromeNavLabel(item.id, t, item.label)}</span>
        <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </li>
  )

  return (
    <div className="more-page" data-more-page>
      <header className="more-header">
        <h1>{t('nav.more')}</h1>
        <Link to="/settings/general" className="more-settings" aria-label={t('nav.settings')}><Settings size={22} strokeWidth={1.5} aria-hidden="true" /></Link>
      </header>
      <Link to="/settings/account" className="more-profile" data-more-link="account">
        <span className="more-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : <UserRound size={23} strokeWidth={1.5} aria-hidden="true" />}</span>
        <span className="more-profile-text"><strong>{user?.nickname || user?.name || 'Blanky'}</strong><span>{user?.email}</span></span>
        <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
      </Link>
      <div className="more-shortcuts">
        <Link to="/settings/calendar" data-more-link="calendar-settings"><CalendarDays size={20} strokeWidth={1.5} aria-hidden="true" /><span>{t('nav.calendarSettings')}</span></Link>
        <Link to={ROUTES.recurring} data-more-link="recurring"><Repeat2 size={20} strokeWidth={1.5} aria-hidden="true" /><span>{t('nav.recurring')}</span></Link>
      </div>
      {groups.filter((group) => group.items.length).map((group) => (
        <section className="more-group" key={group.title} aria-label={group.title}>
          <h2>{group.title}</h2>
          <ul>{group.items.map(menuRow)}</ul>
        </section>
      ))}
    </div>
  )
}
