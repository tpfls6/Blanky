import { DEFAULT_FIELD_LABELS, FIELD_KEYS, isTextKey, type PageTemplateKind } from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'

/** Inputs for a template's field labels, with page-wide words (책, 서재…) in their own group. */
export function FieldLabelEditor({
  template,
  values,
  onChange,
  showDefaults = false,
  className = '',
}: {
  template: PageTemplateKind
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  /** Show the default label as a placeholder (settings keep only overrides). */
  showDefaults?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const defaults = DEFAULT_FIELD_LABELS[template] as Record<string, string>
  const keys = FIELD_KEYS[template] as readonly string[]
  const fields = keys.filter((key) => !isTextKey(template, key))
  const words = keys.filter((key) => isTextKey(template, key))
  const input = (key: string) => (
    <label key={key} className={key === 'tagline' ? 'block text-xs sm:col-span-2' : 'block text-xs'}>
      <span className="text-neutral-400">{defaults[key]}</span>
      <input
        value={values[key] ?? ''}
        onChange={(event) => onChange(key, event.target.value)}
        placeholder={showDefaults ? defaults[key] : undefined}
        maxLength={80}
        className="field mt-1 w-full"
      />
    </label>
  )
  return (
    <div className={className}>
      <div className="grid gap-2 sm:grid-cols-2">{fields.map(input)}</div>
      {words.length ? (
        <section className="mt-5" aria-label={t('custom.textLabels')}>
          <h3 className="text-sm font-medium">{t('custom.textLabels')}</h3>
          <p className="mt-0.5 text-xs text-neutral-400">{t('custom.textLabelsHint')}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">{words.map(input)}</div>
        </section>
      ) : null}
    </div>
  )
}
