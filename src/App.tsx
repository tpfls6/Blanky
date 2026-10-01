import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CaptureScreen } from './components/capture/CaptureScreen.tsx'
import { OrganizeScreen } from './components/capture/OrganizeScreen.tsx'
import { AppLayout } from './components/layout/AppLayout.tsx'
import { ROUTES } from './constants/routes.ts'
import { CalendarPage } from './pages/Calendar/CalendarPage.tsx'
import { CategoriesPage } from './pages/Categories/CategoriesPage.tsx'
import { HistoryPage } from './pages/History/HistoryPage.tsx'
import { TasksPage } from './pages/Tasks/TasksPage.tsx'
import { TimelinePage } from './pages/Timeline/TimelinePage.tsx'
import { TodayPage } from './pages/Today/TodayPage.tsx'
import { useWorkspace } from './state/useWorkspace.ts'
import { WorkspaceProvider } from './state/workspace.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <AppRoutes />
      </WorkspaceProvider>
    </BrowserRouter>
  )
}

function AppRoutes() {
  const { phase } = useWorkspace()
  if (phase === 'organizing') return <OrganizeScreen />
  if (phase === 'capture') return <CaptureScreen />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={ROUTES.home} element={<TodayPage />} />
        <Route path={ROUTES.calendar} element={<CalendarPage />} />
        <Route path={ROUTES.timeline} element={<TimelinePage />} />
        <Route path={ROUTES.tasks} element={<TasksPage />} />
        <Route path={ROUTES.history} element={<HistoryPage />} />
        <Route path={ROUTES.categories} element={<CategoriesPage />} />
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Route>
    </Routes>
  )
}
