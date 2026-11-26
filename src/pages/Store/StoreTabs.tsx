import { Link } from 'react-router-dom'
import { PageTour } from '../../features/onboarding/Onboarding.tsx'
import { useI18n } from '../../i18n/useI18n.ts'

/** [테마 | 템플릿] underline tabs, the same look as 커스텀's tabs. */
export function StoreTabs({ current }: { current: 'themes' | 'templates' }) {
  const { t } = useI18n()
  return (
    <>
      <nav data-tour="store-tabs" aria-label={t('nav.store')} className="store-tabs">
        <Link aria-current={current === 'themes' ? 'page' : undefined} to="/store">{t('templates.themes')}</Link>
        <Link aria-current={current === 'templates' ? 'page' : undefined} to="/store?tab=templates">{t('templates.templates')}</Link>
      </nav>
      <PageTour page="store" className="mt-4" />
    </>
  )
}
