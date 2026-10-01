import { Outlet } from 'react-router-dom'
import { MobileNav } from './MobileNav.tsx'
import { Sidebar } from './Sidebar.tsx'

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-surface text-neutral-900">
      <Sidebar />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
