import { useMemo, useState } from 'react'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import {
  DEFAULT_FIELD_LABELS,
  FIELD_KEYS,
  type PageTemplateKind,
} from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { TemplatePreview } from './TemplatePreview.tsx'

const ICONS: Record<PageTemplateKind, string> = {
  diary: 'BookOpen',
  reading: 'Library',
  memo: 'StickyNote',
}

const KINDS = ['diary', 'reading', 'memo'] as const

export function CreatePageWizard({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (input: { template: PageTemplateKind; name: string; icon: string; fieldLabels: Record<string, string> }) => void
}) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [template, setTemplate] = useState<PageTemplateKind>('diary')
  const [preview, setPreview] = useState<PageTemplateKind>('diary')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(ICONS.diary)
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({ ...DEFAULT_FIELD_LABELS.diary })
  const keys = FIELD_KEYS[template]
  const shown = preview
  const previewName = step === 0 ? t(`custom.kind.${shown}`) : name.trim() || t(`custom.kind.${template}`)
  const previewLabels = step === 0 ? DEFAULT_FIELD_LABELS[shown] : fieldLabels
  const defaults = useMemo(() => DEFAULT_FIELD_LABELS[template], [template])
  const title = step === 0 ? t('custom.pickTemplate') : step === 1 ? t('custom.namePage') : step === 2 ? t('custom.renameFields') : t('custom.preview')

  const select = (next: PageTemplateKind) => {
    setTemplate(next)
    setPreview(next)
    setIcon(ICONS[next])
    setName(t(`custom.kind.${next}`))
    setFieldLabels({ ...DEFAULT_FIELD_LABELS[next] })
  }

  return (
    <div className="page-wizard flex min-h-0 flex-1 flex-col px-4 py-3 md:px-6">
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-neutral-400">{t('custom.progress', { current: step + 1, total: 4 })}</p>
          <h1 className="truncate text-sm font-medium">{title}</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => (step === 0 ? onCancel() : setStep((value) => value - 1))}>
            {step === 0 ? t('custom.goBack') : t('custom.back')}
          </button>
          {step < 3 ? (
            <button type="button" className="btn btn-primary" onClick={() => {
              if (step === 0 && preview !== template) select(preview)
              setStep((value) => value + 1)
            }}>
              {t('custom.next')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onCreate({ template, name: previewName, icon, fieldLabels })}
            >
              {t('custom.create')}
            </button>
          )}
        </div>
      </header>
      {step === 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {KINDS.map((kind) => (
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
        <div className="mt-3 flex items-center gap-3">
          <IconPicker value={icon} onChange={setIcon} />
          <input value={name} onChange={(event) => setName(event.target.value)} className="field min-w-0 flex-1" aria-label={t('custom.pageName')} placeholder={t(`custom.kind.${template}`)} />
        </div>
      ) : null}
      {step === 2 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
      <div className="template-preview-slot mt-3" aria-live="polite">
        <TemplatePreview key={shown} kind={shown} heading={previewName} labels={previewLabels} />
      </div>
    </div>
  )
}
