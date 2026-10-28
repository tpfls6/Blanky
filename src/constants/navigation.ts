import { Store, Palette, History, BookOpen, CalendarDays, House, Library, Settings, SlidersHorizontal, StickyNote, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
  { id: 'activity', label: 'Activity', to: ROUTES.activity, icon: History },
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

export const TRASH_NAV: NavItem = {
  id: 'trash',
  label: '휴지통',
  to: ROUTES.trash,
  icon: Trash2,
}

const CHROME_IDS = new Set(['home', 'activity', 'schedule', 'diary', 'reading', 'memo', 'custom', 'settings', 'trash', 'store', 'themes'])

export function chromeNavLabel(id: string, translate: (key: string) => string, fallback: string): string {
  return CHROME_IDS.has(id) ? translate(`nav.${id}`) : fallback
}

export function navLabel(id: string, recordTypes: readonly CustomRecordType[], translate?: (key: string) => string): string {
  const fallback = BUILTIN.find((item) => item.id === id)?.label ?? recordTypes.find((item) => item.id === id)?.name ?? id
  return translate ? chromeNavLabel(id, translate, fallback) : fallback
}

export function visibleNav(nav: readonly NavPref[]): NavItem[] {
  return nav.flatMap((pref) => {
    if (!pref.visible) return []
    const builtin = BUILTIN.find((item) => item.id === pref.id)
    return builtin ? [builtin] : []
  })
}

export function isRecordNav(id: string): boolean {
  return id === 'activity'
}

export const STORE_NAV: NavItem = {id:'store',label:'Store',to:'/store',icon:Store}
export const THEMES_NAV: NavItem = {id:'themes',label:'내 테마',to:'/settings/themes',icon:Palette}
