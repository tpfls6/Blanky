import { navLabel } from '../../constants/navigation.ts'
import { Sortable } from '../../components/drag/Sortable.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import { DEFAULT_NAV } from '../../types/records.ts'
import { syncNav } from '../../services/preferences/index.ts'

export function NavSection() {
  const { settings, recordTypes, updateSettings } = useLibrary()

  return (
    <div>
      <p className="text-sm">Sidebar</p>
      <p className="mt-1 text-xs text-neutral-400">행을 끌어 순서를 바꿉니다. Custom과 Settings는 항상 아래에 둡니다.</p>
      <Sortable
        items={settings.nav}
        className="mt-4"
        itemClassName={() => 'border-t border-line'}
        onReorder={(nav) => updateSettings({ nav })}
        render={(item) => (
          <div className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 text-sm">{navLabel(item.id, recordTypes)}</span>
            <button
              type="button"
              role="switch"
              aria-checked={item.visible}
              aria-label={`${navLabel(item.id, recordTypes)} 표시`}
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
        onClick={() => updateSettings({ nav: syncNav(DEFAULT_NAV.map((item) => ({ ...item })), recordTypes.map((item) => item.id)) })}
      >
        기본값으로 복원
      </button>
    </div>
  )
}
