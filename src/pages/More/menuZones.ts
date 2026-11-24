import { CUSTOM_NAV, MOBILE_BAR_SIZE, mobileTabs, pageNav, SETTINGS_NAV, STORE_NAV, TRASH_NAV, visibleNav, type NavItem } from '../../constants/navigation.ts'
import { DEFAULT_NAV, type NavPref } from '../../types/records.ts'

/** The menu layout screen's three zones: the phone bar, the rest (shown on More), and menus hidden everywhere. */
export const MENU_ZONES = ['bar', 'more', 'hidden'] as const
export type MenuZone = (typeof MENU_ZONES)[number]
export type MenuZones = Record<MenuZone, string[]>

/** Management menus live in More's group cards, never as shortcut tiles. */
export const MANAGE_IDS: ReadonlySet<string> = new Set(['custom', 'store', 'trash', 'settings'])

/** Only the shared built-in menus have a visibility flag (settings.nav); pages and management menus always show. */
export function canHide(id: string): boolean {
  return DEFAULT_NAV.some((item) => item.id === id)
}

/** Every menu the phone can show, in the same order MobileNav and More use. */
export function phoneMenus(nav: readonly NavPref[], pages: readonly { id: string; name: string; icon: string }[]): NavItem[] {
  return [...visibleNav(nav), ...pageNav(pages), CUSTOM_NAV, STORE_NAV, TRASH_NAV, SETTINGS_NAV]
}

/** Splits the saved settings into zones; hidden built-ins keep their settings.nav order. */
export function menuZones(nav: readonly NavPref[], pages: readonly { id: string; name: string; icon: string }[], mobileBarIds?: readonly string[]): { zones: MenuZones; items: NavItem[] } {
  const shown = phoneMenus(nav, pages)
  const { bar, rest } = mobileTabs(shown, mobileBarIds)
  const hidden = visibleNav(nav.filter((pref) => !pref.visible && canHide(pref.id)).map((pref) => ({ ...pref, visible: true })))
  return {
    zones: { bar: bar.map((item) => item.id), more: rest.map((item) => item.id), hidden: hidden.map((item) => item.id) },
    items: [...shown, ...hidden],
  }
}

/** Why a layout cannot be saved; null when it can. */
export function zonesProblem(zones: MenuZones): 'full' | 'empty' | 'locked' | null {
  if (zones.bar.length > MOBILE_BAR_SIZE) return 'full'
  if (!zones.bar.length) return 'empty'
  if (zones.hidden.some((id) => !canHide(id))) return 'locked'
  return null
}

/** The settings patch for a layout: the bar order plus settings.nav visibility (order untouched). */
export function zonesPatch(nav: readonly NavPref[], zones: MenuZones): { mobileBarIds: string[]; nav: NavPref[] } {
  const hidden = new Set(zones.hidden)
  return {
    mobileBarIds: [...zones.bar],
    nav: nav.map((pref) => (canHide(pref.id) ? { ...pref, visible: !hidden.has(pref.id) } : pref)),
  }
}

/** Default layout: the default phone bar and every shared menu shown again, keeping the sidebar order. */
export function defaultZonesPatch(nav: readonly NavPref[]): { mobileBarIds: undefined; nav: NavPref[] } {
  return {
    mobileBarIds: undefined,
    nav: nav.map((pref) => {
      const base = DEFAULT_NAV.find((item) => item.id === pref.id)
      return base ? { ...pref, visible: base.visible } : pref
    }),
  }
}

/** Moves one menu within or across zones; `index` is its place in the target zone. */
export function moveMenu(zones: MenuZones, id: string, to: MenuZone, index: number): MenuZones {
  const next = { bar: zones.bar.filter((key) => key !== id), more: zones.more.filter((key) => key !== id), hidden: zones.hidden.filter((key) => key !== id) }
  const list = next[to]
  list.splice(Math.max(0, Math.min(index, list.length)), 0, id)
  return next
}
