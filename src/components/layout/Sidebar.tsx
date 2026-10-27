import { Plus } from 'lucide-react'
import { BrandLogo } from '../common/BrandLogo.tsx'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { Fragment } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { IconView } from '../../constants/icons.ts'
import { ROUTES } from '../../constants/routes.ts'
import { chromeNavLabel, isRecordNav, CUSTOM_NAV, STORE_NAV, THEMES_NAV, TRASH_NAV, SETTINGS_NAV, visibleNav } from '../../constants/navigation.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'

export function Sidebar() {
  const { pathname } = useLocation()
  const { settings, recordTypes, customPages, addUserPage, moveUserPage } = useLibrary()
  const { t } = useI18n()
  const navigate = useNavigate()
  const items = visibleNav(settings.nav, recordTypes)

  return (
    <aside data-theme-slot="sidebar" className="theme-sidebar sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
      <BrandLogo className="px-2 text-neutral-900" />
      <nav className="mt-6 flex min-w-0 flex-1 flex-col gap-0.5" aria-label={t('nav.main')}>
        {items.map((item, index) => {
          const Icon = item.icon
          const showRecords = isRecordNav(item.id) && !items.slice(0, index).some((entry) => isRecordNav(entry.id))
          return (
            <Fragment key={item.id}>
              {showRecords ? <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">{t('nav.records')}</p> : null}
              <NavLink data-theme-slot="sidebar-item" to={item.to} end={item.end} className="nav-link min-w-0">
                {item.color ? <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /> : null}
                <ThemeIcon name={item.id} fallback={Icon} strokeWidth={1.5} aria-hidden="true" />
                <span className="min-w-0 truncate">{chromeNavLabel(item.id, t, item.label)}</span>
              </NavLink>
            </Fragment>
          )
        })}
        <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">{t('nav.pages')}</p>
        {customPages.map((page, index) => (
          <div key={page.id} className="flex items-center gap-0.5">
            <NavLink data-theme-slot="sidebar-item" to={ROUTES.page(page.id)} className="nav-link min-w-0 flex-1">
              <IconView name={page.icon} className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{page.name}</span>
            </NavLink>
            <button type="button" aria-label={t('builder.moveUp')} className="icon-btn" disabled={index === 0} onClick={() => moveUserPage(page.id, -1)}>↑</button>
            <button type="button" aria-label={t('builder.moveDown')} className="icon-btn" disabled={index === customPages.length - 1} onClick={() => moveUserPage(page.id, 1)}>↓</button>
          </div>
        ))}
        <button
          type="button"
          className="nav-link min-w-0"
          onClick={() => {
            const id = addUserPage({ name: t('builder.newPage') })
            navigate(ROUTES.page(id))
          }}
        >
          <Plus className="size-4" strokeWidth={1.5} />
          <span className="min-w-0 truncate">{t('builder.newPage')}</span>
        </button>
      </nav>
      <div className="mt-auto border-t border-line pt-3">
        <NavLink data-theme-slot="sidebar-item" to={STORE_NAV.to} className="nav-link min-w-0"><ThemeIcon name="store" fallback={STORE_NAV.icon} strokeWidth={1.5} /><span className="min-w-0 truncate">{t('nav.store')}</span></NavLink>
        <NavLink data-theme-slot="sidebar-item" to={THEMES_NAV.to} className="nav-link min-w-0"><ThemeIcon name="custom" fallback={THEMES_NAV.icon} strokeWidth={1.5} /><span className="min-w-0 truncate">{t('nav.themes')}</span></NavLink>
        <NavLink data-theme-slot="sidebar-item" to={CUSTOM_NAV.to} className="nav-link min-w-0">
          <ThemeIcon name="custom" fallback={CUSTOM_NAV.icon} strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 truncate">{t('nav.custom')}</span>
        </NavLink>
        <NavLink data-theme-slot="sidebar-item" to={TRASH_NAV.to} className="nav-link min-w-0">
          <ThemeIcon name="delete" fallback={TRASH_NAV.icon} strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 truncate">{t('nav.trash')}</span>
        </NavLink>
        <NavLink data-theme-slot="sidebar-item" to={SETTINGS_NAV.to} aria-current={pathname === THEMES_NAV.to ? false : 'page'} className={() => 'nav-link min-w-0'}>
          <ThemeIcon name="settings" fallback={SETTINGS_NAV.icon} strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 truncate">{t('nav.settings')}</span>
        </NavLink>
      </div>
    </aside>
  )
}
