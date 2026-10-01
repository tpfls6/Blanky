import { CATEGORY_NAV, NAV_ITEMS } from '../../constants/navigation.ts'
import { NavLinks } from './NavLinks.tsx'

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-44 shrink-0 flex-col border-r border-neutral-100 px-3 py-6 md:flex">
      <p className="px-2 text-sm font-medium tracking-tight text-neutral-900">Blanky</p>
      <NavLinks items={NAV_ITEMS} className="mt-8 flex flex-col gap-0.5" />
      <NavLinks items={[CATEGORY_NAV]} className="mt-auto flex flex-col gap-0.5" />
    </aside>
  )
}
