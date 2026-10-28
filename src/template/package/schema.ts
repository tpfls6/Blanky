import type { TemplateSnapshot } from '../../features/marketplace/schema.ts'

export const TEMPLATE_FORMAT_VERSION = 1
export const TEMPLATE_PACKAGE_KIND = 'blanky.template-package'
export const TEMPLATE_PACKAGE_EXTENSION = '.blankytpl'
export const TEMPLATE_PACKAGE_IMPORT_EXTS = ['.blankytpl', '.json'] as const
export const TEMPLATE_PAGE_TYPES = ['page', 'record', 'diary', 'reading', 'memo'] as const

export type TemplatePageType = (typeof TEMPLATE_PAGE_TYPES)[number]

export function isTemplatePackageFile(name: string): boolean {
  const lower = name.toLowerCase()
  return TEMPLATE_PACKAGE_IMPORT_EXTS.some((ext) => lower.endsWith(ext))
}

export type TemplateManifest = {
  formatVersion: 1
  kind: typeof TEMPLATE_PACKAGE_KIND
  id: string
  name: string
  description: string
  author: string
  version: string
  pageType: TemplatePageType
  entry: { template: string }
  assets: Record<string, string>
  icon: string
  preview?: string
  fieldLabels?: Record<string, string>
}

export type TemplateAsset = {
  mime: string
  data: string
}

export type TemplatePackage = {
  manifest: TemplateManifest
  snapshot: TemplateSnapshot | null
  files: Record<string, TemplateAsset>
}

export type InstalledTemplatePackage = TemplatePackage & {
  installedId: string
  installedAt: string
}

export function isTemplatePageType(value: unknown): value is TemplatePageType {
  return typeof value === 'string' && (TEMPLATE_PAGE_TYPES as readonly string[]).includes(value)
}

export function compareSemver(a: string, b: string): number {
  const parse = (value: string) => {
    const [core] = value.split('-')
    const parts = (core ?? '0.0.0').split('.').map((item) => Number(item) || 0)
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0] as const
  }
  const left = parse(a)
  const right = parse(b)
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}
