import { isGoogleOriginWork } from '../../services/calendarSync/origin.ts'

/** Origin marker: Google-imported rows, or rows of a shared calendar (tinted with its color). */
export function GoogleOriginBadge({ item }: { item: { changeSource?: string; calendarType?: string; calendarColor?: string } }) {
  if (item.calendarType === 'shared') {
    return <span data-shared-badge className="ml-1 inline-flex rounded border px-1 text-[10px]" style={{ borderColor: item.calendarColor ?? 'var(--line-color)', color: item.calendarColor }}>공유</span>
  }
  if (!isGoogleOriginWork(item)) return null
  return <span className="ml-1 inline-flex rounded border border-line px-1 text-[10px] text-neutral-500">Google</span>
}
