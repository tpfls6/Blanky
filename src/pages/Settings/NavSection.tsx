import { navLabel } from '../../constants/navigation.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { Sortable } from '../../components/drag/Sortable.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import { DEFAULT_NAV } from '../../types/records.ts'

export function NavSection() {
  const { settings, recordTypes, updateSettings } = useLibrary()
  const { t } = useI18n()

  return (
    <div>
      <p className="text-sm">{t('settings.navigation.sidebar')}</p>
      <p className="mt-1 text-xs text-neutral-400">{t('settings.navigation.hint')}</p>
      <Sortable
        items={settings.nav.filter((item) => DEFAULT_NAV.some((row) => row.id === item.id))}
        className="mt-4"
        itemClassName={() => 'border-t border-line'}
        onReorder={(nav) => updateSettings({ nav: [...nav, ...settings.nav.filter((item) => !DEFAULT_NAV.some((row) => row.id === item.id))] })}
        render={(item) => (
          <div className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 text-sm">{navLabel(item.id, recordTypes, t)}</span>
            <button
              type="button"
              role="switch"
              aria-checked={item.visible}
              aria-label={t('settings.navigation.toggle', { name: navLabel(item.id, recordTypes, t) })}
              onClick={() =>
                updateSettings({
                  nav: settings.nav.map((entry) => (entry.id === item.id ? { ...entry, visible: !entry.visible } : entry)),
                })
              }
              className={item.visible ? 'switch switch-on' : 'switch'}
            />
          </div>
        )}
      />
      <button
        type="button"
        className="btn btn-ghost mt-4"
        onClick={() => updateSettings({ nav: DEFAULT_NAV.map((item) => ({ ...item })) })}
      >
        {t('settings.navigation.restore')}
      </button>
    </div>
  )
}
