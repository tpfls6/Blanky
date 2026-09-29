import { Menu } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
} from '../../constants/navigation.ts'

type MobileNavProps = {
  menuOpen: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
}

export function MobileNav({ menuOpen, onOpenMenu, onCloseMenu }: MobileNavProps) {
  const location = useLocation()
  const moreActive = SECONDARY_NAV_ITEMS.some(
    (item) => item.to === location.pathname,
  )

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="모바일 메뉴"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onCloseMenu}
                className={({ isActive }) =>
                  [
                    'flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px]',
                    isActive ? 'text-neutral-900' : 'text-neutral-500',
                  ].join(' ')
                }
              >
                <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            className={[
              'flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[11px]',
              menuOpen || moreActive ? 'text-neutral-900' : 'text-neutral-500',
            ].join(' ')}
            aria-expanded={menuOpen}
            aria-controls="mobile-drawer"
            onClick={onOpenMenu}
          >
            <Menu className="size-4" strokeWidth={1.5} aria-hidden="true" />
            More
          </button>
        </li>
      </ul>
    </nav>
  )
}
