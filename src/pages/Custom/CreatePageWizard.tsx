import { useState } from 'react'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import { initialFieldLabels, type PageTemplateKind } from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { FieldLabelEditor } from './FieldLabelEditor.tsx'
import { TemplateImport } from './PackageControls.tsx'
import { TemplatePreview } from './TemplatePreview.tsx'

type PageDraft = { template: PageTemplateKind; name: string; icon: string; description: string; fieldLabels: Record<string, string> }

/** "Make a template" screen: imports a .blankytpl package. */
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

/** Edits an existing template page through name, field labels and a live preview. */
export function CreatePageWizard({
  page,
  onCancel,
  onCreate,
}: {
  page: PageDraft & { name: string }
  onCancel: () => void
  onCreate: (input: PageDraft) => void
}) {
  const { t, locale } = useI18n()
  const template = page.template
  const firstStep = 1
  const [step, setStep] = useState(firstStep)
  const [name, setName] = useState(page.name)
  const [icon, setIcon] = useState(page.icon)
  const [description, setDescription] = useState(page.description ?? '')
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({ ...initialFieldLabels(template, locale), ...page.fieldLabels })
  const previewName = name.trim() || t(`custom.kind.${template}`)
  const finish = () => onCreate({ template, name: previewName, icon, description: description.trim(), fieldLabels })
  const stepTitle = step === 1 ? t('custom.namePage') : step === 2 ? t('custom.renameFields') : t('custom.preview')

  return (
    <section className="theme-page theme-customizer page-wizard">
      <header className="theme-editor-heading">
        <h1 className="truncate">{t('custom.editing', { page: page.name })}</h1>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => (step === firstStep ? onCancel() : setStep((value) => value - 1))}>
            {step === firstStep ? t('custom.goBack') : t('custom.back')}
          </button>
          {step < 3 ? (
            <>
              <button type="button" className="btn btn-line" onClick={finish}>{t('save')}</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep((value) => value + 1)}>
                {t('custom.next')}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={finish}>{t('save')}</button>
          )}
        </div>
      </header>
      <p className="mt-4 px-6 text-[11px] text-neutral-400">{t('custom.progress', { current: step, total: 3 })}</p>
      <h2 className="px-6 text-sm font-medium">{stepTitle}</h2>
      {step === 1 ? (
        <div className="mt-3 grid gap-3 px-6">
          <div className="flex items-center gap-3">
            <IconPicker value={icon} onChange={setIcon} />
            <input value={name} onChange={(event) => setName(event.target.value)} className="field min-w-0 flex-1" aria-label={t('custom.pageName')} placeholder={t(`custom.kind.${template}`)} />
          </div>
          <label className="block text-xs">
            <span className="text-neutral-400">{t('custom.pageDescription')}</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="field mt-1 w-full" />
          </label>
        </div>
      ) : null}
      {step === 2 ? (
        <FieldLabelEditor
          className="mt-3 px-6"
          template={template}
          values={fieldLabels}
          showDefaults={locale !== 'ko'}
          onChange={(key, value) => setFieldLabels((current) => ({ ...current, [key]: value }))}
        />
      ) : null}
      <div className="template-preview-slot" aria-live="polite">
        <TemplatePreview key={template} kind={template} heading={previewName} labels={fieldLabels} />
      </div>
    </section>
  )
}
