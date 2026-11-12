import { useState } from 'react'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { useI18n } from '../../i18n/useI18n.ts'
import { ReadingRestoreError } from '../../services/reading/restore.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { trashKindKey } from '../../utils/trash.ts'

export function TrashPage() {
  const confirm = useConfirm()
  const { t } = useI18n()
  const { trash, restoreTrash, purgeTrash, emptyTrash } = useLibrary()
  const [busy, setBusy] = useState<string | null>(null)
  // A failed 복구 leaves its row in the trash; it says why under the row and offers 다시 시도.
  const [failed, setFailed] = useState<Record<string, 'failed' | 'conflict'>>({})
  const clear = (id: string) => setFailed((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)))

  const restore = async (id: string) => {
    if (busy) return
    setBusy(id)
    clear(id)
    try {
      await restoreTrash(id)
    } catch (error) {
      console.error(error)
      setFailed((current) => ({ ...current, [id]: error instanceof ReadingRestoreError && error.reason === 'conflict' ? 'conflict' : 'failed' }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-8 md:px-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-medium tracking-tight">{t('trash.title')}</h1>
        {trash.length > 0 ? (
          <button
            data-theme-slot="button"
            type="button"
            className="btn btn-ghost"
            disabled={Boolean(busy)}
            onClick={async () => {
              if (!await confirm(t('trash.emptyBody'), { title: t('trash.emptyTitle'), confirmLabel: t('trash.emptyAll') })) return
              emptyTrash()
            }}
          >
            {t('trash.emptyAll')}
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-neutral-400">{t('trash.intro')}</p>
      <div className="mt-6 overflow-hidden rounded-md border border-line bg-surface px-4">
      {trash.length === 0 ? <EmptyState>{t('trash.empty')}</EmptyState> : null}
      <ul>
        {trash.map((row) => (
          <li key={row.id} className="border-t border-line py-3 first:border-t-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm">{row.title}</p>
                <p className="mt-1 text-xs text-neutral-400">{t(trashKindKey(row))} · {row.deletedAt.slice(0, 10)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button data-theme-slot="button" type="button" className="trash-action text-neutral-500" disabled={Boolean(busy)} aria-busy={busy === row.id} onClick={() => void restore(row.id)}>
                  {busy === row.id ? t('trash.restoring') : t('trash.restore')}
                </button>
                <button
                  data-theme-slot="button"
                  type="button"
                  className="trash-action text-neutral-400"
                  disabled={busy === row.id}
                  onClick={async () => {
                    if (!await confirm(t('trash.purgeBody'))) return
                    clear(row.id)
                    purgeTrash(row.id)
                  }}
                >
                  {t('trash.purge')}
                </button>
              </div>
            </div>
            {failed[row.id] ? (
              <div role="alert" className="trash-alert mt-2 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs">
                <span>{t(failed[row.id] === 'conflict' ? 'trash.restoreConflict' : 'trash.restoreFailed')}</span>
                <button data-theme-slot="button" type="button" className="trash-action shrink-0 font-medium" disabled={Boolean(busy)} onClick={() => void restore(row.id)}>
                  {t('trash.retry')}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      </div>
    </div>
  )
}
