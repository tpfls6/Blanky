import { Link } from 'react-router-dom'
import { PageTour } from '../../features/onboarding/Onboarding.tsx'
import { useI18n } from '../../i18n/useI18n.ts'

export function StoreTabs({ current }: { current: 'themes' | 'templates' }) {
  const { t } = useI18n()
  return (
    <>
      <div data-tour="store-tabs" className="mt-6 flex gap-3">
        <Link className={current === 'themes' ? 'chip chip-on' : 'chip'} to="/store">{t('templates.themes')}</Link>
        <Link className={current === 'templates' ? 'chip chip-on' : 'chip'} to="/store?tab=templates">{t('templates.templates')}</Link>
      </div>
      <PageTour page="store" className="mt-5" />
    </>
  )
}
