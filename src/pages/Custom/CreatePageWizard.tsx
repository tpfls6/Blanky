import { useMemo, useState } from 'react'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import {
  DEFAULT_FIELD_LABELS,
  FIELD_KEYS,
  PAGE_TEMPLATES,
  type PageTemplateKind,
} from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { TemplateImport } from './PackageControls.tsx'
import { TemplatePreview } from './TemplatePreview.tsx'

const ICONS: Record<PageTemplateKind, string> = {
  diary: 'BookOpen',
  reading: 'Library',
  memo: 'StickyNote',
}

export function CreatePageWizard({
  initial,
  onCancel,
  onCreate,
}: {
  initial?: PageTemplateKind
  onCancel: () => void
  onCreate: (input: { template: PageTemplateKind; name: string; icon: string; fieldLabels: Record<string, string> }) => void
}) {
  const { t } = useI18n()
  const [pane, setPane] = useState<'basic' | 'custom'>('basic')
  const [step, setStep] = useState(0)
  const [template, setTemplate] = useState<PageTemplateKind>(initial ?? 'diary')
  const [preview, setPreview] = useState<PageTemplateKind>(initial ?? 'diary')
  const [name, setName] = useState(initial ? t(`custom.kind.${initial}`) : '')
  const [icon, setIcon] = useState(ICONS[initial ?? 'diary'])
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({ ...DEFAULT_FIELD_LABELS[initial ?? 'diary'] })
  const keys = FIELD_KEYS[template]
  const shown = preview
  const previewName = step === 0 ? t(`custom.kind.${shown}`) : name.trim() || t(`custom.kind.${template}`)
  const previewLabels = step === 0 ? DEFAULT_FIELD_LABELS[shown] : fieldLabels
  const defaults = useMemo(() => DEFAULT_FIELD_LABELS[template], [template])
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
        <h1 className="truncate">{t('custom.makeTemplate')}</h1>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => (pane === 'custom' || step === 0 ? onCancel() : setStep((value) => value - 1))}>
            {pane === 'custom' || step === 0 ? t('custom.goBack') : t('custom.back')}
          </button>
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
              onClick={() => onCreate({ template, name: previewName, icon, fieldLabels })}
            >
              {t('custom.create')}
            </button>
          ) : null}
        </div>
      </header>
      <div className="theme-editor-tabs" role="tablist" aria-label={t('custom.makeTemplate')}>
        <button type="button" role="tab" aria-selected={pane === 'basic'} className={pane === 'basic' ? 'tab tab-on' : 'tab'} onClick={() => setPane('basic')}>
          {t('custom.groupBasic')}
        </button>
        <button type="button" role="tab" aria-selected={pane === 'custom'} className={pane === 'custom' ? 'tab tab-on' : 'tab'} onClick={() => setPane('custom')}>
          {t('custom.groupCustom')}
        </button>
      </div>
      {pane === 'custom' ? <TemplateImport list={false} /> : (
        <>
          <p className="px-6 text-[11px] text-neutral-400">{t('custom.progress', { current: step + 1, total: 4 })}</p>
          <h2 className="px-6 text-sm font-medium">{stepTitle}</h2>
          {step === 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2 px-6">
              {PAGE_TEMPLATES.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={template === kind}
                  className="template-card flex min-w-0 flex-col gap-0.5 rounded-md px-2.5 py-2 text-left"
                  onMouseEnter={() => setPreview(kind)}
                  onFocus={() => setPreview(kind)}
                  onClick={() => select(kind)}
                >
                  <span className="truncate text-sm font-medium">{t(`custom.kind.${kind}`)}</span>
                  <span className="truncate text-[11px] text-neutral-400">{t(`custom.kindHint.${kind}`)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {step === 1 ? (
            <div className="mt-3 flex items-center gap-3 px-6">
              <IconPicker value={icon} onChange={setIcon} />
              <input value={name} onChange={(event) => setName(event.target.value)} className="field min-w-0 flex-1" aria-label={t('custom.pageName')} placeholder={t(`custom.kind.${template}`)} />
            </div>
          ) : null}
          {step === 2 ? (
            <div className="mt-3 grid gap-2 px-6 sm:grid-cols-2">
              {keys.map((key) => (
                <label key={key} className="block text-xs">
                  <span className="text-neutral-400">{defaults[key as keyof typeof defaults]}</span>
                  <input
                    value={fieldLabels[key] ?? ''}
                    onChange={(event) => setFieldLabels((current) => ({ ...current, [key]: event.target.value }))}
                    className="field mt-1 w-full"
                  />
                </label>
              ))}
            </div>
          ) : null}
          <div className="template-preview-slot" aria-live="polite">
            <TemplatePreview key={shown} kind={shown} heading={previewName} labels={previewLabels} />
          </div>
        </>
      )}
    </section>
  )
}
