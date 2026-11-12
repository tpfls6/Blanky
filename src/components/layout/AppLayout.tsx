import { ThemePreviewBar } from '../../pages/Themes/ThemePreviewBar.tsx'
import { Outlet } from 'react-router-dom'
import { useLibrary } from '../../state/useLibrary.ts'
import { MobileNav } from './MobileNav.tsx'
import { MobileTopBar } from './MobileTopBar.tsx'
import { Sidebar } from './Sidebar.tsx'
import { useCalendarAutoSync } from '../../services/calendarSync/useCalendarAutoSync.ts'
import { Link } from 'react-router-dom'
import { Suspense, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useMobileViewport } from '../../hooks/useMobileViewport.ts'
import './mobile.css'

export function AppLayout() {
  const { workError } = useLibrary()
  const calendarError = useCalendarAutoSync()
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  const root = useRef<HTMLDivElement>(null)
  useMobileViewport(root)
  useLayoutEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) main.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return (
    <div ref={root} className="theme-app-layout flex h-dvh min-w-0 overflow-hidden text-neutral-900">
      <Sidebar />
      <main ref={main} data-theme-slot="page" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        <MobileTopBar />
        {workError && <p role="alert" className="mx-6 mt-4 text-sm text-red-500">{workError}</p>}
        {calendarError && <Link to="/settings/calendar?tab=google" role="status" className="mx-6 mt-2 text-xs text-neutral-500">Google Calendar · {calendarError}</Link>}
        <ThemePreviewBar />
        <Suspense fallback={<div className="mobile-page-loading p-5" role="status" aria-label="Loading"><span /><span /><span /></div>}><Outlet /></Suspense>
      </main>
      <MobileNav />
    </div>
  )
}
