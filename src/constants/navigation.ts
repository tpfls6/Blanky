import { BookOpen, CalendarDays, House, Library, Settings, SlidersHorizontal, StickyNote } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { iconByName } from './icons.ts'
import { ROUTES } from './routes.ts'
import type { CustomRecordType, NavPref } from '../types/records.ts'

export type NavItem = {
  id: string
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
  color?: string
}

const BUILTIN: readonly NavItem[] = [
  { id: 'home', label: 'Home', to: ROUTES.home, icon: House, end: true },
  { id: 'schedule', label: 'Schedule', to: ROUTES.schedule, icon: CalendarDays },
  { id: 'diary', label: 'Diary', to: ROUTES.diary, icon: BookOpen },
  { id: 'reading', label: 'Reading', to: ROUTES.reading, icon: Library },
  { id: 'memo', label: 'Memo', to: ROUTES.memo, icon: StickyNote },
]

export const CUSTOM_NAV: NavItem = {
  id: 'custom',
  label: 'Custom',
  to: ROUTES.custom,
  icon: SlidersHorizontal,
}

export const SETTINGS_NAV: NavItem = {
  id: 'settings',
  label: 'Settings',
  to: ROUTES.settings,
  icon: Settings,
}

export function navLabel(id: string, recordTypes: readonly CustomRecordType[]): string {
  return BUILTIN.find((item) => item.id === id)?.label ?? recordTypes.find((item) => item.id === id)?.name ?? id
}

export function visibleNav(nav: readonly NavPref[], recordTypes: readonly CustomRecordType[]): NavItem[] {
  return nav.flatMap((pref) => {
    if (!pref.visible) return []
    const builtin = BUILTIN.find((item) => item.id === pref.id)
    if (builtin) return [builtin]
    const record = recordTypes.find((item) => item.id === pref.id)
    if (!record) return []
    return [
      {
        id: record.id,
        label: record.name,
        to: ROUTES.record(record.id),
        icon: iconByName(record.icon),
        color: record.color,
      },
    ]
  })
}

export function isRecordNav(id: string): boolean {
  return id !== 'home' && id !== 'schedule' && id !== 'diary' && id !== 'reading' && id !== 'memo' && id !== 'settings' && id !== 'custom'
}
