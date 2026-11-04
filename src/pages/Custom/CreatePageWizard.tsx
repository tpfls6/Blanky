import { useState } from 'react'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import {
  DEFAULT_FIELD_LABELS,
  PAGE_TEMPLATES,
  type PageTemplateKind,
} from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { FieldLabelEditor } from './FieldLabelEditor.tsx'
import { TemplateImport } from './PackageControls.tsx'
import { TemplatePreview } from './TemplatePreview.tsx'

const ICONS: Record<PageTemplateKind, string> = {
  diary: 'BookOpen',
  reading: 'Library',
  memo: 'StickyNote',
}

type PageDraft = { template: PageTemplateKind; name: string; icon: string; description: string; fieldLabels: Record<string, string> }

/** Creates a template page, or with `page` edits an existing one through the same steps and live preview. */
export function CreatePageWizard({
  initial,
  page,
  onCancel,
  onCreate,
}: {
  initial?: PageTemplateKind
  page?: PageDraft
  onCancel: () => void
  onCreate: (input: PageDraft) => void
}) {
  const { t } = useI18n()
  const editing = Boolean(page)
  const kind = page?.template ?? initial ?? 'diary'
  const firstStep = editing ? 1 : 0
  const [pane, setPane] = useState<'basic' | 'custom'>('basic')
  const [step, setStep] = useState(firstStep)
  const [template, setTemplate] = useState<PageTemplateKind>(kind)
  const [preview, setPreview] = useState<PageTemplateKind>(kind)
  const [name, setName] = useState(page?.name ?? (initial ? t(`custom.kind.${initial}`) : ''))
  const [icon, setIcon] = useState(page?.icon ?? ICONS[kind])
  const [description, setDescription] = useState(page?.description ?? '')
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({ ...DEFAULT_FIELD_LABELS[kind], ...page?.fieldLabels })
  const shown = preview
  const previewName = step === 0 ? t(`custom.kind.${shown}`) : name.trim() || t(`custom.kind.${template}`)
  const previewLabels = step === 0 ? DEFAULT_FIELD_LABELS[shown] : fieldLabels
  const finish = () => onCreate({ template, name: previewName, icon, description: description.trim(), fieldLabels })
  const stepTitle = step === 0 ? t('custom.pickTemplate') : step === 1 ? t('custom.namePage') : step === 2 ? t('custom.renameFields') : t('custom.preview')

  const select = (next: PageTemplateKind) => {
    setTemplate(next)
    setPreview(next)
    setIcon(ICONS[next])
    setName(t(`custom.kind.${next}`))
    setFieldLabels({ ...DEFAULT_FIELD_LABELS[next] })
  }

  return (
    <section className="theme-page theme-customizer page-wizard">
      <header className="theme-editor-heading">
        <h1 className="truncate">{page ? t('custom.editing', { page: page.name }) : t('custom.makeTemplate')}</h1>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => (pane === 'custom' || step === firstStep ? onCancel() : setStep((value) => value - 1))}>
            {pane === 'custom' || step === firstStep ? t('custom.goBack') : t('custom.back')}
          </button>
          {editing && step < 3 ? (
            <button type="button" className="btn btn-line" onClick={finish}>{t('save')}</button>
          ) : null}
          {pane === 'basic' && step < 3 ? (
            <button type="button" className="btn btn-primary" onClick={() => {
              if (step === 0 && preview !== template) select(preview)
              setStep((value) => value + 1)
            }}>
              {t('custom.next')}
            </button>
          ) : null}
          {pane === 'basic' && step >= 3 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={finish}
            >
              {editing ? t('save') : t('custom.create')}
            </button>
          ) : null}
        </div>
      </header>
      {editing ? null : <div className="theme-editor-tabs" role="tablist" aria-label={t('custom.makeTemplate')}>
        <button type="button" role="tab" aria-selected={pane === 'basic'} className={pane === 'basic' ? 'tab tab-on' : 'tab'} onClick={() => setPane('basic')}>
          {t('custom.groupBasic')}
        </button>
        <button type="button" role="tab" aria-selected={pane === 'custom'} className={pane === 'custom' ? 'tab tab-on' : 'tab'} onClick={() => setPane('custom')}>
          {t('custom.groupCustom')}
        </button>
      </div>}
      {pane === 'custom' ? <TemplateImport list={false} /> : (
        <>
          <p className={editing ? "mt-4 px-6 text-[11px] text-neutral-400" : "px-6 text-[11px] text-neutral-400"}>{t('custom.progress', { current: step + 1 - firstStep, total: 4 - firstStep })}</p>
          <h2 className="px-6 text-sm font-medium">{stepTitle}</h2>
          {step === 0 ? (
            <div className="template-choice-grid">
              {PAGE_TEMPLATES.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={template === kind}
                  className="template-card flex min-w-0 flex-col gap-0.5 rounded-md p-4 text-left"
                  onMouseEnter={() => setPreview(kind)}
                  onFocus={() => setPreview(kind)}
                  onClick={() => select(kind)}
                >
                  <span className="truncate text-sm font-medium">{t(`custom.kind.${kind}`)}</span>
                  <span className="text-xs leading-relaxed text-neutral-400">{t(`custom.kindHint.${kind}`)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {step === 1 ? (
            <div className="mt-3 grid gap-3 px-6">
              <div className="flex items-center gap-3">
                <IconPicker value={icon} onChange={setIcon} />
                <input value={name} onChange={(event) => setName(event.target.value)} className="field min-w-0 flex-1" aria-label={t('custom.pageName')} placeholder={t(`custom.kind.${template}`)} />
              </div>
              {editing ? (
                <label className="block text-xs">
                  <span className="text-neutral-400">{t('custom.pageDescription')}</span>
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="field mt-1 w-full" />
                </label>
              ) : null}
            </div>
          ) : null}
          {step === 2 ? (
            <FieldLabelEditor
              className="mt-3 px-6"
              template={template}
              values={fieldLabels}
              onChange={(key, value) => setFieldLabels((current) => ({ ...current, [key]: value }))}
            />
          ) : null}
          <div className="template-preview-slot" aria-live="polite">
            <TemplatePreview key={shown} kind={shown} heading={previewName} labels={previewLabels} />
          </div>
        </>
      )}
    </section>
  )
}
