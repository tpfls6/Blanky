import { useI18n } from '../../i18n/useI18n.ts'
import { TemplateImport } from './PackageControls.tsx'

/** "Make a template" screen: templates come only from .blankytpl packages. */
export function MakeTemplatePage({ onCancel }: { onCancel: () => void }) {
  const { t } = useI18n()
  return (
    <section className="theme-page theme-customizer page-wizard">
      <header className="theme-editor-heading">
        <h1 className="truncate">{t('custom.makeTemplate')}</h1>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('custom.goBack')}</button>
        </div>
      </header>
      <TemplateImport list={false} />
    </section>
  )
}
