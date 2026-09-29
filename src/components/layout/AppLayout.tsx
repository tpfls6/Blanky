import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MobileDrawer } from './MobileDrawer.tsx'
import { MobileNav } from './MobileNav.tsx'
import { Sidebar } from './Sidebar.tsx'

export function AppLayout() {
  const location = useLocation()
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const drawerOpen = menuPath === location.pathname

  return (
    <div className="flex min-h-screen bg-white text-neutral-900">
      <Sidebar />
      <main className="min-h-screen min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>
      <MobileNav
        menuOpen={drawerOpen}
        onOpenMenu={() => setMenuPath(location.pathname)}
        onCloseMenu={() => setMenuPath(null)}
      />
      <MobileDrawer open={drawerOpen} onClose={() => setMenuPath(null)} />
    </div>
  )
}
