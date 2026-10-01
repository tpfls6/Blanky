import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'
import { isRecordNav, CUSTOM_NAV, SETTINGS_NAV, visibleNav } from '../../constants/navigation.ts'
import { useLibrary } from '../../state/useLibrary.ts'

export function Sidebar() {
  const { settings, recordTypes } = useLibrary()
  const items = visibleNav(settings.nav, recordTypes)

  return (
    <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
      <p className="px-2 text-sm font-medium tracking-tight text-neutral-900">Blanky</p>
      <nav className="mt-6 flex flex-1 flex-col gap-0.5" aria-label="주요 메뉴">
        {items.map((item, index) => {
          const Icon = item.icon
          const showRecords = isRecordNav(item.id) && !items.slice(0, index).some((entry) => isRecordNav(entry.id))
          return (
            <Fragment key={item.id}>
              {showRecords ? <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">Records</p> : null}
              <NavLink to={item.to} end={item.end} className="nav-link">
                {item.color ? <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /> : null}
                <Icon strokeWidth={1.5} aria-hidden="true" />
                {item.label}
              </NavLink>
            </Fragment>
          )
        })}
      </nav>
      <div className="mt-auto border-t border-line pt-3">
        <NavLink to={CUSTOM_NAV.to} className="nav-link">
          <CUSTOM_NAV.icon strokeWidth={1.5} aria-hidden="true" />
          {CUSTOM_NAV.label}
        </NavLink>
        <NavLink to={SETTINGS_NAV.to} className="nav-link">
          <SETTINGS_NAV.icon strokeWidth={1.5} aria-hidden="true" />
          {SETTINGS_NAV.label}
        </NavLink>
      </div>
    </aside>
  )
}
