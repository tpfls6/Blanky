import { RouteLoadBoundary } from './components/common/RouteLoadBoundary.tsx'
import { lazy, Suspense } from 'react'
import { ConfirmProvider } from './state/ConfirmProvider.tsx'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout.tsx'
import { ROUTES } from './constants/routes.ts'
const ForgotPage=lazy(()=>import('./pages/Auth/AuthPages.tsx').then(module=>({default:module.ForgotPage})))
const LoginPage=lazy(()=>import('./pages/Auth/AuthPages.tsx').then(module=>({default:module.LoginPage})))
const SignupPage=lazy(()=>import('./pages/Auth/AuthPages.tsx').then(module=>({default:module.SignupPage})))
const DiaryPage = lazy(()=>import('./pages/Diary/DiaryPage.tsx').then(module=>({default:module.DiaryPage})))
const ActivityPage = lazy(()=>import('./pages/Activity/ActivityPage.tsx').then(module=>({default:module.ActivityPage})))
const HomePage = lazy(()=>import('./pages/Home/HomePage.tsx').then(module=>({default:module.HomePage})))
const MemoPage = lazy(()=>import('./pages/Memo/MemoPage.tsx').then(module=>({default:module.MemoPage})))
const ReadingPage = lazy(()=>import('./pages/Reading/ReadingPage.tsx').then(module=>({default:module.ReadingPage})))
const RecordPage = lazy(()=>import('./pages/Records/RecordPage.tsx').then(module=>({default:module.RecordPage})))
const SchedulePage = lazy(()=>import('./pages/Schedule/SchedulePage.tsx').then(module=>({default:module.SchedulePage})))
const CustomPage = lazy(()=>import('./pages/Custom/CustomPage.tsx').then(module=>({default:module.CustomPage})))
const UserPage = lazy(()=>import('./pages/Pages/UserPage.tsx').then(module=>({default:module.UserPage})))
const TrashPage = lazy(()=>import('./pages/Trash/TrashPage.tsx').then(module=>({default:module.TrashPage})))
const SettingsPage = lazy(()=>import('./pages/Settings/SettingsPage.tsx').then(module=>({default:module.SettingsPage})))
import { ThemeProvider } from './theme/ThemeProvider.tsx'
const StorePage=lazy(()=>import('./pages/Themes/ThemePages.tsx').then(module=>({default:module.StorePage})))
const ThemeDetailPage=lazy(()=>import('./pages/Themes/ThemePages.tsx').then(module=>({default:module.ThemeDetailPage})))
const MyThemesPage=lazy(()=>import('./pages/Themes/ThemePages.tsx').then(module=>({default:module.MyThemesPage})))
const ThemeEditorPage=lazy(()=>import('./pages/Themes/ThemePages.tsx').then(module=>({default:module.ThemeEditorPage})))
const CreatorPage=lazy(()=>import('./pages/Themes/ThemePages.tsx').then(module=>({default:module.CreatorPage})))
import { LibraryProvider } from './state/library.tsx'
import { SessionProvider } from './state/session.tsx'
import { useI18n } from './i18n/useI18n.ts'
import { useSession } from './state/useSession.ts'

function RequireAuth() {
  const { user, loading } = useSession()
  const { t } = useI18n()
  if (loading) return <p role="status" className="p-6 text-sm text-neutral-500">{t('checkingLogin')}</p>
  if (!user) return <Navigate to={ROUTES.login} replace />
  return <Outlet />
}

function GuestOnly() {
  const { user, loading } = useSession()
  const { t } = useI18n()
  if (loading) return <p role="status" className="p-6 text-sm text-neutral-500">{t('checkingLogin')}</p>
  if (user) return <Navigate to={ROUTES.home} replace />
  return <Outlet />
}

function AppLoading() {
  const { t } = useI18n()
  return <p role="status" className="p-6 text-sm text-neutral-500">{t('loading')}</p>
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
          <Route path="/pages/:pageId" element={<UserPage />} />
          <Route path={ROUTES.trash} element={<TrashPage />} />
          <Route path={ROUTES.settings} element={<Navigate to="/settings/general" replace />} />
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
          <ThemeProvider><ConfirmProvider><RouteLoadBoundary><Suspense fallback={<AppLoading />}><AppRoutes /></Suspense></RouteLoadBoundary></ConfirmProvider></ThemeProvider>
        </LibraryProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
