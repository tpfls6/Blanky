import { CalendarDays, ChevronRight, CircleHelp, CirclePlay, Languages, PanelBottom, Palette, Repeat2, SlidersHorizontal, Sparkles, Store, Tag, Trash2, UserRound, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { chromeNavLabel } from '../../constants/navigation.ts'
import { ROUTES } from '../../constants/routes.ts'
import { PAGE_TOURS, replayHref } from '../../features/onboarding/tourState.ts'
import { listRecurring } from '../../features/schedule/recurringList.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { getCalendarSyncClient } from '../../services/calendarSync/index.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { useTheme } from '../../theme/context.ts'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { todayISO } from '../../utils/date.ts'
import { settingsPath } from '../Settings/settingsNav.ts'
import { MANAGE_IDS, menuZones } from './menuZones.ts'
import './more.css'

type GoogleState = 'connected' | 'disconnected' | 'needsReauth'

/** Google Calendar status for the calendar row; no value is shown until the server answers. */
function useGoogleState(): GoogleState | undefined {
  const [state, setState] = useState<GoogleState>()
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let stopped = false
    getCalendarSyncClient().status().then((view) => {
      if (stopped) return
      if (view.status === 'ready' || view.status === 'connected') setState('connected')
      else if (view.status === 'needs_reauth') setState('needsReauth')
      else if (view.status === 'disconnected') setState('disconnected')
    }).catch(() => {})
    return () => { stopped = true }
  }, [])
  return state
}

/** One 54px row of a More group card: icon tile, label (with an optional hint), value, chevron. */
function MoreRow({ to, id, icon, label, hint, value, accent, chevron = true }: {
  to: string
  id: string
  icon: ReactNode
  label: string
  hint?: string
  value?: string
  accent?: boolean
  chevron?: boolean
}) {
  return (
    <Link to={to} className="more-row more-row-ic" data-more-link={id}>
      <span className="more-ri">{icon}</span>
      <span className="more-rt">{label}{hint ? <small>{hint}</small> : null}</span>
      {value ? <span className={accent ? 'more-rv more-rv-on' : 'more-rv'}>{value}</span> : null}
      {chevron ? <ChevronRight className="more-chev" size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
    </Link>
  )
}

const rowIcon = (Icon: LucideIcon) => <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
const navIcon = (id: string, Icon: LucideIcon) => <ThemeIcon name={id} fallback={Icon} size={18} strokeWidth={1.6} aria-hidden="true" />

export function MorePage() {
  const { settings, customPages, categories, items: work, trash } = useLibrary()
  const themes = useTheme()
  const { user } = useSession()
  const { t, locale } = useI18n()
  const google = useGoogleState()
  const [toursOpen, setToursOpen] = useState(false)
  const { zones, items } = menuZones(settings.nav, customPages, settings.mobileBarIds)
  // Shortcut tiles: records and pages the bottom bar leaves out; management menus stay in the cards below.
  const tiles = zones.more.filter((id) => !MANAGE_IDS.has(id)).flatMap((id) => items.filter((item) => item.id === id))
  const general = `${t(locale === 'ko' ? 'settings.general.korean' : 'settings.general.english')} · ${t(`settings.appearance.${settings.theme}`)}`
  const layout = zones.hidden.length
    ? t('nav.menuLayoutSummaryHidden', { bar: zones.bar.length, hidden: zones.hidden.length })
    : t('nav.menuLayoutSummary', { bar: zones.bar.length })
  const topCategories = categories.filter((category) => category.parentId === null).length
  // Values from state already loaded for the app: active recurring series, trash rows, the applied custom theme.
  const recurring = useMemo(() => listRecurring(work, todayISO(), 'active').length, [work])
  const themeName = themes.themes.find((theme) => theme.id === themes.active)?.name
  const initial = (user?.nickname || user?.name || user?.email || '').trim().charAt(0).toUpperCase()

  return (
    <div className="more-page" data-more-page>
      {/* The shared phone top bar (☰ · bell) stays on More; the title is for screen readers only. */}
      <h1 className="sr-only">{t('nav.more')}</h1>
      <div className="more-body">
        <Link to="/settings/account" className="more-profile" data-more-link="account">
          <span className="more-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : initial || <UserRound size={23} strokeWidth={1.5} aria-hidden="true" />}</span>
          <span className="more-profile-text"><strong>{user?.nickname || user?.name || 'Blanky'}</strong><span>{user?.email}</span></span>
          <ChevronRight className="more-chev" size={16} strokeWidth={1.5} aria-hidden="true" />
        </Link>

        <section aria-labelledby="more-shortcuts">
          <h2 className="more-label" id="more-shortcuts">{t('nav.moreShortcuts')}<small>{t('nav.moreShortcutsHint')}</small></h2>
          <div className="more-tiles">
            {tiles.length ? tiles.map((item) => (
              <Link key={item.id} to={item.to} data-more-link={item.id}>
                <ThemeIcon name={item.id} fallback={item.icon} size={22} strokeWidth={1.6} aria-hidden="true" />
                <span>{chromeNavLabel(item.id, t, item.label)}</span>
              </Link>
            )) : <Link to={ROUTES.menuLayout} className="more-tiles-empty" data-more-link="shortcuts-empty">{t('nav.moreShortcutsEmpty')}</Link>}
          </div>
        </section>

        <section aria-labelledby="more-settings">
          <h2 className="more-label" id="more-settings">{t('nav.settings')}</h2>
          <div className="more-card">
            <MoreRow to={settingsPath('general')} id="general" icon={rowIcon(Languages)} label={t('settings.general.label')} hint={t('nav.moreGeneralHint')} value={general} />
            <MoreRow to={settingsPath('ai')} id="ai" icon={rowIcon(Sparkles)} label={t('settings.ai.label')} hint={t('nav.moreAiHint')} />
            <MoreRow to={settingsPath('calendar')} id="calendar-settings" icon={rowIcon(CalendarDays)} label={t('settings.calendar.label')} hint={t('nav.moreCalendarHint')} value={google ? t(`calendar.${google}`) : undefined} accent={google === 'connected'} />
            <MoreRow to={settingsPath('categories')} id="categories" icon={rowIcon(Tag)} label={t('settings.categories.label')} value={t('nav.moreCount', { count: topCategories })} />
          </div>
        </section>

        <section aria-labelledby="more-data">
          <h2 className="more-label" id="more-data">{t('nav.moreData')}</h2>
          <div className="more-card">
            <MoreRow to={ROUTES.recurring} id="recurring" icon={rowIcon(Repeat2)} label={t('nav.recurring')} value={recurring ? t('nav.moreCount', { count: recurring }) : undefined} />
            <MoreRow to={ROUTES.trash} id="trash" icon={navIcon('trash', Trash2)} label={t('nav.trash')} value={trash.length ? t('nav.moreCount', { count: trash.length }) : undefined} />
          </div>
        </section>

        <section aria-labelledby="more-decorate">
          <h2 className="more-label" id="more-decorate">{t('nav.moreDecorate')}</h2>
          <div className="more-card">
            <MoreRow to={ROUTES.menuLayout} id="mobile-navigation" icon={rowIcon(PanelBottom)} label={t('nav.menuLayout')} hint={t('nav.menuLayoutHint')} value={layout} />
            <MoreRow to={ROUTES.myThemes} id="themes" icon={navIcon('themes', Palette)} label={t('nav.themes')} value={themeName} />
            <MoreRow to={ROUTES.custom} id="custom" icon={navIcon('custom', SlidersHorizontal)} label={t('nav.custom')} hint={t('nav.moreCustomHint')} />
            <MoreRow to={ROUTES.store} id="store" icon={navIcon('store', Store)} label={t('nav.store')} hint={t('nav.moreStoreHint')} />
          </div>
        </section>

        <section aria-labelledby="more-help">
          <h2 className="more-label" id="more-help">{t('nav.moreHelp')}</h2>
          <div className="more-card">
            <MoreRow to={ROUTES.guide} id="guide" icon={rowIcon(CircleHelp)} label={t('nav.moreGuide')} />
            <MoreRow to={replayHref('home')} id="replay-tour" icon={rowIcon(CirclePlay)} label={t('settings.general.replayTour')} chevron={false} />
            <button type="button" className="more-row more-row-ic" data-more-link="replay-pages" aria-expanded={toursOpen} aria-controls="more-page-tours" onClick={() => setToursOpen((open) => !open)}>
              <span className="more-ri">{rowIcon(CirclePlay)}</span>
              <span className="more-rt">{t('settings.general.replayPages')}</span>
              <ChevronRight className="more-chev more-chev-toggle" size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <div className="more-tours" id="more-page-tours" hidden={!toursOpen}>
              {PAGE_TOURS.map((page) => <Link key={page} to={replayHref(page)} className="chip">{t(`nav.${page}`)}</Link>)}
            </div>
          </div>
        </section>
        <p className="more-foot">Blanky</p>
      </div>
    </div>
  )
}
