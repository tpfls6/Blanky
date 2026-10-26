import { isGoogleOriginWork } from '../../services/calendarSync/origin.ts'

export function GoogleOriginBadge({ item }: { item: { changeSource?: string; calendarType?: string } }) {
  if (!isGoogleOriginWork(item)) return null
  return <span className="ml-1 inline-flex rounded border border-line px-1 text-[10px] text-neutral-500">Google</span>
}
