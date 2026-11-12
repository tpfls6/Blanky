import { ArrowDown, ArrowUp } from 'lucide-react'
import { chromeNavLabel, CUSTOM_NAV, MOBILE_BAR_SIZE, mobileTabs, pageNav, SETTINGS_NAV, STORE_NAV, TRASH_NAV, visibleNav } from '../../constants/navigation.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'

export function MobileNavSection() {
  const { settings, customPages, updateSettings } = useLibrary()
  const { t } = useI18n()
  const items = [...visibleNav(settings.nav), ...pageNav(customPages), CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV]
  const { bar } = mobileTabs(items, settings.mobileBarIds)
  const ids = bar.map(item => item.id)
  const move = (index: number, offset: number) => {
    const next = [...ids]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    updateSettings({ mobileBarIds: next })
  }
  return (
    <div className="mb-8" data-mobile-nav-settings>
      <h3 className="text-sm font-medium">{t('settings.navigation.mobileTitle')}</h3>
      <p className="mt-1 text-xs leading-5 text-neutral-500">{t('settings.navigation.mobileHint')}</p>
      <div className="mt-3 flex min-h-12 items-center gap-2 rounded-md bg-hover p-3 text-xs" aria-label={t('settings.navigation.mobilePreview')}>
        {bar.map(item => <span className="min-w-0 flex-1 truncate text-center" key={item.id}>{chromeNavLabel(item.id, t, item.label)}</span>)}
      </div>
      <ol className="mt-3 divide-y divide-line">
        {Array.from({ length: MOBILE_BAR_SIZE }, (_, index) => (
          <li className="flex min-w-0 items-center gap-1 py-2" key={index}>
            <span className="w-5 shrink-0 text-xs text-neutral-400">{index + 1}</span>
            <select className="field min-h-11 min-w-0 flex-1 text-sm" data-mobile-nav-slot={index} value={ids[index] ?? ''}
              aria-label={t('settings.navigation.mobileSlot', { count: index + 1 })}
              onChange={event => {
                const next = [...ids]
                if (event.target.value) next[index] = event.target.value
                else next.splice(index, 1)
                updateSettings({ mobileBarIds: next.filter(Boolean) })
              }}>
              <option value="" disabled={ids.length === 1 && index === 0}>{t('settings.navigation.mobileEmpty')}</option>
              {items.map(item => <option key={item.id} value={item.id} disabled={ids.includes(item.id) && ids[index] !== item.id}>{chromeNavLabel(item.id, t, item.label)}</option>)}
            </select>
            <button type="button" className="icon-btn min-h-11 min-w-11" disabled={index === 0 || !ids[index]} onClick={() => move(index, -1)} aria-label={t('settings.navigation.mobileUp', { count: index + 1 })}><ArrowUp size={16} aria-hidden="true" /></button>
            <button type="button" className="icon-btn min-h-11 min-w-11" disabled={index >= ids.length - 1} onClick={() => move(index, 1)} aria-label={t('settings.navigation.mobileDown', { count: index + 1 })}><ArrowDown size={16} aria-hidden="true" /></button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-ghost mt-3 min-h-11" onClick={() => updateSettings({ mobileBarIds: undefined })}>{t('settings.navigation.mobileRestore')}</button>
    </div>
  )
}
