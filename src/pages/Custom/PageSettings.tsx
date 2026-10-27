import { IconPicker } from '../../components/common/IconPicker.tsx'
import type { UserPage } from '../../features/builder/schema.ts'
import { DEFAULT_FIELD_LABELS, FIELD_KEYS, fieldLabel } from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'

export function PageSettings({ page }: { page: UserPage }) {
  const { t } = useI18n()
  const { updateUserPage } = useLibrary()
  const template = page.template
  if (!template) return null
  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-3">
        <IconPicker value={page.icon} onChange={(icon) => updateUserPage(page.id, { icon })} />
        <input
          value={page.name}
          onChange={(event) => updateUserPage(page.id, { name: event.target.value })}
          className="field min-w-0 flex-1"
          aria-label={t('custom.pageName')}
        />
      </div>
      {FIELD_KEYS[template].map((key) => (
        <label key={key} className="block text-sm">
          <span className="text-neutral-400">{DEFAULT_FIELD_LABELS[template][key as keyof (typeof DEFAULT_FIELD_LABELS)[typeof template]]}</span>
          <input
            value={page.fieldLabels[key] ?? ''}
            onChange={(event) => updateUserPage(page.id, { fieldLabels: { ...page.fieldLabels, [key]: event.target.value } })}
            placeholder={fieldLabel(template, key)}
            className="field mt-1 w-full"
          />
        </label>
      ))}
    </div>
  )
}
