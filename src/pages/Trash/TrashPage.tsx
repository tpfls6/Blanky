import { EmptyState } from '../../components/common/EmptyState.tsx'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { trashKindLabel } from '../../utils/trash.ts'

export function TrashPage() {
  const confirm = useConfirm()
  const { trash, restoreTrash, purgeTrash, emptyTrash } = useLibrary()

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-8 md:px-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-medium tracking-tight">휴지통</h1>
        {trash.length > 0 ? (
          <button
            data-theme-slot="button"
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              if (!await confirm('휴지통을 비울까요? 복구할 수 없습니다.', { title: '휴지통 비우기', confirmLabel: '비우기' })) return
              emptyTrash()
            }}
          >
            비우기
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-neutral-400">삭제한 항목을 복구하거나 완전히 지울 수 있습니다.</p>
      {trash.length === 0 ? <EmptyState>휴지통이 비어 있습니다.</EmptyState> : null}
      <ul className="mt-6">
        {trash.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 border-t border-line py-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{row.title}</p>
              <p className="mt-1 text-xs text-neutral-400">{trashKindLabel(row)} · {row.deletedAt.slice(0, 10)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button data-theme-slot="button" type="button" className="text-xs text-neutral-500" onClick={() => void restoreTrash(row.id)}>복구</button>
              <button
                data-theme-slot="button"
                type="button"
                className="text-xs text-neutral-400"
                onClick={async () => {
                  if (!await confirm('이 항목을 완전히 삭제할까요? 복구할 수 없습니다.')) return
                  purgeTrash(row.id)
                }}
              >
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
