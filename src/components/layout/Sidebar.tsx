import { PanelLeft } from 'lucide-react'
import { BrandLogo } from '../common/BrandLogo.tsx'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { NavLink, useLocation } from 'react-router-dom'
import { IconView } from '../../constants/icons.ts'
import { ROUTES } from '../../constants/routes.ts'
import { chromeNavLabel, isRecordNav, CUSTOM_NAV, STORE_NAV, THEMES_NAV, TRASH_NAV, SETTINGS_NAV, visibleNav } from '../../constants/navigation.ts'
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

export function Sidebar({
  open = true,
  pinned = false,
  onToggle,
}: {
  open?: boolean
  pinned?: boolean
  onToggle: () => void
}) {
  const { pathname } = useLocation()
  const { settings, customPages } = useLibrary()
  const { t } = useI18n()
  const items = visibleNav(settings.nav)
  const core = items.filter((item) => !isRecordNav(item.id))
  const records = items.filter((item) => isRecordNav(item.id))

  return (
    <aside
      id="app-sidebar"
      data-theme-slot="sidebar"
      data-open={String(open)}
      data-pinned={String(pinned)}
      className="theme-sidebar peek-sidebar md:flex"
    >
      <div className="sidebar-brand">
        <BrandLogo className="px-2 text-neutral-900" />
        <button
          id="app-sidebar-toggle"
          type="button"
          className="peek-toggle icon-btn"
          aria-expanded={open}
          aria-pressed={pinned}
          aria-controls="app-sidebar"
          onClick={onToggle}
        >
          <PanelLeft className="size-4" strokeWidth={1.5} />
          <span className="sr-only">{open ? t('custom.closeMenu') : t('custom.openMenu')}</span>
        </button>
      </div>
      <nav className="mt-6 flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label={t('nav.main')}>
        {core.map((item) => (
          <NavRow key={item.id} id={item.id} to={item.to} end={item.end} icon={item.icon} label={chromeNavLabel(item.id, t, item.label)} color={item.color} />
        ))}
        {records.length > 0 ? <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">{t('nav.records')}</p> : null}
        {records.map((item) => (
          <NavRow key={item.id} id={item.id} to={item.to} end={item.end} icon={item.icon} label={chromeNavLabel(item.id, t, item.label)} color={item.color} />
        ))}
        <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">{t('nav.pages')}</p>
        {customPages.map((page) => (
          <NavLink key={page.id} data-theme-slot="sidebar-item" to={ROUTES.page(page.id)} className="nav-link min-w-0">
            <IconView name={page.icon} className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{page.name}</span>
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-line pt-3">
        <NavRow id="store" to={STORE_NAV.to} icon={STORE_NAV.icon} label={t('nav.store')} />
        <NavRow id="custom" to={THEMES_NAV.to} icon={THEMES_NAV.icon} label={t('nav.themes')} />
        <NavRow id="custom" to={CUSTOM_NAV.to} icon={CUSTOM_NAV.icon} label={t('nav.custom')} />
        <NavRow id="delete" to={TRASH_NAV.to} icon={TRASH_NAV.icon} label={t('nav.trash')} />
        <NavLink data-theme-slot="sidebar-item" to={SETTINGS_NAV.to} aria-current={pathname === THEMES_NAV.to ? false : 'page'} className={() => 'nav-link min-w-0'}>
          <ThemeIcon name="settings" fallback={SETTINGS_NAV.icon} strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 truncate">{t('nav.settings')}</span>
        </NavLink>
      </div>
    </aside>
  )
}
