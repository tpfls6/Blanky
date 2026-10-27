import { useMemo, useState } from 'react'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import {
  DEFAULT_FIELD_LABELS,
  FIELD_KEYS,
  fieldLabel,
  type PageTemplateKind,
} from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'

const ICONS: Record<PageTemplateKind, string> = {
  diary: 'BookOpen',
  reading: 'Library',
  memo: 'StickyNote',
}

export function CreatePageWizard({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (input: { template: PageTemplateKind; name: string; icon: string; fieldLabels: Record<string, string> }) => void
}) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [template, setTemplate] = useState<PageTemplateKind | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('StickyNote')
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({})
  const keys = template ? FIELD_KEYS[template] : []
  const previewName = name.trim() || t('custom.unnamed')
  const defaults = useMemo(() => (template ? DEFAULT_FIELD_LABELS[template] : null), [template])

  const pick = (next: PageTemplateKind) => {
    setTemplate(next)
    setIcon(ICONS[next])
    setName(t(`custom.kind.${next}`))
    setFieldLabels({ ...DEFAULT_FIELD_LABELS[next] })
    setStep(1)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <p className="text-xs text-neutral-400">{t('custom.progress', { current: step + 1, total: 4 })}</p>
      {step === 0 ? (
        <>
          <h1 className="mt-2 text-lg font-medium">{t('custom.pickTemplate')}</h1>
          <div className="mt-4 grid gap-2">
            {(['diary', 'reading', 'memo'] as const).map((kind) => (
              <button key={kind} type="button" className="flex items-start gap-3 rounded-md border border-line p-4 text-left" onClick={() => pick(kind)}>
                <span className="text-sm font-medium">{t(`custom.kind.${kind}`)}</span>
                <span className="text-sm text-neutral-400">{t(`custom.kindHint.${kind}`)}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      {step === 1 && template ? (
        <>
          <h1 className="mt-2 text-lg font-medium">{t('custom.namePage')}</h1>
          <div className="mt-4 flex items-start gap-3">
            <IconPicker value={icon} onChange={setIcon} />
            <input value={name} onChange={(event) => setName(event.target.value)} className="field min-w-0 flex-1" aria-label={t('custom.pageName')} />
          </div>
        </>
      ) : null}
      {step === 2 && template && defaults ? (
        <>
          <h1 className="mt-2 text-lg font-medium">{t('custom.renameFields')}</h1>
          <p className="mt-1 text-sm text-neutral-400">{t('custom.renameHint')}</p>
          <div className="mt-4 grid gap-3">
            {keys.map((key) => (
              <label key={key} className="block text-sm">
                <span className="text-neutral-400">{defaults[key as keyof typeof defaults]}</span>
                <input
                  value={fieldLabels[key] ?? ''}
                  onChange={(event) => setFieldLabels((current) => ({ ...current, [key]: event.target.value }))}
                  className="field mt-1 w-full"
                />
              </label>
            ))}
          </div>
        </>
      ) : null}
      {step === 3 && template ? (
        <>
          <h1 className="mt-2 text-lg font-medium">{t('custom.preview')}</h1>
          <div className="mt-4 rounded-md border border-line p-4">
            <p className="text-lg font-medium">{previewName}</p>
            <p className="mt-1 text-xs text-neutral-400">{t(`custom.kind.${template}`)}</p>
            <dl className="mt-4 grid gap-2 text-sm">
              {keys.map((key) => (
                <div key={key} className="flex gap-3">
                  <dt className="w-28 shrink-0 text-neutral-400">{fieldLabel(template, key, fieldLabels)}</dt>
                  <dd className="min-w-0 flex-1 rounded-md border border-dashed border-line px-2 py-1 text-neutral-300">{t('custom.previewField')}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => (step === 0 ? onCancel() : setStep((value) => value - 1))}>
          {step === 0 ? t('custom.skip') : t('custom.back')}
        </button>
        {step > 0 && step < 3 ? (
          <button type="button" className="btn btn-primary" onClick={() => setStep((value) => value + 1)}>
            {t('custom.next')}
          </button>
        ) : null}
        {step === 3 && template ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onCreate({ template, name: previewName, icon, fieldLabels })}
          >
            {t('custom.create')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
