export const SETTINGS_MENUS = ['general', 'account', 'ai', 'calendar', 'categories'] as const
export type SettingsMenuId = (typeof SETTINGS_MENUS)[number]

export const AI_TABS = ['planner', 'input'] as const
export type AiTab = (typeof AI_TABS)[number]

export const CALENDAR_TABS = ['schedule', 'google'] as const
export type CalendarTab = (typeof CALENDAR_TABS)[number]

export const SETTINGS_ALIASES = {
  appearance: { menu: 'general' },
  navigation: { menu: 'general' },
  planning: { menu: 'ai', tab: 'planner' },
  input: { menu: 'ai', tab: 'input' },
  schedule: { menu: 'calendar', tab: 'schedule' },
  'google-calendar': { menu: 'calendar', tab: 'google' },
} as const satisfies Record<string, { menu: SettingsMenuId; tab?: string }>

export function isSettingsMenu(value: string): value is SettingsMenuId {
  return (SETTINGS_MENUS as readonly string[]).includes(value)
}

export function settingsPath(menu: SettingsMenuId, tab?: string): string {
  if (menu === 'ai' && tab === 'input') return '/settings/ai?tab=input'
  if (menu === 'calendar' && tab === 'google') return '/settings/calendar?tab=google'
  return `/settings/${menu}`
}

export function resolveSettingsRoute(section: string | undefined, tab: string | null = null): {
  menu: SettingsMenuId
  tab?: AiTab | CalendarTab
  redirect?: string
} {
  if (!section) return { menu: 'general', redirect: '/settings/general' }
  if (section === 'custom-records') return { menu: 'general', redirect: '/custom?panel=records' }

  const alias = SETTINGS_ALIASES[section as keyof typeof SETTINGS_ALIASES]
  if (alias) return 'tab' in alias ? { menu: alias.menu, tab: alias.tab } : { menu: alias.menu }

  if (!isSettingsMenu(section)) return { menu: 'general', redirect: '/settings/general' }
  if (section === 'ai') return { menu: 'ai', tab: tab === 'input' ? 'input' : 'planner' }
  if (section === 'calendar') return { menu: 'calendar', tab: tab === 'google' ? 'google' : 'schedule' }
  return { menu: section }
}
