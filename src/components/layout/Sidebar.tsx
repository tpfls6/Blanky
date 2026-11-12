import { Fragment } from 'react'
import { BrandLogo } from '../common/BrandLogo.tsx'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { NavLink, useLocation } from 'react-router-dom'
import { CalendarList } from '../calendars/CalendarList.tsx'
import { NotificationBell } from '../calendars/NotificationBell.tsx'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { chromeNavLabel, isRecordNav, CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV, pageNav, visibleNav } from '../../constants/navigation.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'

function NavRow({
  id,
  to,
  end,
  icon: Icon,
  label,
  color,
}: {
  id: string
  to: string
  end?: boolean
  icon: typeof STORE_NAV.icon
  label: string
  color?: string
}) {
  return (
    <NavLink data-theme-slot="sidebar-item" to={to} end={end} className="nav-link min-w-0">
      {color ? <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} /> : null}
      <ThemeIcon name={id} fallback={Icon} strokeWidth={1.5} aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  const { settings, customPages } = useLibrary()
  const { t } = useI18n()
  const items = visibleNav(settings.nav)
  const core = items.filter((item) => !isRecordNav(item.id))
  const records = items.filter((item) => isRecordNav(item.id))
  const pages = pageNav(customPages)
  const { pathname } = useLocation()
  const onSchedule = pathname.startsWith('/schedule')

  return (
    <aside
      id="app-sidebar"
      data-theme-slot="sidebar"
      className="theme-sidebar hidden h-dvh w-52 shrink-0 flex-col overflow-hidden border-r border-line px-3 py-5 md:flex"
    >
      <div className="sidebar-brand flex items-center justify-between gap-1">
        <BrandLogo className="px-2 text-neutral-900" />
        {isSupabaseConfigured ? <NotificationBell /> : null}
      </div>
      <nav className="mt-6 flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label={t('nav.main')}>
        {core.map((item) => {
          const row = <NavRow id={item.id} to={item.to} end={item.end} icon={item.icon} label={chromeNavLabel(item.id, t, item.label)} color={item.color} />
          if (item.id === 'schedule' && onSchedule) {
            return (
              <div key={item.id} className="sidebar-nav-group" data-nav-group="schedule">
                {row}
                {isSupabaseConfigured ? <CalendarList nested /> : null}
              </div>
            )
          }
          return <Fragment key={item.id}>{row}</Fragment>
        })}
        {pages.length > 0 ? <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">{t('nav.pages')}</p> : null}
        {pages.map((item) => (
          <NavRow key={item.id} id={item.id} to={item.to} icon={item.icon} label={item.label} />
        ))}
        {records.length > 0 ? <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">{t('nav.records')}</p> : null}
        {records.map((item) => (
          <NavRow key={item.id} id={item.id} to={item.to} end={item.end} icon={item.icon} label={chromeNavLabel(item.id, t, item.label)} color={item.color} />
        ))}
      </nav>
      <div className="mt-auto border-t border-line pt-3">
        <NavRow id="store" to={STORE_NAV.to} icon={STORE_NAV.icon} label={t('nav.store')} />
        <NavRow id="custom" to={CUSTOM_NAV.to} icon={CUSTOM_NAV.icon} label={t('nav.custom')} />
        <NavRow id="delete" to={TRASH_NAV.to} icon={TRASH_NAV.icon} label={t('nav.trash')} />
        <NavLink data-theme-slot="sidebar-item" to={SETTINGS_NAV.to} className="nav-link min-w-0">
          <ThemeIcon name="settings" fallback={SETTINGS_NAV.icon} strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 truncate">{t('nav.settings')}</span>
        </NavLink>
      </div>
    </aside>
  )
}
