import { catalogs } from './catalogs.ts'
import { DEFAULT_LOCALE, type AppLocale } from './locale.ts'

function lookup(node: unknown, path: string[]): unknown {
  let current = node
  for (const part of path) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

export function translate(locale: AppLocale, key: string, vars?: Record<string, string | number>): string {
  const path = key.split('.').filter(Boolean)
  const value = lookup(catalogs[locale], path) ?? lookup(catalogs[DEFAULT_LOCALE], path)
  if (typeof value === 'string') return interpolate(value, vars)
  return path[path.length - 1] ?? key
}

export function createTranslator(locale: AppLocale) {
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
}
