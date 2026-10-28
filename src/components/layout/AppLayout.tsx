import { ThemePreviewBar } from '../../pages/Themes/ThemePreviewBar.tsx'
import { Outlet } from 'react-router-dom'
import { useLibrary } from '../../state/useLibrary.ts'
import { MobileNav } from './MobileNav.tsx'
import { Sidebar } from './Sidebar.tsx'
import { usePeekNav } from './usePeekNav.ts'

export function AppLayout() {
  const { workError } = useLibrary()
  const peek = usePeekNav()

  return (
    <div className="theme-app-layout flex h-dvh min-w-0 overflow-hidden text-neutral-900">
      <Sidebar open={peek.open} pinned={peek.pinned} onToggle={peek.toggle} />
      {peek.pinned ? <div className="hidden w-52 shrink-0 md:block" aria-hidden="true" /> : null}
      <main data-theme-slot="page" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        {workError && <p role="alert" className="mx-6 mt-4 text-sm text-red-500">{workError}</p>}
        <ThemePreviewBar />
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
