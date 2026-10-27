import { detectBrowserLocale, parseLocale, type AppLocale } from './locale.ts'

export type StoredLocale = {
  locale: AppLocale
  updatedAt: string
}

const GUEST_KEY = 'blanky.locale'

function deviceKey(userId: string): string {
  return `blanky.locale.${userId}`
}

function readStored(key: string): StoredLocale | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as { locale?: unknown; updatedAt?: unknown }
    const locale = parseLocale(value.locale)
    if (!locale) return null
    if (typeof value.updatedAt !== 'string' || !value.updatedAt) return null
    return { locale, updatedAt: value.updatedAt }
  } catch {
    return null
  }
}

function writeStored(key: string, locale: AppLocale, updatedAt: string): void {
  localStorage.setItem(key, JSON.stringify({ locale, updatedAt }))
}

export function readGuestLocale(): StoredLocale | null {
  return readStored(GUEST_KEY)
}

export function writeGuestLocale(locale: AppLocale, updatedAt = new Date().toISOString()): void {
  writeStored(GUEST_KEY, locale, updatedAt)
}

export function readDeviceLocale(userId: string): StoredLocale | null {
  return readStored(deviceKey(userId))
}

export function writeDeviceLocale(userId: string, locale: AppLocale, updatedAt = new Date().toISOString()): void {
  writeStored(deviceKey(userId), locale, updatedAt)
}

export function touchDeviceLocale(userId: string, locale: AppLocale): void {
  const current = readDeviceLocale(userId)
  if (current?.locale === locale) return
  writeDeviceLocale(userId, locale)
}

export function guestOrBrowserLocale(): AppLocale {
  return readGuestLocale()?.locale ?? detectBrowserLocale()
}

export function applyDocumentLocale(locale: AppLocale): void {
  document.documentElement.lang = locale
}
