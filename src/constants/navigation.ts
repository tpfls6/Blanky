import { CalendarDays, Clock, History, ListChecks, Sun, Tags } from 'lucide-react'
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
  { label: 'Calendar', to: ROUTES.calendar, icon: CalendarDays },
  { label: 'Timeline', to: ROUTES.timeline, icon: Clock },
  { label: 'Tasks', to: ROUTES.tasks, icon: ListChecks },
  { label: 'History', to: ROUTES.history, icon: History },
]

export const CATEGORY_NAV: NavItem = {
  label: 'Category',
  to: ROUTES.categories,
  icon: Tags,
}
