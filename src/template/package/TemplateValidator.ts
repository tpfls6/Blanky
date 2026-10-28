import { createBlock as createPageBlock, coercePage } from '../../features/builder/schema.ts'
import { SNAPSHOT_LIMITS, type TemplateSample, type TemplateSnapshot } from '../../features/marketplace/schema.ts'
import {
  coerceFieldLabels,
  coerceTemplate,
  isPageTemplate,
  type PageTemplateKind,
} from '../../features/pages/templates.ts'
import {
  cloneBlock,
  coerceRecordType,
  flatten,
  parseTemplateFile,
  TEMPLATE_KIND,
  validateField,
  type Block,
  type CustomRecordType,
} from '../../features/records/schema.ts'
import { LIMITS, decoder, fromBase64, packageError, safePath } from '../../theme/package/limits.ts'
import { validateAsset } from '../../theme/package/ThemeValidator.ts'
import {
  TEMPLATE_FORMAT_VERSION,
  TEMPLATE_PACKAGE_KIND,
  isTemplatePageType,
  type TemplateAsset,
  type TemplateManifest,
  type TemplatePackage,
  type TemplatePageType,
} from './schema.ts'

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function text(value: unknown, max: number, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || value.length > max) packageError('템플릿 텍스트 형식이 올바르지 않습니다.')
  return value
}

function mapping(value: unknown): Record<string, string> {
  if (value === undefined) return {}
  if (!record(value) || Object.keys(value).length > 32) packageError('잘못된 asset mapping입니다.')
  const out: Record<string, string> = {}
  for (const [key, path] of Object.entries(value)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)) packageError('잘못된 asset 이름입니다.')
    out[key] = safePath(text(path, 200))
  }
  return out
}

export function validateManifest(value: unknown): TemplateManifest {
  if (!record(value)) packageError('manifest가 필요합니다.')
  if (value.formatVersion !== TEMPLATE_FORMAT_VERSION) {
    packageError('이 템플릿은 현재 Blanky 버전에서 지원하지 않는 형식입니다. 템플릿 형식: ' + String(value.formatVersion) + ' / 현재 지원: ' + TEMPLATE_FORMAT_VERSION)
  }
  if (value.kind !== undefined && value.kind !== TEMPLATE_PACKAGE_KIND) packageError('이 파일은 Blanky 템플릿이 아닙니다.')
  const id = text(value.id, 100)
  const version = text(value.version, 50)
  const name = text(value.name, SNAPSHOT_LIMITS.maxName)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id) || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version) || !name.trim()) {
    packageError('템플릿 ID, 이름 또는 버전이 올바르지 않습니다.')
  }
  const pageType = isTemplatePageType(value.pageType) ? value.pageType : 'page'
  const entry = record(value.entry) ? value.entry : { template: 'template.json' }
  const template = safePath(text(entry.template ?? 'template.json', 200, 'template.json'))
  if (template === 'manifest.json' || !template.endsWith('.json')) packageError('entry 파일 형식이 올바르지 않습니다.')
  const assets = mapping(value.assets)
  const preview = value.preview === undefined ? undefined : safePath(text(value.preview, 200))
  const fieldLabels = isPageTemplate(pageType) ? coerceFieldLabels(value.fieldLabels, pageType) : undefined
  const icon = text(value.icon ?? 'StickyNote', 40, 'StickyNote').trim() || 'StickyNote'
  return {
    formatVersion: 1,
    kind: TEMPLATE_PACKAGE_KIND,
    id,
    name: name.trim(),
    description: text(value.description ?? '', SNAPSHOT_LIMITS.maxDescription),
    author: text(value.author ?? '', 100),
    version,
    pageType,
    entry: { template },
    assets,
    icon,
    ...(preview ? { preview } : {}),
    ...(fieldLabels && Object.keys(fieldLabels).length ? { fieldLabels } : {}),
  }
}

function isSample(value: unknown): value is TemplateSample {
  if (!record(value)) return false
  return typeof value.collectionId === 'string' && typeof value.title === 'string' && !!value.values && typeof value.values === 'object'
}

function scrubBlocks(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    const next = { ...block, props: { ...block.props }, children: block.children ? scrubBlocks(block.children) : undefined }
    if ((next.type === 'url' || next.type === 'image') && typeof next.props.defaultValue === 'string' && !validateField(next.type, next.props.defaultValue)) {
      delete next.props.defaultValue
    }
    return next
  })
}

function countPageBlocks(blocks: TemplateSnapshot['blocks']): number {
  return blocks.reduce((sum, block) => sum + 1 + (block.children ? countPageBlocks(block.children) : 0), 0)
}

export function readSnapshot(value: unknown): TemplateSnapshot | null {
  if (!record(value)) return null
  const page = coercePage({
    id: typeof value.id === 'string' ? value.id : 'snapshot',
    name: typeof value.title === 'string' ? value.title : typeof value.name === 'string' ? value.name : '템플릿',
    icon: typeof value.icon === 'string' ? value.icon : 'StickyNote',
    description: typeof value.description === 'string' ? value.description : '',
    blocks: value.blocks,
    collections: value.collections,
  })
  if (!page) return null
  const collections = (page.collections ?? []).slice(0, SNAPSHOT_LIMITS.maxCollections).map((item) => ({
    ...item,
    blocks: scrubBlocks(item.blocks),
  }))
  if (countPageBlocks(page.blocks) > SNAPSHOT_LIMITS.maxBlocks) packageError('블록이 너무 많습니다.')
  for (const item of collections) {
    if (flatten(item.blocks).length > SNAPSHOT_LIMITS.maxFields) packageError('필드가 너무 많습니다.')
  }
  const snapshot: TemplateSnapshot = {
    version: 1,
    title: page.name,
    icon: page.icon,
    description: page.description,
    blocks: page.blocks.map((block) => {
      if (block.type !== 'image' && block.type !== 'link' && block.type !== 'bookmark' && block.type !== 'button') return block
      const url = block.props.url ?? ''
      if (!url || validateField('url', url) || validateField('image', url)) return block
      return { ...block, props: { ...block.props, url: '' } }
    }),
    collections,
    samples: Array.isArray(value.samples) ? value.samples.filter(isSample).slice(0, SNAPSHOT_LIMITS.maxSamples) : [],
    guide: typeof value.guide === 'string' ? value.guide.slice(0, SNAPSHOT_LIMITS.maxGuide) : '',
  }
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length
  if (bytes > SNAPSHOT_LIMITS.maxBytes) packageError('템플릿이 너무 큽니다.')
  return snapshot
}

export function snapshotFromRecordType(type: CustomRecordType): TemplateSnapshot {
  return {
    version: 1,
    title: type.name,
    icon: type.icon,
    description: type.description,
    blocks: [
      createPageBlock('heading', { level: 1, text: type.name, span: 3 }),
      createPageBlock('collection', { collectionId: type.id, view: 'table', text: type.name, span: 3 }),
    ],
    collections: [{ ...type, blocks: scrubBlocks(type.blocks.map(cloneBlock)) }],
    samples: [],
    guide: '',
  }
}

export function snapshotFromUnknown(value: unknown): TemplateSnapshot | null {
  const parsed = parseTemplateFile(value)
  if (parsed.ok) {
    const type = coerceRecordType({
      id: 'import',
      name: parsed.file.name,
      icon: parsed.file.icon,
      color: parsed.file.color,
      description: parsed.file.description,
      blocks: parsed.file.blocks,
    })
    return type ? snapshotFromRecordType(type) : null
  }
  if (record(value) && value.kind === TEMPLATE_KIND) return null
  return readSnapshot(value)
}

function inferPageType(snapshot: TemplateSnapshot | null, fallback: TemplatePageType): TemplatePageType {
  if (isPageTemplate(fallback)) return fallback
  if (!snapshot) return fallback
  if (fallback === 'record' || fallback === 'page') return fallback
  return snapshot.collections.length && snapshot.blocks.some((block) => block.type === 'collection') ? 'page' : 'record'
}

export function validateTemplateAsset(path: string, bytes: Uint8Array): TemplateAsset {
  const file = validateAsset(path, bytes, path.startsWith('assets/icons/') || /(^|\/)icon\./i.test(path))
  if (!file.mime.startsWith('image/')) packageError('템플릿 자산은 이미지 파일만 사용할 수 있습니다: ' + path)
  if (!file.data) packageError('손상된 자산입니다: ' + path)
  return { mime: file.mime, data: file.data }
}

export function validatePackage(input: unknown): TemplatePackage {
  if (!record(input)) packageError('템플릿 패키지가 필요합니다.')
  const manifest = validateManifest(input.manifest ?? input)
  const filesIn = record(input.files) ? input.files : {}
  const files: Record<string, TemplateAsset> = {}
  for (const [path, file] of Object.entries(filesIn)) {
    safePath(path)
    if (!path.startsWith('assets/') && !path.startsWith('preview/')) packageError('허용되지 않은 패키지 파일입니다: ' + path)
    if (!record(file) || typeof file.mime !== 'string' || typeof file.data !== 'string') packageError('손상된 자산입니다: ' + path)
    const bytes = fromBase64(file.data)
    files[path] = validateTemplateAsset(path, bytes)
  }
  for (const path of Object.values(manifest.assets)) {
    if (!files[path]) packageError('asset 파일이 없습니다: ' + path)
  }
  if (manifest.preview && !files[manifest.preview]) packageError('미리보기 파일이 없습니다: ' + manifest.preview)
  const rawSnapshot = input.snapshot ?? (record(input.template) ? input.template : undefined)
  let snapshot: TemplateSnapshot | null = null
  if (rawSnapshot !== undefined) {
    snapshot = snapshotFromUnknown(rawSnapshot)
    if (!snapshot) packageError('템플릿 구조가 올바르지 않습니다.')
  } else if (!isPageTemplate(manifest.pageType)) {
    packageError('템플릿 본문이 없습니다.')
  }
  if (Object.keys(files).length > LIMITS.files) packageError('파일 수 제한을 초과했습니다.')
  return {
    manifest: {
      ...manifest,
      pageType: inferPageType(snapshot, manifest.pageType),
      icon: snapshot?.icon || manifest.icon,
    },
    snapshot,
    files,
  }
}

function packageFromSnapshot(snapshot: TemplateSnapshot, value: Record<string, unknown>, index = 0): TemplatePackage {
  const parsed = parseTemplateFile(value)
  const version = typeof value.version === 'string' && /^\d+\.\d+\.\d+/.test(value.version) ? value.version : '1.0.0'
  return validatePackage({
    formatVersion: 1,
    kind: TEMPLATE_PACKAGE_KIND,
    id: parsed.ok ? slugId(parsed.file.name, index) : slugId(snapshot.title, index),
    name: snapshot.title,
    description: snapshot.description,
    author: typeof value.author === 'string' ? value.author : '',
    version,
    pageType: 'record',
    icon: snapshot.icon,
    snapshot,
  })
}

export function packagesFromUnknown(value: unknown): TemplatePackage[] {
  if (Array.isArray(value)) {
    if (!value.length) packageError('템플릿이 비어 있습니다.')
    return value.map((item, index) => {
      const snapshot = snapshotFromUnknown(item)
      if (!snapshot || !record(item)) packageError('템플릿 구조가 올바르지 않습니다. (' + (index + 1) + ')')
      return packageFromSnapshot(snapshot, item, index)
    })
  }
  if (record(value) && value.kind !== TEMPLATE_PACKAGE_KIND && (value.kind === TEMPLATE_KIND || Array.isArray(value.blocks))) {
    const snapshot = snapshotFromUnknown(value)
    if (!snapshot) packageError('템플릿 구조가 올바르지 않습니다.')
    return [packageFromSnapshot(snapshot, value)]
  }
  return [validatePackage(value)]
}

function slugId(name: string, index = 0): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const suffix = index ? '-' + (index + 1) : ''
  return (ascii || 'template') + suffix
}

export function systemPageType(value: TemplatePageType): PageTemplateKind | null {
  return coerceTemplate(value)
}

export function decodeJson(bytes: Uint8Array): unknown {
  if (!bytes.length || bytes.length > LIMITS.json) packageError('JSON 파일이 없거나 너무 큽니다.')
  if (bytes[0] === 60) packageError('HTML 또는 스크립트 파일은 사용할 수 없습니다.')
  try {
    return JSON.parse(decoder.decode(bytes))
  } catch {
    packageError('잘못된 JSON 파일입니다.')
  }
}
