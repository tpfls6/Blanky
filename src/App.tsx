import { ConfirmProvider } from './state/ConfirmProvider.tsx'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout.tsx'
import { ROUTES } from './constants/routes.ts'
import { ForgotPage, LoginPage, SignupPage } from './pages/Auth/AuthPages.tsx'
import { DiaryPage } from './pages/Diary/DiaryPage.tsx'
import { ActivityPage } from './pages/Activity/ActivityPage.tsx'
import { HomePage } from './pages/Home/HomePage.tsx'
import { MemoPage } from './pages/Memo/MemoPage.tsx'
import { ReadingPage } from './pages/Reading/ReadingPage.tsx'
import { RecordPage } from './pages/Records/RecordPage.tsx'
import { SchedulePage } from './pages/Schedule/SchedulePage.tsx'
import { CustomPage } from './pages/Custom/CustomPage.tsx'
import { SettingsPage } from './pages/Settings/SettingsPage.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'
import { StorePage, ThemeDetailPage, MyThemesPage, ThemeEditorPage, CreatorPage } from './pages/Themes/ThemePages.tsx'
import { LibraryProvider } from './state/library.tsx'
import { SessionProvider } from './state/session.tsx'
import { useSession } from './state/useSession.ts'

function RequireAuth() {
  const { user, loading } = useSession()
  if (loading) return <p role="status" className="p-6 text-sm text-neutral-500">로그인을 확인하고 있어요…</p>
  if (!user) return <Navigate to={ROUTES.login} replace />
  return <Outlet />
}

function GuestOnly() {
  const { user, loading } = useSession()
  if (loading) return <p role="status" className="p-6 text-sm text-neutral-500">로그인을 확인하고 있어요…</p>
  if (user) return <Navigate to={ROUTES.home} replace />
  return <Outlet />
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.signup} element={<SignupPage />} />
        <Route path={ROUTES.forgot} element={<ForgotPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path={ROUTES.home} element={<HomePage />} />
          <Route path={ROUTES.activity} element={<ActivityPage />} />
          <Route path={ROUTES.schedule} element={<SchedulePage />} />
          <Route path={ROUTES.diary} element={<DiaryPage />} />
          <Route path={ROUTES.reading} element={<ReadingPage />} />
          <Route path="/reading/:bookId" element={<ReadingPage />} />
          <Route path={ROUTES.memo} element={<MemoPage />} />
          <Route path={ROUTES.custom} element={<CustomPage />} />
          <Route path={ROUTES.settings} element={<Navigate to="/settings/account" replace />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/store/themes/:themeId" element={<ThemeDetailPage />} />
          <Route path="/settings/themes" element={<MyThemesPage />} />
          <Route path="/customize/theme" element={<ThemeEditorPage />} />
          <Route path="/creator/:userId" element={<CreatorPage />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
          <Route path="/records/:typeId" element={<RecordPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <LibraryProvider>
          <ThemeProvider><ConfirmProvider><AppRoutes /></ConfirmProvider></ThemeProvider>
        </LibraryProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
