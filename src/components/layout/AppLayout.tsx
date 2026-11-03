import { ThemePreviewBar } from '../../pages/Themes/ThemePreviewBar.tsx'
import { Outlet } from 'react-router-dom'
import { useLibrary } from '../../state/useLibrary.ts'
import { MobileNav } from './MobileNav.tsx'
import { Sidebar } from './Sidebar.tsx'
import { useCalendarAutoSync } from '../../services/calendarSync/useCalendarAutoSync.ts'
import { Link } from 'react-router-dom'

export function AppLayout() {
  const { workError } = useLibrary()
  const calendarError = useCalendarAutoSync()

  return (
    <div className="theme-app-layout flex h-dvh min-w-0 overflow-hidden text-neutral-900">
      <Sidebar />
      <main data-theme-slot="page" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        {workError && <p role="alert" className="mx-6 mt-4 text-sm text-red-500">{workError}</p>}
        {calendarError && <Link to="/settings/calendar?tab=google" role="status" className="mx-6 mt-2 text-xs text-neutral-500">Google Calendar · {calendarError}</Link>}
        <ThemePreviewBar />
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
