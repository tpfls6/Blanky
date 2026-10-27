import { ThemePreviewBar } from '../../pages/Themes/ThemePreviewBar.tsx'
import { Outlet, useLocation } from 'react-router-dom'
import { isCustomWorkspace } from '../../constants/routes.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { MobileNav } from './MobileNav.tsx'
import { Sidebar } from './Sidebar.tsx'
import { usePeekNav } from './usePeekNav.ts'

export function AppLayout() {
  const { pathname } = useLocation()
  const { workError } = useLibrary()
  const overlay = isCustomWorkspace(pathname)
  const peek = usePeekNav(overlay)

  return (
    <div className="theme-app-layout flex min-h-screen bg-surface text-neutral-900">
      <Sidebar overlay={overlay} open={peek.open} pinned={peek.pinned} onToggle={overlay ? peek.toggle : undefined} />
      <main data-theme-slot="page" className="flex min-h-screen min-w-0 flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        {workError && <p role="alert" className="mx-6 mt-4 text-sm text-red-500">{workError}</p>}
        <ThemePreviewBar />
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
