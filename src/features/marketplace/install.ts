import { cloneBlocks, createPage, type BuilderBlock, type UserPage } from '../builder/schema.ts'
import { flatten, type Block, type CustomRecordType, type FieldValue } from '../records/schema.ts'
import { remapCollections } from '../workspace/templates.ts'
import type { TemplateSample, TemplateSnapshot } from './schema.ts'
import { coerceSnapshot } from './sanitize.ts'
import type { CustomRecord } from '../../types/records.ts'

export type InstalledTemplate = {
  page: UserPage
  collections: CustomRecordType[]
  records: CustomRecord[]
}

function cloneFields(blocks: readonly Block[], fields: Map<string, string>): Block[] {
  return blocks.map((block) => {
    const fieldKey = block.fieldKey ? crypto.randomUUID() : undefined
    if (block.fieldKey && fieldKey) fields.set(block.fieldKey, fieldKey)
    return {
      id: crypto.randomUUID(),
      type: block.type,
      fieldKey,
      props: {
        ...block.props,
        options: block.props.options?.map((option) => ({ ...option, id: crypto.randomUUID() })),
        items: block.props.items?.map((item) => ({ ...item, id: crypto.randomUUID() })),
      },
      children: block.children ? cloneFields(block.children, fields) : undefined,
    }
  })
}

function remapValues(values: Record<string, FieldValue>, fields: Map<string, string>): Record<string, FieldValue> {
  const next: Record<string, FieldValue> = {}
  for (const [key, value] of Object.entries(values)) {
    const mapped = fields.get(key)
    if (mapped) next[mapped] = value
  }
  return next
}

export function forkSnapshot(snapshot: TemplateSnapshot): InstalledTemplate {
  const remap = new Map<string, string>()
  const fieldMaps = new Map<string, Map<string, string>>()
  const now = new Date().toISOString()
  const collections: CustomRecordType[] = []
  for (const source of snapshot.collections) {
    const nextId = crypto.randomUUID()
    const fields = new Map<string, string>()
    remap.set(source.id, nextId)
    fieldMaps.set(source.id, fields)
    collections.push({
      ...source,
      id: nextId,
      blocks: cloneFields(source.blocks, fields),
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
  }
  const blocks = remapCollections(cloneBlocks(snapshot.blocks), remap)
  const records = snapshot.samples.flatMap((sample) => {
    const typeId = remap.get(sample.collectionId)
    const fields = fieldMaps.get(sample.collectionId)
    if (!typeId || !fields) return []
    return [{
      id: crypto.randomUUID(),
      typeId,
      title: sample.title,
      values: remapValues(sample.values, fields),
      templateVersion: 1,
      createdAt: now,
      updatedAt: now,
    }]
  })
  const page = createPage(snapshot.title, snapshot.icon, blocks)
  page.description = snapshot.description
  page.collections = collections
  return { page, collections, records }
}

export function installSnapshot(value: unknown): InstalledTemplate {
  const snapshot = coerceSnapshot(value)
  if (!snapshot) throw new Error('템플릿 스냅샷이 올바르지 않습니다.')
  return forkSnapshot(snapshot)
}

export function sampleFromRecord(collectionId: string, record: { title: string; values: Record<string, FieldValue> }): TemplateSample {
  return { collectionId, title: record.title, values: { ...record.values } }
}

export function shapeKey(blocks: readonly BuilderBlock[]): string {
  return blocks.map((block) => `${block.type}:${block.props.view ?? ''}:${block.children ? shapeKey(block.children) : ''}`).join('|')
}

export function collectionShape(type: CustomRecordType): string {
  return flatten(type.blocks).map((block) => `${block.type}:${block.props.label ?? ''}`).join('|')
}

export function sameInstallShape(source: TemplateSnapshot, installed: InstalledTemplate): boolean {
  if (source.collections.length !== installed.collections.length) return false
  if (shapeKey(source.blocks) !== shapeKey(installed.page.blocks)) return false
  const sourceShapes = source.collections.map(collectionShape).sort()
  const destShapes = installed.collections.map(collectionShape).sort()
  return sourceShapes.every((item, index) => item === destShapes[index])
}
