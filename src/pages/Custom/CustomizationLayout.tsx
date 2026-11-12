import { useState, type ReactNode } from 'react'
import { LayoutTemplate, Palette, PanelsTopLeft } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n.ts'
import { PageTour } from '../../features/onboarding/Onboarding.tsx'
import { TOUR_PARAM } from '../../features/onboarding/tourState.ts'

const TABS = [
  { id: 'templates', key: 'custom.tabTemplates', icon: LayoutTemplate },
  { id: 'themes', key: 'nav.themes', icon: Palette },
  { id: 'layout', key: 'custom.tabLayout', icon: PanelsTopLeft },
] as const

export function CustomizationLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = TABS.find(item => item.id === params.get('tab'))?.id ?? 'templates'
  // The tour walks every tab and ends on 레이아웃, so a visit that named a tab (내 테마 opens ?tab=themes)
  // keeps it and the tour waits for a visit without one; a replay link still starts it.
  const [namedTab] = useState(() => params.has('tab'))
  const target = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === 'templates') next.delete('tab')
    else next.set('tab', id)
    return next
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl items-start gap-8 px-4 py-6 md:px-6 lg:gap-14">
      <nav aria-label={t('nav.custom')} className="sticky top-8 hidden w-48 shrink-0 lg:block">
        <p className="px-3 pb-3 text-sm font-medium tracking-tight">{t('nav.custom')}</p>
        <div className="flex flex-col gap-0.5">
          {TABS.map(({ id, key, icon: Icon }) => (
            <Link key={id} to={{ pathname: '/custom', search: target(id).toString() }} className="settings-link" aria-current={tab === id ? 'page' : undefined}>
              <Icon strokeWidth={1.5} aria-hidden="true" />{t(key)}
            </Link>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        <label className="mb-6 block lg:hidden">
          <span className="sr-only">{t('nav.custom')}</span>
          <select className="field select w-full" value={tab} onChange={event => setParams(target(event.target.value))}>
            {TABS.map(({ id, key }) => <option key={id} value={id}>{t(key)}</option>)}
          </select>
        </label>
        {namedTab && params.get(TOUR_PARAM) !== '1' ? null : <PageTour page="custom" />}
        {children}
      </div>
    </div>
  )
}
