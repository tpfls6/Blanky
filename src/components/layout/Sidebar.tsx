import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'
import { isRecordNav, CUSTOM_NAV, STORE_NAV, THEMES_NAV, SETTINGS_NAV, visibleNav } from '../../constants/navigation.ts'
import { useLibrary } from '../../state/useLibrary.ts'

export function Sidebar() {
  const { settings, recordTypes } = useLibrary()
  const items = visibleNav(settings.nav, recordTypes)

  return (
    <aside data-theme-slot="sidebar" className="theme-sidebar sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
      <p className="px-2 text-sm font-medium tracking-tight text-neutral-900">Blanky</p>
      <nav className="mt-6 flex flex-1 flex-col gap-0.5" aria-label="주요 메뉴">
        {items.map((item, index) => {
          const Icon = item.icon
          const showRecords = isRecordNav(item.id) && !items.slice(0, index).some((entry) => isRecordNav(entry.id))
          return (
            <Fragment key={item.id}>
              {showRecords ? <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">Records</p> : null}
              <NavLink data-theme-slot="sidebar-item" to={item.to} end={item.end} className="nav-link">
                {item.color ? <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /> : null}
                <ThemeIcon name={item.id} fallback={Icon} strokeWidth={1.5} aria-hidden="true" />
                {item.label}
              </NavLink>
            </Fragment>
          )
        })}
      </nav>
      <div className="mt-auto border-t border-line pt-3">
        <NavLink data-theme-slot="sidebar-item" to={STORE_NAV.to} className="nav-link"><ThemeIcon name="store" fallback={STORE_NAV.icon} strokeWidth={1.5} />스토어</NavLink>
        <NavLink data-theme-slot="sidebar-item" to={THEMES_NAV.to} className="nav-link"><ThemeIcon name="custom" fallback={THEMES_NAV.icon} strokeWidth={1.5} />내 테마</NavLink>
        <NavLink data-theme-slot="sidebar-item" to={CUSTOM_NAV.to} className="nav-link">
          <ThemeIcon name="custom" fallback={CUSTOM_NAV.icon} strokeWidth={1.5} aria-hidden="true" />
          {CUSTOM_NAV.label}
        </NavLink>
        <NavLink data-theme-slot="sidebar-item" to={SETTINGS_NAV.to} className="nav-link">
          <ThemeIcon name="settings" fallback={SETTINGS_NAV.icon} strokeWidth={1.5} aria-hidden="true" />
          {SETTINGS_NAV.label}
        </NavLink>
      </div>
    </aside>
  )
}
