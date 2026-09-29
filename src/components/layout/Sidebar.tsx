import { NAV_ITEMS } from '../../constants/navigation.ts'
import { NavLinks } from './NavLinks.tsx'

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-neutral-200 px-4 py-8 md:flex">
      <p className="px-2 text-sm font-medium tracking-tight text-neutral-900">
        Blanky
      </p>
      <NavLinks items={NAV_ITEMS} className="mt-8 flex flex-col gap-0.5" />
    </aside>
  )
}
