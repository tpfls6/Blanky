import { coerceBlock, coercePage, type BuilderBlock } from '../builder/schema.ts'
import { coerceRecordType, flatten, type CustomRecordType, type FieldValue } from '../records/schema.ts'
import { snapshotCollections } from '../workspace/templates.ts'
import {
  SNAPSHOT_LIMITS,
  TEMPLATE_CATEGORIES,
  type PublishInput,
  type TemplateSample,
  type TemplateSnapshot,
} from './schema.ts'

const PII = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\+?\d[\d\s\-()]{8,}\d)|(sk-[A-Za-z0-9]{20,})|(Bearer\s+[A-Za-z0-9._\-]{12,})|(eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,})|(AIza[0-9A-Za-z_\-]{20,})|(supabase\.co\/storage\/v1\/object\/sign)/i
const SAFE_URL = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i

export type SanitizeIssue = { code: string; message: string }

export class SanitizeError extends Error {
  issues: SanitizeIssue[]
  constructor(issues: SanitizeIssue[]) {
    super(issues[0]?.message ?? '템플릿을 공유할 수 없습니다.')
    this.name = 'SanitizeError'
    this.issues = issues
  }
}

export function safeHttpsUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!SAFE_URL.test(trimmed) || trimmed.length > 500) return null
  try {
    const url = new URL(trimmed)
    if (url.username || url.password || url.protocol !== 'https:') return null
    if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) return null
    return url.toString()
  } catch {
    return null
  }
}

function textHasPii(value: string): boolean {
  return PII.test(value)
}

function walkBlocks(blocks: readonly BuilderBlock[], depth: number, issues: SanitizeIssue[]): BuilderBlock[] {
  if (depth > SNAPSHOT_LIMITS.maxNest) {
    issues.push({ code: 'nest', message: '블록 중첩이 너무 깊습니다.' })
    return []
  }
  return blocks.flatMap((block) => {
    const next = coerceBlock(block)
    if (!next) return []
    if (next.props.url) {
      const url = safeHttpsUrl(next.props.url)
      if (url === null) {
        issues.push({ code: 'url', message: '허용되지 않는 링크가 있습니다.' })
        return []
      }
      next.props.url = url
    }
    if (next.props.text && textHasPii(next.props.text)) {
      issues.push({ code: 'pii', message: '블록 텍스트에 개인정보가 있습니다.' })
      return []
    }
    if (next.children) next.children = walkBlocks(next.children, depth + 1, issues)
    return [next]
  })
}

function countBlocks(blocks: readonly BuilderBlock[]): number {
  return blocks.reduce((sum, block) => sum + 1 + (block.children ? countBlocks(block.children) : 0), 0)
}

function cleanSamples(samples: readonly TemplateSample[], collections: readonly CustomRecordType[], issues: SanitizeIssue[]): TemplateSample[] {
  const ids = new Set(collections.map((item) => item.id))
  const keys = new Map(collections.map((item) => [item.id, new Set(flatten(item.blocks).flatMap((block) => (block.fieldKey ? [block.fieldKey] : [])))]))
  const out: TemplateSample[] = []
  for (const sample of samples.slice(0, SNAPSHOT_LIMITS.maxSamples)) {
    if (!ids.has(sample.collectionId)) continue
    const allowed = keys.get(sample.collectionId)
    const values: Record<string, FieldValue> = {}
    let dirty = false
    for (const [key, value] of Object.entries(sample.values)) {
      if (!allowed?.has(key)) continue
      if (typeof value === 'string') {
        if (textHasPii(value)) {
          dirty = true
          break
        }
        if (/^https?:\/\//i.test(value) && safeHttpsUrl(value) === null) {
          dirty = true
          break
        }
      }
      values[key] = value
    }
    if (dirty) {
      issues.push({ code: 'sample', message: '예제 데이터에 개인정보나 위험한 링크가 있습니다.' })
      continue
    }
    const title = sample.title.trim().slice(0, 80)
    if (title && textHasPii(title)) {
      issues.push({ code: 'sample', message: '예제 제목에 개인정보가 있습니다.' })
      continue
    }
    out.push({ collectionId: sample.collectionId, title, values })
  }
  return out
}

export function packageSnapshot(input: PublishInput): TemplateSnapshot {
  const issues: SanitizeIssue[] = []
  const name = input.name.trim().slice(0, SNAPSHOT_LIMITS.maxName)
  if (!name) issues.push({ code: 'name', message: '템플릿 이름을 입력해 주세요.' })
  const description = input.description.trim().slice(0, SNAPSHOT_LIMITS.maxDescription)
  const guide = input.guide.trim().slice(0, SNAPSHOT_LIMITS.maxGuide)
  if (textHasPii(name) || textHasPii(description) || textHasPii(guide)) {
    issues.push({ code: 'pii', message: '이름, 설명, 가이드에 개인정보를 넣을 수 없습니다.' })
  }
  const page = coercePage({ ...input.source, name, description, blocks: input.source.blocks })
  if (!page) issues.push({ code: 'page', message: '페이지 구조를 읽지 못했습니다.' })
  const blocks = page ? walkBlocks(page.blocks, 0, issues) : []
  if (countBlocks(blocks) > SNAPSHOT_LIMITS.maxBlocks) issues.push({ code: 'size', message: '블록이 너무 많습니다.' })
  const collections = snapshotCollections(blocks, input.source.collections ?? []).flatMap((item) => {
    const next = coerceRecordType(item)
    return next ? [next] : []
  })
  if (collections.length > SNAPSHOT_LIMITS.maxCollections) issues.push({ code: 'size', message: '컬렉션이 너무 많습니다.' })
  for (const item of collections) {
    if (flatten(item.blocks).length > SNAPSHOT_LIMITS.maxFields) issues.push({ code: 'size', message: '필드가 너무 많습니다.' })
    if (textHasPii(item.name) || textHasPii(item.description)) issues.push({ code: 'pii', message: '컬렉션 이름에 개인정보가 있습니다.' })
  }
  const samples = cleanSamples(input.samples, collections, issues)
  const snapshot: TemplateSnapshot = {
    version: 1,
    title: name || page?.name || '템플릿',
    icon: page?.icon || 'StickyNote',
    description,
    blocks,
    collections,
    samples,
    guide,
  }
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length
  if (bytes > SNAPSHOT_LIMITS.maxBytes) issues.push({ code: 'size', message: '템플릿이 너무 큽니다.' })
  if (issues.length) throw new SanitizeError(issues)
  return snapshot
}

export function coerceSnapshot(value: unknown): TemplateSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const page = coercePage({
    id: 'snapshot',
    name: typeof row.title === 'string' ? row.title : '템플릿',
    icon: typeof row.icon === 'string' ? row.icon : 'StickyNote',
    description: typeof row.description === 'string' ? row.description : '',
    blocks: row.blocks,
    collections: row.collections,
  })
  if (!page) return null
  try {
    return packageSnapshot({
      source: page,
      name: page.name,
      description: page.description,
      category: 'free',
      tags: [],
      thumbnailUrl: '',
      gallery: [],
      language: 'ko',
      guide: typeof row.guide === 'string' ? row.guide : '',
      samples: Array.isArray(row.samples) ? row.samples.filter(isSample) : [],
    })
  } catch {
    return null
  }
}

function isSample(value: unknown): value is TemplateSample {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.collectionId === 'string' && typeof row.title === 'string' && !!row.values && typeof row.values === 'object'
}

export function cleanMeta(input: {
  name: string
  description: string
  category: string
  tags: string[]
  thumbnailUrl: string
  gallery: string[]
  language: string
}): { name: string; description: string; category: string; tags: string[]; thumbnailUrl: string; gallery: string[]; language: 'ko' | 'en' } {
  const issues: SanitizeIssue[] = []
  const name = input.name.trim().slice(0, SNAPSHOT_LIMITS.maxName)
  if (!name) issues.push({ code: 'name', message: '템플릿 이름을 입력해 주세요.' })
  const description = input.description.trim().slice(0, SNAPSHOT_LIMITS.maxDescription)
  const category = (TEMPLATE_CATEGORIES as readonly string[]).includes(input.category) ? input.category : 'free'
  const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, SNAPSHOT_LIMITS.maxTags)
  if (tags.some((tag) => tag.length > SNAPSHOT_LIMITS.maxTag || textHasPii(tag))) issues.push({ code: 'tag', message: '태그를 확인해 주세요.' })
  const thumbnailUrl = input.thumbnailUrl ? safeHttpsUrl(input.thumbnailUrl) : ''
  if (input.thumbnailUrl && thumbnailUrl === null) issues.push({ code: 'url', message: '대표 이미지는 HTTPS URL이어야 합니다.' })
  const gallery = input.gallery.slice(0, SNAPSHOT_LIMITS.maxGallery).flatMap((item) => {
    const url = safeHttpsUrl(item)
    return url ? [url] : []
  })
  if (textHasPii(name) || textHasPii(description)) issues.push({ code: 'pii', message: '이름이나 설명에 개인정보가 있습니다.' })
  if (issues.length) throw new SanitizeError(issues)
  return {
    name,
    description,
    category,
    tags,
    thumbnailUrl: thumbnailUrl || '',
    gallery,
    language: input.language === 'en' ? 'en' : 'ko',
  }
}
