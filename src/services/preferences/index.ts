import { coerceLocale, type AppLocale } from '../../i18n/locale.ts'
import { readDeviceLocale, writeDeviceLocale, writeGuestLocale } from '../../i18n/storage.ts'
import { schedulingSettings } from '../../../packages/scheduling/src/settings.ts'
import { createPreferenceRepository } from '@blanky/api'
import type { UserPreference } from '@blanky/types'
import { normalizeAccent, normalizeSaved } from '../../theme/accent.ts'
import { getCurrentUserId } from '../auth/index.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'
import {
  DEFAULT_NAV,
  DEFAULT_SETTINGS,
  TASK_DURATIONS,
  type HomeInputDefault,
  type NavPref,
  type ScheduleTab,
  type Settings,
  type ThemeSetting,
  type TimelineDensity,
} from '../../types/records.ts'

/**
 * Web preferences. Local storage updates immediately.
 * `pushPreferences` / `pullPreferences` mirror the same shape in Supabase.
 */
export type UserPreferences = Settings

const LOCALES: readonly AppLocale[] = ['ko', 'en']
const THEMES: readonly ThemeSetting[] = ['light', 'dark', 'system']
const TABS: readonly ScheduleTab[] = ['all', 'timeline', 'tasks']
const DENSITIES: readonly TimelineDensity[] = ['compact', 'default', 'comfortable']
const HOME_INPUTS: readonly HomeInputDefault[] = ['auto', 'schedule', 'task', 'diary', 'memo', 'reading', 'last']
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function clock(value: unknown, fallback: string): string {
  return typeof value === 'string' && CLOCK.test(value) ? value : fallback
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback
}

export function syncNav(nav: NavPref[], recordIds: string[]): NavPref[] {
  const allowed = new Set([...DEFAULT_NAV.map((item) => item.id), ...recordIds])
  const kept = nav.filter((item) => allowed.has(item.id)).map((item) => ({ id: item.id, visible: item.visible }))
  const have = new Set(kept.map((item) => item.id))
  const missing: NavPref[] = [
    ...DEFAULT_NAV.filter((item) => !have.has(item.id)).map((item) => ({ ...item })),
    ...recordIds.filter((id) => !have.has(id)).map((id) => ({ id, visible: true })),
  ]
  return [...kept, ...missing]
}

function readNav(raw: Record<string, unknown>): NavPref[] {
  if (Array.isArray(raw.nav)) {
    return raw.nav.flatMap((item) => {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id) return []
      return [{ id: item.id, visible: item.visible !== false }]
    })
  }
  if (Array.isArray(raw.sidebarOrder)) {
    const hidden = new Set(Array.isArray(raw.hiddenMenus) ? raw.hiddenMenus.filter((id) => typeof id === 'string') : [])
    return raw.sidebarOrder.flatMap((id) => (typeof id === 'string' && id ? [{ id, visible: !hidden.has(id) }] : []))
  }
  return DEFAULT_NAV.map((item) => ({ ...item }))
}

export function normalizePreferences(value: unknown): UserPreferences {
  const raw = isRecord(value) ? value : {}
  const durationSource = raw.taskDefaultDuration ?? raw.defaultEventMinutes
  const duration = TASK_DURATIONS.find((minutes) => minutes === Number(durationSource)) ?? 60
  const week = raw.weekStartsOn === 1 ? 1 : 0
  return {
    timezone:typeof raw.timezone==='string'?raw.timezone:undefined,
    scheduling: (()=>{try{const value=isRecord(raw.scheduling)?raw.scheduling:{};const normalized=schedulingSettings({...value,dayStartTime:clock(raw.dayStartTime,DEFAULT_SETTINGS.dayStartTime),dayEndTime:clock(raw.dayEndTime,DEFAULT_SETTINGS.dayEndTime)});return Object.fromEntries(Object.entries(normalized).filter(([name])=>!['now','startDate','endDate','timezone','dayStartTime','dayEndTime','defaultDurationMinutes'].includes(name)))}catch{return {}}})(),
    locale: oneOf(raw.locale, LOCALES, 'ko'),
    theme: oneOf(raw.theme, THEMES, 'light'),
    accent: normalizeAccent(typeof (raw.accent ?? raw.accentColor) === 'string' ? String(raw.accent ?? raw.accentColor) : undefined),
    savedAccents: normalizeSaved(raw.savedAccents),
    nav: readNav(raw),
    weekStartsOn: week,
    defaultScheduleTab: oneOf(raw.defaultScheduleTab ?? raw.scheduleDefaultView, TABS, 'all'),
    dayStartTime: clock(raw.dayStartTime, DEFAULT_SETTINGS.dayStartTime),
    dayEndTime: clock(raw.dayEndTime, DEFAULT_SETTINGS.dayEndTime),
    taskDefaultDuration: duration,
    defaultEventMinutes: duration,
    timelineDensity: oneOf(raw.timelineDensity, DENSITIES, 'default'),
    homeDefaultInput: oneOf(raw.homeDefaultInput ?? raw.homeDefaultInputType, HOME_INPUTS, 'auto'),
    lastInputType: typeof raw.lastInputType === 'string' && raw.lastInputType ? raw.lastInputType : 'auto',
    autoClassify: flag(raw.autoClassify ?? raw.autoClassification, true),
    autoSaveAfterClassify: flag(raw.autoSaveAfterClassify ?? raw.autoSaveAfterClassification, false),
    taskView: raw.taskView === 'all' ? 'all' : 'open',
    notifyEvents: flag(raw.notifyEvents, true),
    notifyTasks: flag(raw.notifyTasks, true),
    customTemplatesGuideSeen: flag(raw.customTemplatesGuideSeen, false),
  }
}

export function defaultPreferences(recordIds: string[] = []): UserPreferences {
  const base = normalizePreferences(DEFAULT_SETTINGS)
  return { ...base, nav: syncNav(base.nav, recordIds), savedAccents: [] }
}

export function preferencesKey(userId: string): string {
  return `blanky.preferences.${userId}`
}

export function loadPreferences(userId: string): UserPreferences | null {
  try {
    const raw = localStorage.getItem(preferencesKey(userId))
    if (!raw) return null
    return normalizePreferences(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function savePreferences(userId: string, preferences: UserPreferences): void {
  localStorage.setItem(preferencesKey(userId), JSON.stringify(preferences))
}

export function toStoredPreference(userId: string, settings: Settings): UserPreference {
  return {
    userId,
    timezone: settings.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'),
    dayStartTime: settings.dayStartTime,
    dayEndTime: settings.dayEndTime,
    defaultDuration: settings.taskDefaultDuration,
    locale: settings.locale,
    notificationsEnabled: settings.notifyEvents || settings.notifyTasks,
    theme: settings.theme,
    accentColor: settings.accent,
    scheduleDefaultView: settings.defaultScheduleTab,
    weekStartsOn: settings.weekStartsOn,
    autoClassification: settings.autoClassify,
    autoSaveAfterClassification: settings.autoSaveAfterClassify,
    settings: { ...settings },
    updatedAt: new Date().toISOString(),
  }
}

export function settingsFromPreference(preference: UserPreference): UserPreferences {
  return normalizePreferences({
    ...preference.settings,
    locale: coerceLocale(preference.locale ?? (isRecord(preference.settings) ? preference.settings.locale : undefined)),
    timezone:preference.timezone,
    theme: preference.theme,
    accent: preference.accentColor,
    scheduleDefaultView: preference.scheduleDefaultView,
    weekStartsOn: preference.weekStartsOn,
    taskDefaultDuration: preference.defaultDuration,
    dayStartTime: preference.dayStartTime,
    dayEndTime: preference.dayEndTime,
    autoClassification: preference.autoClassification,
    autoSaveAfterClassification: preference.autoSaveAfterClassification,
  })
}

export async function pushPreferences(settings: Settings): Promise<void> {
  if (!isSupabaseConfigured) return
  try {
    const userId = await getCurrentUserId()
    if (!userId) return
    await createPreferenceRepository(getSupabaseClient()).save(toStoredPreference(userId, settings))
  } catch {
    // The screen already updated. The next change tries again.
  }
}

export async function pullPreferences(): Promise<UserPreferences | null> {
  if (!isSupabaseConfigured) return null
  try {
    const userId = await getCurrentUserId()
    if (!userId) return null
    const remote = await createPreferenceRepository(getSupabaseClient()).get(userId)
    if (!remote) return null
    const settings = settingsFromPreference(remote)
    const device = readDeviceLocale(userId)
    if (device && device.updatedAt > remote.updatedAt && device.locale !== settings.locale) {
      return { ...settings, locale: device.locale }
    }
    writeDeviceLocale(userId, settings.locale, remote.updatedAt)
    writeGuestLocale(settings.locale, remote.updatedAt)
    return settings
  } catch {
    return null
  }
}

function selfCheckPreferences(): void {
  if (!import.meta.env.DEV) return
  const legacy = normalizePreferences({
    locale: 'fr',
    theme: 'nope',
    accentColor: 'pink',
    scheduleDefaultView: 'tasks',
    autoClassification: false,
    homeDefaultInputType: 'diary',
    autoSaveAfterClassification: true,
    taskDefaultDuration: 7,
    nav: [{ id: 'memo', visible: false }, { id: 'nope', visible: true }],
  })
  if (legacy.locale !== 'ko') throw new Error('preference locale')
  if (legacy.theme !== 'light' || legacy.accent !== 'pink') throw new Error('preference fallback')
  if (legacy.defaultScheduleTab !== 'tasks' || legacy.homeDefaultInput !== 'diary') throw new Error('preference alias')
  if (legacy.autoClassify || !legacy.autoSaveAfterClassify) throw new Error('preference flags')
  if (legacy.taskDefaultDuration !== 60) throw new Error('preference duration')
  const nav = syncNav(legacy.nav, ['workout'])
  if (nav[0]?.id !== 'memo' || nav[0].visible) throw new Error('nav order')
  if (!nav.some((item) => item.id === 'home' && item.visible)) throw new Error('nav builtin')
  if (!nav.some((item) => item.id === 'workout' && item.visible)) throw new Error('nav record')
  if (nav.some((item) => item.id === 'nope')) throw new Error('nav junk')
  if (defaultPreferences().autoSaveAfterClassify) throw new Error('autosave default')
  if (defaultPreferences().customTemplatesGuideSeen) throw new Error('guide default')
  if (!normalizePreferences({ customTemplatesGuideSeen: true }).customTemplatesGuideSeen) throw new Error('guide persist')
}

selfCheckPreferences()
