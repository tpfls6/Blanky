export const SCHEMA_VERSION = 1

export const CONTENT_TYPES = [
  'text',
  'heading',
  'bullet',
  'numbered',
  'check',
  'quote',
  'divider',
  'image',
  'link',
  'bookmark',
  'button',
  'toggle',
  'callout',
] as const

export const LAYOUT_TYPES = ['columns', 'column'] as const

export const WIDGET_TYPES = [
  'widget-calendar',
  'widget-tasks',
  'widget-memos',
  'widget-diary',
  'widget-reading',
  'widget-activity',
  'widget-today',
  'widget-planner',
] as const

export const DATA_TYPES = ['collection'] as const

export type ContentType = (typeof CONTENT_TYPES)[number]
export type LayoutType = (typeof LAYOUT_TYPES)[number]
export type WidgetType = (typeof WIDGET_TYPES)[number]
export type DataType = (typeof DATA_TYPES)[number]
export type BuilderBlockType = ContentType | LayoutType | WidgetType | DataType

export type BuilderProps = {
  text?: string
  level?: 1 | 2 | 3
  checked?: boolean
  url?: string
  alt?: string
  icon?: string
  width?: number
  collectionId?: string
  view?: 'table' | 'card' | 'gallery' | 'calendar' | 'kanban' | 'chart'
  background?: string
  color?: string
  border?: boolean
  align?: 'left' | 'center' | 'right'
  padding?: 'sm' | 'md' | 'lg'
  span?: 1 | 2 | 3
  hideContent?: boolean
}

export type BuilderBlock = {
  id: string
  type: BuilderBlockType
  props: BuilderProps
  children?: BuilderBlock[]
}

export type UserPage = {
  id: string
  name: string
  icon: string
  description: string
  sort: number
  schemaVersion: number
  blocks: BuilderBlock[]
  createdAt: string
  updatedAt: string
}

export type PageTemplate = {
  id: string
  name: string
  icon: string
  blocks: BuilderBlock[]
}

export type History = {
  past: BuilderBlock[][]
  future: BuilderBlock[][]
}

const ALL_TYPES = new Set<string>([...CONTENT_TYPES, ...LAYOUT_TYPES, ...WIDGET_TYPES, ...DATA_TYPES])
const CONVERT = new Set<string>(['text', 'heading', 'bullet', 'numbered', 'check', 'quote', 'callout'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function levelOf(value: unknown): 1 | 2 | 3 {
  return value === 1 || value === 3 ? value : 2
}

function widthOf(value: unknown): number {
  return typeof value === 'number' && value > 0 && value <= 100 ? value : 50
}

export function emptyHistory(): History {
  return { past: [], future: [] }
}

export function defaultProps(type: BuilderBlockType): BuilderProps {
  if (type === 'heading') return { text: '', level: 2 }
  if (type === 'check') return { text: '', checked: false }
  if (type === 'image') return { url: '', alt: '' }
  if (type === 'link' || type === 'bookmark' || type === 'button') return { url: '', text: '' }
  if (type === 'toggle') return { text: '' }
  if (type === 'callout') return { text: '', icon: 'Lightbulb' }
  if (type === 'collection') return { collectionId: '', view: 'table', text: '', span: 3 }
  if (type === 'column') return { width: 50 }
  if (type === 'text' || type === 'bullet' || type === 'numbered' || type === 'quote') return { text: '' }
  return {}
}

export function createBlock(type: BuilderBlockType, props?: Partial<BuilderProps>, children?: BuilderBlock[]): BuilderBlock {
  const block: BuilderBlock = {
    id: crypto.randomUUID(),
    type,
    props: { ...defaultProps(type), ...props },
  }
  if (type === 'toggle' || type === 'columns' || type === 'column') block.children = children ?? []
  return block
}

export function coerceBlock(value: unknown): BuilderBlock | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.type !== 'string' || !ALL_TYPES.has(row.type)) return null
  const type = row.type as BuilderBlockType
  const raw = asRecord(row.props) ?? {}
  const props: BuilderProps = { ...defaultProps(type) }
  if (typeof raw.text === 'string') props.text = raw.text
  if (raw.level === 1 || raw.level === 2 || raw.level === 3) props.level = raw.level
  if (typeof raw.checked === 'boolean') props.checked = raw.checked
  if (typeof raw.url === 'string') props.url = raw.url
  if (typeof raw.alt === 'string') props.alt = raw.alt
  if (typeof raw.icon === 'string') props.icon = raw.icon
  if (typeof raw.width === 'number') props.width = widthOf(raw.width)
  if (typeof raw.collectionId === 'string') props.collectionId = raw.collectionId
  if (raw.view === 'table' || raw.view === 'card' || raw.view === 'gallery' || raw.view === 'calendar' || raw.view === 'kanban' || raw.view === 'chart') props.view = raw.view
  if (typeof raw.background === 'string') props.background = raw.background
  if (typeof raw.color === 'string') props.color = raw.color
  if (raw.border === true) props.border = true
  if (raw.align === 'left' || raw.align === 'center' || raw.align === 'right') props.align = raw.align
  if (raw.padding === 'sm' || raw.padding === 'md' || raw.padding === 'lg') props.padding = raw.padding
  if (raw.span === 1 || raw.span === 2 || raw.span === 3) props.span = raw.span
  if (raw.hideContent === true) props.hideContent = true
  const children = Array.isArray(row.children) ? row.children.flatMap((item) => {
    const next = coerceBlock(item)
    return next ? [next] : []
  }) : undefined
  if (type === 'toggle' || type === 'columns' || type === 'column') {
    return { id: row.id, type, props, children: children ?? [] }
  }
  return { id: row.id, type, props }
}

export function coercePage(value: unknown): UserPage | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') return null
  const blocks = Array.isArray(row.blocks) ? row.blocks.flatMap((item) => {
    const next = coerceBlock(item)
    return next ? [next] : []
  }) : []
  return {
    id: row.id,
    name: row.name.trim() || '제목 없음',
    icon: typeof row.icon === 'string' && row.icon ? row.icon : 'StickyNote',
    description: typeof row.description === 'string' ? row.description : '',
    sort: typeof row.sort === 'number' ? row.sort : 0,
    schemaVersion: typeof row.schemaVersion === 'number' ? row.schemaVersion : SCHEMA_VERSION,
    blocks,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
  }
}

export function normalizePages(value: unknown): UserPage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const next = coercePage(item)
    return next ? [next] : []
  }).sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt))
}

export function cloneBlock(block: BuilderBlock): BuilderBlock {
  return {
    id: crypto.randomUUID(),
    type: block.type,
    props: { ...block.props },
    children: block.children?.map(cloneBlock),
  }
}

export function cloneBlocks(blocks: readonly BuilderBlock[]): BuilderBlock[] {
  return blocks.map(cloneBlock)
}

export type Found = { block: BuilderBlock; parent: BuilderBlock | null; list: BuilderBlock[]; index: number }

export function findBlock(blocks: readonly BuilderBlock[], id: string, parent: BuilderBlock | null = null): Found | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (!block) continue
    if (block.id === id) return { block, parent, list: [...blocks], index }
    if (block.children) {
      const found = findBlock(block.children, id, block)
      if (found) return found
    }
  }
  return null
}

function replaceList(blocks: readonly BuilderBlock[], parentId: string | null, next: BuilderBlock[]): BuilderBlock[] {
  if (!parentId) return next
  return blocks.map((block) => {
    if (block.id === parentId) return { ...block, children: next }
    if (!block.children) return block
    return { ...block, children: replaceList(block.children, parentId, next) }
  })
}

export function patchBlock(blocks: readonly BuilderBlock[], id: string, patch: Partial<BuilderProps>): BuilderBlock[] {
  return blocks.map((block) => {
    if (block.id === id) return { ...block, props: { ...block.props, ...patch } }
    if (!block.children) return block
    return { ...block, children: patchBlock(block.children, id, patch) }
  })
}

export function insertBlock(blocks: readonly BuilderBlock[], block: BuilderBlock, parentId: string | null, index: number): BuilderBlock[] {
  if (!parentId) {
    const next = [...blocks]
    next.splice(Math.max(0, Math.min(index, next.length)), 0, block)
    return next
  }
  return blocks.map((item) => {
    if (item.id === parentId) {
      const children = [...(item.children ?? [])]
      children.splice(Math.max(0, Math.min(index, children.length)), 0, block)
      return { ...item, children }
    }
    if (!item.children) return item
    return { ...item, children: insertBlock(item.children, block, parentId, index) }
  })
}

export function removeBlock(blocks: readonly BuilderBlock[], id: string): BuilderBlock[] {
  return blocks.flatMap((block) => {
    if (block.id === id) return []
    if (!block.children) return [block]
    return [{ ...block, children: removeBlock(block.children, id) }]
  })
}

export function duplicateBlock(blocks: readonly BuilderBlock[], id: string): BuilderBlock[] {
  const found = findBlock(blocks, id)
  if (!found) return [...blocks]
  const copy = cloneBlock(found.block)
  return insertBlock(blocks, copy, found.parent?.id ?? null, found.index + 1)
}

export function moveBlock(blocks: readonly BuilderBlock[], id: string, parentId: string | null, index: number): BuilderBlock[] {
  const found = findBlock(blocks, id)
  if (!found) return [...blocks]
  if (parentId === found.block.id) return [...blocks]
  const removed = removeBlock(blocks, id)
  return insertBlock(removed, found.block, parentId, index)
}

export function moveBy(blocks: readonly BuilderBlock[], id: string, delta: -1 | 1): BuilderBlock[] {
  const found = findBlock(blocks, id)
  if (!found) return [...blocks]
  const next = found.index + delta
  if (next < 0 || next >= found.list.length) return [...blocks]
  return moveBlock(blocks, id, found.parent?.id ?? null, next)
}

export function convertBlock(blocks: readonly BuilderBlock[], id: string, type: BuilderBlockType): BuilderBlock[] {
  if (!CONVERT.has(type) && type !== 'heading') return [...blocks]
  return blocks.map((block) => {
    if (block.id === id) {
      if (!CONVERT.has(block.type)) return block
      const props = { ...defaultProps(type), text: block.props.text ?? '' }
      if (type === 'heading') props.level = block.props.level ?? levelOf(2)
      if (type === 'check') props.checked = block.props.checked ?? false
      if (type === 'callout') props.icon = block.props.icon ?? 'Lightbulb'
      return { ...block, type, props, children: undefined }
    }
    if (!block.children) return block
    return { ...block, children: convertBlock(block.children, id, type) }
  })
}

export function toColumns(blocks: readonly BuilderBlock[], id: string, count: 2 | 3): BuilderBlock[] {
  const found = findBlock(blocks, id)
  if (!found || found.parent?.type === 'column') return [...blocks]
  const width = Math.floor(100 / count)
  const columns = Array.from({ length: count }, (_, i) =>
    createBlock('column', { width: i === count - 1 ? 100 - width * (count - 1) : width }, i === 0 ? [found.block] : [createBlock('text')]),
  )
  const wrapper = createBlock('columns', {}, columns)
  const without = removeBlock(blocks, id)
  return insertBlock(without, wrapper, found.parent?.id ?? null, found.index)
}

export function setColumnWidth(blocks: readonly BuilderBlock[], id: string, width: number): BuilderBlock[] {
  const found = findBlock(blocks, id)
  if (!found || found.block.type !== 'column' || !found.parent || found.parent.type !== 'columns') return [...blocks]
  const siblings = found.parent.children ?? []
  const other = siblings.filter((item) => item.id !== id)
  const clamped = Math.max(20, Math.min(80, Math.round(width)))
  const rest = 100 - clamped
  const share = other.length ? rest / other.length : rest
  const next = siblings.map((item) =>
    item.id === id ? { ...item, props: { ...item.props, width: clamped } } : { ...item, props: { ...item.props, width: share } },
  )
  return replaceList(blocks, found.parent.id, next)
}

export function pushHistory(history: History, current: readonly BuilderBlock[]): History {
  return { past: [...history.past, current.map((block) => structuredClone(block))].slice(-80), future: [] }
}

export function undo(history: History, current: readonly BuilderBlock[]): { history: History; blocks: BuilderBlock[] } {
  const prev = history.past.at(-1)
  if (!prev) return { history, blocks: [...current] }
  return {
    history: { past: history.past.slice(0, -1), future: [current.map((block) => structuredClone(block)), ...history.future] },
    blocks: prev,
  }
}

export function redo(history: History, current: readonly BuilderBlock[]): { history: History; blocks: BuilderBlock[] } {
  const next = history.future[0]
  if (!next) return { history, blocks: [...current] }
  return {
    history: { past: [...history.past, current.map((block) => structuredClone(block))], future: history.future.slice(1) },
    blocks: next,
  }
}

export function createPage(name: string, icon = 'StickyNote', blocks: BuilderBlock[] = [], sort = 0): UserPage {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: name.trim() || '제목 없음',
    icon,
    description: '',
    sort,
    schemaVersion: SCHEMA_VERSION,
    blocks: blocks.length > 0 ? blocks : [createBlock('text')],
    createdAt: now,
    updatedAt: now,
  }
}

export function touchPage(page: UserPage, patch: Partial<Pick<UserPage, 'name' | 'icon' | 'description' | 'sort' | 'blocks'>>): UserPage {
  const name = patch.name === undefined ? page.name : patch.name.trim() || page.name
  return { ...page, ...patch, name, updatedAt: new Date().toISOString() }
}

function selfCheck(): void {
  if (typeof import.meta !== 'undefined' && import.meta.env && !import.meta.env.DEV) return
  const text = createBlock('text', { text: '안녕' })
  const heading = convertBlock([text], text.id, 'heading')[0]
  if (heading?.type !== 'heading' || heading.props.text !== '안녕') throw new Error('convert')
  const moved = moveBy([text, createBlock('quote')], text.id, 1)
  if (moved[1]?.id !== text.id) throw new Error('move')
  const cols = toColumns([text], text.id, 2)
  if (cols[0]?.type !== 'columns' || (cols[0].children ?? []).length !== 2) throw new Error('columns')
  const copy = duplicateBlock([text], text.id)
  if (copy.length !== 2 || copy[1]?.id === text.id || copy[1]?.props.text !== '안녕') throw new Error('dup')
  const history = pushHistory(emptyHistory(), [text])
  const undone = undo(history, [createBlock('quote')])
  if (undone.blocks[0]?.id !== text.id) throw new Error('undo')
  const page = coercePage({ id: 'p', name: ' 공부 ', blocks: [{ id: 'b', type: 'nope' }, { id: 'c', type: 'text', props: { text: 'x' } }] })
  if (!page || page.name !== '공부' || page.blocks.length !== 1) throw new Error('coerce')
}

selfCheck()
