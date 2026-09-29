import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PagePlaceholder } from './components/common/PagePlaceholder.tsx'
import { AppLayout } from './components/layout/AppLayout.tsx'
import { ROUTES } from './constants/routes.ts'
import { HistoryPage } from './pages/History/HistoryPage.tsx'
import { HomePage } from './pages/Home/HomePage.tsx'
import { JournalPage } from './pages/Journal/JournalPage.tsx'
import { ProjectPage } from './pages/Project/ProjectPage.tsx'
import { ReadingPage } from './pages/Reading/ReadingPage.tsx'
import { SchedulePage } from './pages/Schedule/SchedulePage.tsx'
import { TimelinePage } from './pages/Timeline/TimelinePage.tsx'

const CalendarPage = lazy(() =>
  import('./pages/Calendar/CalendarPage.tsx').then((module) => ({
    default: module.CalendarPage,
  })),
)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path={ROUTES.home} element={<HomePage />} />
          <Route path={ROUTES.schedule} element={<SchedulePage />} />
          <Route
            path={ROUTES.calendar}
            element={
              <Suspense fallback={<PagePlaceholder title="Calendar" />}>
                <CalendarPage />
              </Suspense>
            }
          />
          <Route path={ROUTES.timeline} element={<TimelinePage />} />
          <Route path={ROUTES.history} element={<HistoryPage />} />
          <Route path={ROUTES.journal} element={<JournalPage />} />
          <Route path={ROUTES.reading} element={<ReadingPage />} />
          <Route path={ROUTES.projects} element={<ProjectPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
