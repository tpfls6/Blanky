import {
  BookOpen,
  CalendarDays,
  Clock,
  Folder,
  History,
  List,
  PenLine,
  Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ROUTES } from './routes.ts'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Today', to: ROUTES.home, icon: Sun, end: true },
  { label: 'Schedule', to: ROUTES.schedule, icon: List },
  { label: 'Calendar', to: ROUTES.calendar, icon: CalendarDays },
  { label: 'Timeline', to: ROUTES.timeline, icon: Clock },
  { label: 'History', to: ROUTES.history, icon: History },
  { label: 'Journal', to: ROUTES.journal, icon: PenLine },
  { label: 'Reading', to: ROUTES.reading, icon: BookOpen },
  { label: 'Projects', to: ROUTES.projects, icon: Folder },
]

export const PRIMARY_NAV_ITEMS = NAV_ITEMS.slice(0, 4)
export const SECONDARY_NAV_ITEMS = NAV_ITEMS.slice(4)
