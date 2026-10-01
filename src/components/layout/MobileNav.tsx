import { NavLink } from 'react-router-dom'
import { CATEGORY_NAV, NAV_ITEMS } from '../../constants/navigation.ts'

export function MobileNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-100 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="모바일 메뉴"
    >
      <ul className="grid grid-cols-6">
        {[...NAV_ITEMS, CATEGORY_NAV].map((item) => {
          const Icon = item.icon

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 text-[10px]',
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
      </ul>
    </nav>
  )
}
