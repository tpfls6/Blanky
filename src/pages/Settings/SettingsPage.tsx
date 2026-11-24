import { useEffect, useState, type ReactNode } from 'react'
import { PageTour } from '../../features/onboarding/Onboarding.tsx'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, Languages, RotateCcw, Sparkles, Tag, User, type LucideIcon } from 'lucide-react'
import { ROUTES } from '../../constants/routes.ts'
import { SETTINGS_COMPACT_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { AccountSection } from './AccountSection.tsx'
import { CategorySection } from './CategorySection.tsx'
import { ConfirmDialog, Group, Section, SettingsTabs } from './bits.tsx'
import { GeneralSection } from './GeneralSection.tsx'
import { GoogleCalendarSection } from './GoogleCalendarSection.tsx'
import { InputSection } from './InputSection.tsx'
import { PlanningPreferences } from './PlanningPreferences.tsx'
import { ScheduleSection } from './ScheduleSection.tsx'
import {
  SETTINGS_MENUS,
  settingsPath,
  resolveSettingsRoute,
  type AiTab,
  type CalendarTab,
  type SettingsMenuId,
} from './settingsNav.ts'
import '../More/more.css'

const MENU_ICONS = {
  general: Languages,
  account: User,
  ai: Sparkles,
  calendar: CalendarDays,
  categories: Tag,
} as const satisfies Record<SettingsMenuId, LucideIcon>

export function SettingsPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const [search] = useSearchParams()
  const { hash } = useLocation()
  // Below lg the settings read like the phone More flow: app bar, stacked sections, cards.
  const compact = useMediaQuery(SETTINGS_COMPACT_QUERY)
  const { user } = useSession()
  const { resetPreferences } = useLibrary()
  const [resetOpen, setResetOpen] = useState(false)
  const resolved = resolveSettingsRoute(params.section, search.get('tab'))
  const compactTab = compact && resolved.tab && resolved.tab !== 'planner' && resolved.tab !== 'schedule' ? resolved.tab : null
  // The compact layout shows every tab as a section, so a tab deep link scrolls to its section instead.
  useEffect(() => {
    if (!compactTab) return
    const frame = requestAnimationFrame(() => document.getElementById(`settings-section-${compactTab}`)?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [compactTab])

  if (!user) return null
  // The phone menu editor moved to More › Menu layout; old links still land there.
  if (compact && (params.section === 'navigation' || (resolved.menu === 'general' && hash === '#navigation'))) return <Navigate to={ROUTES.menuLayout} replace />
  if (resolved.redirect) return <Navigate to={resolved.redirect} replace />

  const menu = resolved.menu
  const sectionLabel = t(`settings.${menu}.label`)
  const sectionDescription = t(`settings.${menu}.description`)
  const setTab = (tab: string) => navigate(settingsPath(menu, tab), { replace: true })

  let body: ReactNode
  if (menu === 'general') {
    body = <GeneralSection />
  } else if (menu === 'account') {
    body = <AccountSection />
  } else if (menu === 'ai' && compact) {
    body = (
      <Section>
        <Group title={t('settings.ai.plannerTitle')} description={t('settings.ai.plannerHint')}>
          <PlanningPreferences />
        </Group>
        <div id="settings-section-input" className="scroll-mt-16"><InputSection /></div>
      </Section>
    )
  } else if (menu === 'ai') {
    const tab = (resolved.tab as AiTab) ?? 'planner'
    body = (
      <>
        <SettingsTabs
          label={sectionLabel}
          value={tab}
          tabs={[
            { id: 'planner', label: t('settings.ai.plannerTab') },
            { id: 'input', label: t('settings.ai.inputTab') },
          ]}
          onChange={setTab}
        />
        <div role="tabpanel" id={`settings-tab-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
          {tab === 'planner' ? (
            <Group title={t('settings.ai.plannerTitle')} description={t('settings.ai.plannerHint')}>
              <PlanningPreferences />
            </Group>
          ) : (
            <InputSection />
          )}
        </div>
      </>
    )
  } else if (menu === 'calendar' && compact) {
    body = (
      <Section>
        <Group id="settings-section-google" title={t('settings.calendar.googleTitle')} description={t('settings.calendar.googleHint')}>
          <GoogleCalendarSection />
        </Group>
        <ScheduleSection />
      </Section>
    )
  } else if (menu === 'calendar') {
    const tab = (resolved.tab as CalendarTab) ?? 'schedule'
    body = (
      <>
        <SettingsTabs
          label={sectionLabel}
          value={tab}
          tabs={[
            { id: 'schedule', label: t('settings.calendar.scheduleTab') },
            { id: 'google', label: t('settings.calendar.googleTab') },
          ]}
          onChange={setTab}
        />
        <div role="tabpanel" id={`settings-tab-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
          {tab === 'schedule' ? (
            <ScheduleSection />
          ) : (
            <Group title={t('settings.calendar.googleTitle')} description={t('settings.calendar.googleHint')}>
              <GoogleCalendarSection />
            </Group>
          )}
        </div>
      </>
    )
  } else {
    body = (
      <Group title={t('settings.categories.listTitle')} description={t('settings.categories.listHint')}>
        <CategorySection />
      </Group>
    )
  }

  return (
    <>
    {compact ? (
      <header className="more-bar settings-app-bar" data-tour="settings-nav">
        <Link to={ROUTES.more} className="more-ib" aria-label={t('nav.layout.back')}><ChevronLeft size={22} strokeWidth={1.6} aria-hidden="true" /></Link>
        <h1>{sectionLabel}</h1>
      </header>
    ) : null}
    <div className="settings-page mx-auto flex w-full max-w-5xl items-start gap-8 px-6 py-8 md:px-10 lg:gap-14">
      <nav data-tour={compact ? undefined : 'settings-nav'} aria-label={t('settings.menu')} className="sticky top-8 hidden w-48 shrink-0 overflow-hidden rounded-md border border-line bg-surface px-3 py-4 lg:block">
        <p className="px-3 pb-3 text-sm font-medium tracking-tight">{t('settings.title')}</p>
        <div className="flex flex-col gap-0.5">
          {SETTINGS_MENUS.map((id) => {
            const Icon = MENU_ICONS[id]
            return (
              <Link key={id} to={settingsPath(id)} className="settings-link" aria-current={menu === id ? 'page' : undefined}>
                <Icon strokeWidth={1.5} aria-hidden="true" />
                {t(`settings.${id}.label`)}
              </Link>
            )
          })}
        </div>
      </nav>
      <div className="settings-content min-w-0 flex-1 overflow-hidden rounded-md border border-line bg-surface px-6 py-6">
        <h1 className="text-2xl font-medium tracking-tight max-lg:hidden">{sectionLabel}</h1>
        <p className="mt-2 text-sm text-neutral-400 max-lg:hidden">{sectionDescription}</p>
        <PageTour page="settings" className="mt-6" />
        <div data-tour="settings-body" className="mt-8">{body}</div>
        {!compact || menu === 'general' ? (
          <div className="settings-reset mt-10 border-t border-line pt-6">
            <button type="button" className="text-sm text-neutral-400" onClick={() => setResetOpen(true)}>
              {compact ? <span className="more-ri"><RotateCcw size={18} strokeWidth={1.6} aria-hidden="true" /></span> : null}
              {compact ? <span className="more-rt">{t('settings.reset')}<small>{t('settings.resetBody')}</small></span> : t('settings.reset')}
            </button>
          </div>
        ) : null}
      </div>
      {resetOpen ? (
        <ConfirmDialog
          title={t('settings.resetTitle')}
          body={t('settings.resetBody')}
          confirmLabel={t('settings.resetConfirm')}
          onCancel={() => setResetOpen(false)}
          onConfirm={() => {
            resetPreferences()
            setResetOpen(false)
          }}
        />
      ) : null}
    </div>
    </>
  )
}
