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
  const [name, setName] = useState(initial ? t(`custom.kind.${initial}`) : '')
  const [icon, setIcon] = useState(ICONS[initial ?? 'diary'])
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({ ...DEFAULT_FIELD_LABELS[initial ?? 'diary'] })
  const keys = FIELD_KEYS[template]
  const pageName = name.trim() || t(`custom.kind.${template}`)
  const defaults = useMemo(() => DEFAULT_FIELD_LABELS[template], [template])
  const stepTitle = step === 0 ? t('custom.pickTemplate') : step === 1 ? t('custom.namePage') : t('custom.renameFields')

  const select = (next: PageTemplateKind) => {
    setTemplate(next)
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
          {pane === 'basic' && step < 2 ? (
            <button type="button" className="btn btn-primary" onClick={() => {
              setStep((value) => value + 1)
            }}>
              {t('custom.next')}
            </button>
          ) : null}
          {pane === 'basic' && step >= 2 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onCreate({ template, name: pageName, icon, fieldLabels })}
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
          <p className="px-6 text-[11px] text-neutral-400">{t('custom.progress', { current: step + 1, total: 3 })}</p>
          <h2 className="px-6 text-sm font-medium">{stepTitle}</h2>
          {step === 0 ? (
            <div className="template-choice-grid">
              {PAGE_TEMPLATES.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={template === kind}
                  className="template-card flex min-w-0 flex-col gap-0.5 rounded-md p-4 text-left"
                  onClick={() => select(kind)}
                >
                  <span className="truncate text-sm font-medium">{t(`custom.kind.${kind}`)}</span>
                  <span className="text-xs leading-relaxed text-neutral-400">{t(`custom.kindHint.${kind}`)}</span>
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
        </>
      )}
    </section>
  )
}
