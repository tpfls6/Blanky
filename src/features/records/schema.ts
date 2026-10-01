import { DEFAULT_SWATCH, SWATCHES } from '../../constants/swatches.ts'

export const SCHEMA_VERSION = 1
/** Toggle children only. A toggle cannot contain another toggle. */
export const MAX_NEST = 1

export const BLOCK_TYPES = [
  'title',
  'text',
  'heading',
  'divider',
  'callout',
  'quote',
  'toggle',
  'spacer',
  'checklist',
  'textField',
  'longText',
  'number',
  'date',
  'time',
  'dateTime',
  'checkbox',
  'select',
  'multiSelect',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export type FieldValue = string | number | boolean | string[]

export type SelectOption = {
  id: string
  label: string
  color: string
}

export type CheckItem = {
  id: string
  label: string
  checked: boolean
}

export type BlockProps = {
  text?: string
  level?: 1 | 2 | 3
  label?: string
  placeholder?: string
  required?: boolean
  defaultValue?: string | number | boolean
  unit?: string
  min?: number | null
  max?: number | null
  includeTime?: boolean
  options?: SelectOption[]
  title?: string
  defaultOpen?: boolean
  icon?: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
  width?: 'full' | 'half'
  items?: CheckItem[]
  locked?: boolean
}

export type Block = {
  id: string
  type: BlockType
  fieldKey?: string
  props: BlockProps
  children?: Block[]
}

export type CustomRecordType = {
  id: string
  name: string
  icon: string
  color: string
  description: string
  schemaVersion: number
  version: number
  blocks: Block[]
  createdAt: string
  updatedAt: string
}

export type RenderMode = 'edit-template' | 'fill-record' | 'read-only'

export const TEMPLATE_KIND = 'blanky.custom-record-template'

const FIELD_BLOCKS = new Set<BlockType>([
  'title',
  'textField',
  'longText',
  'number',
  'date',
  'time',
  'dateTime',
  'checkbox',
  'select',
  'multiSelect',
])

const LEGACY_TYPE: Record<string, BlockType> = {
  text: 'textField',
  longText: 'longText',
  number: 'number',
  date: 'date',
  time: 'time',
  checkbox: 'checkbox',
  select: 'select',
  multiSelect: 'multiSelect',
}

export function isFieldBlock(type: BlockType): boolean {
  return FIELD_BLOCKS.has(type)
}

export function flatten(blocks: readonly Block[]): Block[] {
  const out: Block[] = []
  const walk = (list: readonly Block[]) => {
    for (const block of list) {
      out.push(block)
      if (block.children) walk(block.children)
    }
  }
  walk(blocks)
  return out
}

export function countBlocks(blocks: readonly Block[]): number {
  return flatten(blocks).length
}

export type FoundBlock = {
  block: Block
  parent: Block | null
  index: number
  depth: number
}

export function findBlock(blocks: readonly Block[], id: string, parent: Block | null = null, depth = 0): FoundBlock | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (!block) continue
    if (block.id === id) return { block, parent, index, depth }
    if (block.children) {
      const found = findBlock(block.children, id, block, depth + 1)
      if (found) return found
    }
  }
  return null
}

function contains(block: Block, id: string): boolean {
  if (block.id === id) return true
  return (block.children ?? []).some((child) => contains(child, id))
}

function canPlace(block: Block, parent: Block | null): boolean {
  if (!parent) return true
  if (parent.type !== 'toggle') return false
  if (block.type === 'toggle' || block.type === 'title') return false
  return true
}

function insertInto(list: readonly Block[], block: Block, index: number): Block[] {
  const next = [...list]
  const at = Math.max(0, Math.min(index, next.length))
  next.splice(at, 0, block)
  return next
}

function replaceChildren(blocks: readonly Block[], parentId: string, children: Block[]): Block[] {
  return blocks.map((block) => {
    if (block.id === parentId) return { ...block, children }
    if (!block.children) return block
    return { ...block, children: replaceChildren(block.children, parentId, children) }
  })
}

function without(blocks: readonly Block[], id: string): Block[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) => (block.children ? { ...block, children: without(block.children, id) } : block))
}

export function insertBlock(blocks: readonly Block[], block: Block, parentId: string | null, index: number): Block[] {
  const parent = parentId ? (findBlock(blocks, parentId)?.block ?? null) : null
  if (parentId && !parent) return [...blocks]
  if (!canPlace(block, parent)) return [...blocks]
  if (!parentId || !parent) return insertInto(blocks, block, index)
  return replaceChildren(blocks, parent.id, insertInto(parent.children ?? [], block, index))
}

export function moveBlock(blocks: readonly Block[], id: string, parentId: string | null, index: number): Block[] {
  const from = findBlock(blocks, id)
  if (!from) return [...blocks]
  const parent = parentId ? (findBlock(blocks, parentId)?.block ?? null) : null
  if (parentId && !parent) return [...blocks]
  if (!canPlace(from.block, parent)) return [...blocks]
  if (parent && contains(from.block, parent.id)) return [...blocks]
  const sameParent = (from.parent?.id ?? null) === parentId
  let nextIndex = index
  if (sameParent && from.index < index) nextIndex -= 1
  if (sameParent && from.index === nextIndex) return [...blocks]
  return insertBlock(without(blocks, id), from.block, parentId, nextIndex)
}

export function removeBlock(blocks: readonly Block[], id: string): Block[] {
  const found = findBlock(blocks, id)
  if (!found || found.block.type === 'title') return [...blocks]
  return without(blocks, id)
}

export function patchBlock(blocks: readonly Block[], id: string, props: Partial<BlockProps>): Block[] {
  return blocks.map((block) => {
    if (block.id === id) return { ...block, props: { ...block.props, ...props } }
    if (!block.children) return block
    return { ...block, children: patchBlock(block.children, id, props) }
  })
}

export function cloneBlock(block: Block): Block {
  const copy: Block = {
    id: crypto.randomUUID(),
    type: block.type,
    props: {
      ...block.props,
      options: block.props.options?.map((option) => ({ ...option, id: crypto.randomUUID() })),
      items: block.props.items?.map((item) => ({ ...item, id: crypto.randomUUID() })),
    },
    fieldKey: block.fieldKey ? crypto.randomUUID() : undefined,
    children: block.children?.map(cloneBlock),
  }
  return copy
}

export function duplicateBlock(blocks: readonly Block[], id: string): Block[] {
  const found = findBlock(blocks, id)
  if (!found || found.block.type === 'title') return [...blocks]
  return insertBlock(blocks, cloneBlock(found.block), found.parent?.id ?? null, found.index + 1)
}

export function structureKey(blocks: readonly Block[]): string {
  return JSON.stringify(
    blocks.map((block) => [block.id, block.type, block.fieldKey ?? '', block.children ? structureKey(block.children) : '']),
  )
}

export function blankValues(blocks: readonly Block[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {}
  for (const block of flatten(blocks)) {
    if (!block.fieldKey) continue
    const fallback = block.props.defaultValue
    if (block.type === 'checkbox') values[block.fieldKey] = fallback === true
    else if (block.type === 'multiSelect') values[block.fieldKey] = []
    else if (block.type === 'number') values[block.fieldKey] = typeof fallback === 'number' ? fallback : ''
    else values[block.fieldKey] = typeof fallback === 'string' ? fallback : ''
  }
  return values
}

export function hydrateValues(
  blocks: readonly Block[],
  stored: Record<string, FieldValue>,
  title: string,
): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = { ...blankValues(blocks), ...stored }
  const heading = flatten(blocks).find((block) => block.type === 'title' && block.fieldKey)
  if (!heading?.fieldKey) return values
  const current = values[heading.fieldKey]
  if ((current === '' || current === undefined) && title) values[heading.fieldKey] = title
  return values
}

export function titleFrom(blocks: readonly Block[], values: Record<string, FieldValue>, fallback: string): string {
  const heading = flatten(blocks).find((block) => block.type === 'title' && block.fieldKey)
  const value = heading?.fieldKey ? values[heading.fieldKey] : ''
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback
}

export function requiredError(blocks: readonly Block[], values: Record<string, FieldValue>): string | null {
  for (const block of flatten(blocks)) {
    if (!block.fieldKey || !block.props.required) continue
    const value = values[block.fieldKey]
    const label = block.props.label?.trim() || '필드'
    if (block.type === 'checkbox') {
      if (value !== true) return `${label}을 확인해 주세요.`
      continue
    }
    if (block.type === 'multiSelect') {
      if (!Array.isArray(value) || value.length === 0) return `${label}을 선택해 주세요.`
      continue
    }
    if (block.type === 'number') {
      if (typeof value !== 'number') return `${label}을 입력해 주세요.`
      if (block.props.min != null && value < block.props.min) return `${label}은 ${block.props.min} 이상이어야 합니다.`
      if (block.props.max != null && value > block.props.max) return `${label}은 ${block.props.max} 이하여야 합니다.`
      continue
    }
    if (typeof value !== 'string' || !value.trim()) return `${label}을 입력해 주세요.`
  }
  return null
}

export function captureTarget(blocks: readonly Block[]): string | null {
  const list = flatten(blocks)
  const text = list.find((block) => block.fieldKey && (block.type === 'textField' || block.type === 'longText'))
  if (text?.fieldKey) return text.fieldKey
  return list.find((block) => block.type === 'title' && block.fieldKey)?.fieldKey ?? null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function optionColor(index: number): string {
  return SWATCHES[index % SWATCHES.length]?.hex ?? DEFAULT_SWATCH
}

function readOptions(value: unknown): SelectOption[] | undefined {
  if (!Array.isArray(value)) return undefined
  const options: SelectOption[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      options.push({ id: item, label: item, color: optionColor(options.length) })
      continue
    }
    const row = asRecord(item)
    if (!row || typeof row.label !== 'string' || !row.label.trim()) continue
    options.push({
      id: typeof row.id === 'string' && row.id ? row.id : row.label,
      label: row.label,
      color: typeof row.color === 'string' ? row.color : optionColor(options.length),
    })
  }
  return options
}

function readItems(value: unknown): CheckItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items: CheckItem[] = []
  for (const item of value) {
    const row = asRecord(item)
    if (!row || typeof row.label !== 'string') continue
    items.push({
      id: typeof row.id === 'string' && row.id ? row.id : crypto.randomUUID(),
      label: row.label,
      checked: row.checked === true,
    })
  }
  return items
}

function readLevel(value: unknown): 1 | 2 | 3 {
  return value === 1 || value === 3 ? value : 2
}

function normalizeBlock(value: unknown, depth: number): Block | null {
  if (depth > MAX_NEST) return null
  const row = asRecord(value)
  if (!row || typeof row.type !== 'string') return null
  const type = BLOCK_TYPES.find((item) => item === row.type)
  if (!type) return null
  if ((type === 'toggle' || type === 'title') && depth > 0) return null
  const propsRow = asRecord(row.props) ?? {}
  const props: BlockProps = {}
  if (typeof propsRow.text === 'string') props.text = propsRow.text
  if (typeof propsRow.title === 'string') props.title = propsRow.title
  if (typeof propsRow.label === 'string') props.label = propsRow.label
  if (typeof propsRow.placeholder === 'string') props.placeholder = propsRow.placeholder
  if (typeof propsRow.icon === 'string') props.icon = propsRow.icon
  if (typeof propsRow.color === 'string') props.color = propsRow.color
  if (typeof propsRow.unit === 'string') props.unit = propsRow.unit
  if (propsRow.required === true) props.required = true
  if (propsRow.locked === true) props.locked = true
  if (propsRow.defaultOpen === true) props.defaultOpen = true
  if (propsRow.includeTime === true) props.includeTime = true
  if (propsRow.level !== undefined) props.level = readLevel(propsRow.level)
  if (propsRow.width === 'half') props.width = 'half'
  if (propsRow.size === 'sm' || propsRow.size === 'lg') props.size = propsRow.size
  if (typeof propsRow.min === 'number') props.min = propsRow.min
  if (typeof propsRow.max === 'number') props.max = propsRow.max
  if (typeof propsRow.defaultValue === 'string' || typeof propsRow.defaultValue === 'number' || typeof propsRow.defaultValue === 'boolean') {
    props.defaultValue = propsRow.defaultValue
  }
  const options = readOptions(propsRow.options)
  if (options) props.options = options
  const items = readItems(propsRow.items)
  if (items) props.items = items
  if (type === 'title') props.locked = true
  const block: Block = {
    id: typeof row.id === 'string' && row.id ? row.id : crypto.randomUUID(),
    type,
    props,
  }
  if (isFieldBlock(type)) {
    block.fieldKey = typeof row.fieldKey === 'string' && row.fieldKey ? row.fieldKey : block.id
  }
  if (type === 'toggle') {
    const children = Array.isArray(row.children) ? row.children.flatMap((child) => {
      const next = normalizeBlock(child, depth + 1)
      return next ? [next] : []
    }) : []
    block.children = children
  }
  return block
}

function legacyBlocks(fields: unknown): Block[] {
  if (!Array.isArray(fields)) return []
  const blocks: Block[] = []
  for (const field of fields) {
    const row = asRecord(field)
    if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.type !== 'string') continue
    const type = LEGACY_TYPE[row.type]
    if (!type) continue
    const options = readOptions(row.options)
    blocks.push({
      id: row.id,
      type,
      fieldKey: row.id,
      props: {
        label: row.name,
        required: row.required === true,
        ...(options ? { options } : {}),
      },
    })
  }
  return blocks
}

function ensureTitle(blocks: Block[], label: string): Block[] {
  const title = blocks.find((block) => block.type === 'title')
  const rest = blocks.filter((block) => block.type !== 'title')
  const head: Block = title
    ? { ...title, props: { ...title.props, locked: true, required: title.props.required !== false } }
    : {
        id: crypto.randomUUID(),
        type: 'title',
        fieldKey: crypto.randomUUID(),
        props: { label, placeholder: '제목을 입력하세요', required: true, locked: true },
      }
  return [head, ...rest]
}

export function coerceRecordType(value: unknown): CustomRecordType | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || !row.name.trim()) return null
  const rawBlocks = Array.isArray(row.blocks) ? row.blocks.flatMap((block) => {
    const next = normalizeBlock(block, 0)
    return next ? [next] : []
  }) : legacyBlocks(row.fields)
  const now = new Date().toISOString()
  return {
    id: row.id,
    name: row.name.trim(),
    icon: typeof row.icon === 'string' && row.icon ? row.icon : 'StickyNote',
    color: typeof row.color === 'string' && row.color ? row.color : DEFAULT_SWATCH,
    description: typeof row.description === 'string' ? row.description : '',
    schemaVersion: SCHEMA_VERSION,
    version: typeof row.version === 'number' && row.version > 0 ? row.version : 1,
    blocks: ensureTitle(rawBlocks, '제목'),
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : now,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : now,
  }
}

export type TemplateFile = {
  kind: typeof TEMPLATE_KIND
  schemaVersion: number
  name: string
  icon: string
  color: string
  description: string
  blocks: Block[]
}

export function exportTemplate(type: CustomRecordType): TemplateFile {
  return {
    kind: TEMPLATE_KIND,
    schemaVersion: SCHEMA_VERSION,
    name: type.name,
    icon: type.icon,
    color: type.color,
    description: type.description,
    blocks: type.blocks,
  }
}

export function parseTemplateFile(value: unknown): { ok: true; file: TemplateFile } | { ok: false; error: string } {
  const row = asRecord(value)
  if (!row || row.kind !== TEMPLATE_KIND) return { ok: false, error: '이 파일은 기록 템플릿이 아닙니다.' }
  if (row.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: '지원하지 않는 템플릿 버전입니다.' }
  if (typeof row.name !== 'string' || !row.name.trim()) return { ok: false, error: '템플릿 이름이 없습니다.' }
  const coerced = coerceRecordType({
    id: 'import',
    name: row.name,
    icon: row.icon,
    color: row.color,
    description: row.description,
    blocks: row.blocks,
  })
  if (!coerced) return { ok: false, error: '템플릿 구조가 올바르지 않습니다.' }
  return {
    ok: true,
    file: {
      kind: TEMPLATE_KIND,
      schemaVersion: SCHEMA_VERSION,
      name: coerced.name,
      icon: coerced.icon,
      color: coerced.color,
      description: coerced.description,
      blocks: coerced.blocks.map(cloneBlock),
    },
  }
}

function assert(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message)
}

export function selfCheckRecords(): void {
  if (!import.meta.env.DEV) return
  const migrated = coerceRecordType({
    id: 'legacy',
    name: '운동',
    icon: 'Dumbbell',
    color: '#3C8664',
    fields: [{ id: 'name', name: '운동명', type: 'text', required: true }],
  })
  if (!migrated) throw new Error('legacy title')
  assert(migrated.blocks[0]?.type === 'title', 'legacy title')
  assert(migrated.blocks.some((block) => block.type === 'textField' && block.fieldKey === 'name'), 'legacy field')
  const titleId = migrated.blocks[0]?.id ?? ''
  assert(removeBlock(migrated.blocks, titleId).some((block) => block.id === titleId), 'title locked')
  const withToggle = insertBlock(migrated.blocks, { id: 'tg', type: 'toggle', props: { title: '더보기' }, children: [] }, null, migrated.blocks.length)
  const nested = insertBlock(withToggle, { id: 'tg2', type: 'toggle', props: { title: '안쪽' }, children: [] }, 'tg', 0)
  assert(!flatten(nested).some((block) => block.id === 'tg2'), 'nest limit')
  const placed = insertBlock(withToggle, { id: 'note', type: 'longText', fieldKey: 'memo', props: { label: '메모' } }, 'tg', 0)
  assert(findBlock(placed, 'note')?.parent?.id === 'tg', 'toggle child')
  const bad = parseTemplateFile({ kind: 'other' })
  assert(!bad.ok, 'import kind')
  const good = parseTemplateFile(exportTemplate(migrated))
  assert(good.ok, 'import roundtrip')
  const values = blankValues(migrated.blocks)
  const titleKey = migrated.blocks[0]?.fieldKey
  if (titleKey) values[titleKey] = '하루'
  assert(requiredError(migrated.blocks, values)?.includes('운동명') === true, 'required')
}
