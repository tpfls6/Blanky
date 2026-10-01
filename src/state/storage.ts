export const USERS_KEY = 'blanky.accounts.v1'
export const SESSION_KEY = 'blanky.session.v1'

export function libraryKey(userId: string): string {
  return `blanky.library.${userId}`
}

export function taskNavKey(userId: string): string {
  return `blanky.taskNav.${userId}`
}

export const RECENT_ICONS_KEY = 'blanky.recentIcons'
