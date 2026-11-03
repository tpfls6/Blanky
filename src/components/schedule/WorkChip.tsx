import { useLibrary } from '../../state/useLibrary.ts'
import type { WorkItem } from '../../types/work.ts'
import { chipDetail } from '../../features/ai/autoSave.ts'

/** A saved item in one line; the live row wins over the chat snapshot so edits show at once. */
export function WorkChip({ snapshot, onOpen }: { snapshot: WorkItem; onOpen: (item: WorkItem, trigger: HTMLElement) => void }) {
  const library = useLibrary()
  const live = library.items.find(row => row.id === snapshot.id)
  const item = live ?? snapshot
  const kind = item.kind === 'task' ? '할 일' : '일정'
  const detail = chipDetail(item)
  return <button type="button" data-theme-slot="button" data-work-chip={item.id} disabled={!live}
    className={'chip inline-flex max-w-full items-baseline gap-1.5 border border-line text-left' + (live ? '' : ' line-through opacity-60')}
    aria-label={`${kind} ${item.title}, ${detail}${live ? ', 수정' : ', 삭제됨'}`}
    onClick={event => { if (live) onOpen(live, event.currentTarget) }}>
    <span className="shrink-0 text-neutral-400">{kind}</span>
    <span className="min-w-0 truncate font-medium text-neutral-900">{item.title}</span>
    <span className="shrink-0 text-neutral-500">{detail}</span>
  </button>
}
