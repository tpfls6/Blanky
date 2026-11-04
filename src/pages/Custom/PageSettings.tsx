import { IconPicker } from '../../components/common/IconPicker.tsx'
import type { UserPage } from '../../features/builder/schema.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { FieldLabelEditor } from './FieldLabelEditor.tsx'

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
      <FieldLabelEditor
        template={template}
        values={page.fieldLabels}
        showDefaults
        onChange={(key, value) => updateUserPage(page.id, { fieldLabels: { ...page.fieldLabels, [key]: value } })}
      />
    </div>
  )
}
