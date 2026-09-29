import { NavLink } from 'react-router-dom'
import type { NavItem } from '../../constants/navigation.ts'

type NavLinksProps = {
  items: readonly NavItem[]
  onNavigate?: () => void
  className?: string
  label?: string
}

export function NavLinks({
  items,
  onNavigate,
  className,
  label = '주요 메뉴',
}: NavLinksProps) {
  return (
    <nav className={className} aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon

        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                isActive
                  ? 'bg-neutral-100 text-neutral-900'
                  : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900',
              ].join(' ')
            }
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
