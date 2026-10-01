export const PAGE_IDS = ['schedule', 'diary', 'reading', 'memo'] as const

export type PageId = (typeof PAGE_IDS)[number]

export const CORE_TYPES = [
  'date-header',
  'quick-input',
  'timeline',
  'task-list',
  'calendar',
  'unscheduled',
  'completed',
  'category-summary',
  'page-body',
] as const

export const LAYOUT_TYPES = ['heading', 'text', 'divider', 'toggle', 'callout', 'spacer'] as const

export type BlockType = (typeof CORE_TYPES)[number] | (typeof LAYOUT_TYPES)[number]

export type Span = 1 | 2 | 3

export type PageBlock = {
  id: string
  type: BlockType
  span: Span
  hidden: boolean
  text: string
}

export type PageLayouts = Partial<Record<PageId, PageBlock[]>>

const ALL_TYPES = new Set<string>([...CORE_TYPES, ...LAYOUT_TYPES])

export const BLOCK_LABEL: Record<BlockType, string> = {
  'date-header': '날짜',
  'quick-input': '빠른 입력',
  timeline: '일정',
  'task-list': '할 일',
  calendar: '캘린더',
  unscheduled: '시간 미배정',
  completed: '완료한 일',
  'category-summary': '카테고리 요약',
  'page-body': '페이지',
  heading: '제목',
  text: '텍스트',
  divider: '구분선',
  toggle: '토글',
  callout: '콜아웃',
  spacer: '여백',
}

const DAILY_OPTIONAL: BlockType[] = ['unscheduled', 'completed', 'category-summary', ...LAYOUT_TYPES]

export function catalog(pageId: PageId): BlockType[] {
  if (pageId === 'schedule') {
    return ['date-header', 'quick-input', 'timeline', 'task-list', 'calendar', ...DAILY_OPTIONAL]
  }
  return ['page-body', ...LAYOUT_TYPES]
}

function block(type: BlockType, span: Span, text = ''): PageBlock {
  return { id: type, type, span, hidden: false, text }
}

export function defaultLayout(pageId: PageId): PageBlock[] {
  if (pageId === 'schedule') {
    return [
      block('date-header', 1),
      block('quick-input', 2),
      block('timeline', 1),
      block('task-list', 1),
      block('calendar', 1),
    ]
  }
  return [block('page-body', 3)]
}

export function isUserLayout(stored: PageBlock[] | undefined): boolean {
  return Array.isArray(stored) && stored.length > 0
}

function spanOf(value: unknown): Span {
  return value === 2 || value === 3 ? value : 1
}

export function coerceBlock(value: unknown): PageBlock | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<PageBlock>
  if (typeof row.id !== 'string' || typeof row.type !== 'string' || !ALL_TYPES.has(row.type)) return null
  return {
    id: row.id,
    type: row.type as BlockType,
    span: spanOf(row.span),
    hidden: row.hidden === true,
    text: typeof row.text === 'string' ? row.text : '',
  }
}

export function resolveLayout(pageId: PageId, stored: PageBlock[] | undefined): PageBlock[] {
  if (!stored || stored.length === 0) return defaultLayout(pageId)
  const blocks = stored.flatMap((item) => {
    const next = coerceBlock(item)
    return next ? [next] : []
  })
  return blocks.length > 0 ? blocks : defaultLayout(pageId)
}

export function normalizeLayouts(value: unknown): PageLayouts {
  if (!value || typeof value !== 'object') return {}
  const layouts: PageLayouts = {}
  for (const pageId of PAGE_IDS) {
    const raw = (value as Record<string, unknown>)[pageId]
    if (!Array.isArray(raw)) continue
    const blocks = raw.flatMap((item) => {
      const next = coerceBlock(item)
      return next ? [next] : []
    })
    if (blocks.length > 0) layouts[pageId] = blocks
  }
  return layouts
}

export function reorderBlocks(blocks: readonly PageBlock[], fromId: string, toIndex: number): PageBlock[] {
  const from = blocks.findIndex((block) => block.id === fromId)
  if (from < 0 || toIndex < 0 || toIndex >= blocks.length || from === toIndex) return [...blocks]
  const next = blocks.slice()
  const [item] = next.splice(from, 1)
  next.splice(toIndex, 0, item)
  return next
}

export function patchBlock(blocks: readonly PageBlock[], id: string, patch: Partial<Pick<PageBlock, 'span' | 'hidden' | 'text'>>): PageBlock[] {
  return blocks.map((block) => (block.id === id ? { ...block, ...patch } : block))
}

export function dropBlock(blocks: readonly PageBlock[], id: string): PageBlock[] {
  const target = blocks.find((block) => block.id === id)
  if (!target) return [...blocks]
  if (!(LAYOUT_TYPES as readonly string[]).includes(target.type)) return patchBlock(blocks, id, { hidden: true })
  return blocks.filter((block) => block.id !== id)
}

export function addBlock(blocks: readonly PageBlock[], type: BlockType): PageBlock[] {
  const layout = (LAYOUT_TYPES as readonly string[]).includes(type)
  const existing = blocks.find((block) => block.type === type)
  if (!layout && existing) return patchBlock(blocks, existing.id, { hidden: false })
  const text = type === 'heading' ? '제목' : type === 'toggle' ? '토글\n내용' : type === 'callout' ? '메모' : ''
  return [
    ...blocks,
    {
      id: crypto.randomUUID(),
      type,
      span: type === 'heading' || type === 'text' || type === 'divider' || type === 'callout' ? 3 : 1,
      hidden: false,
      text,
    },
  ]
}

function selfCheckLayout(): void {
  if (!import.meta.env.DEV) return
  const schedule = defaultLayout('schedule')
  if (schedule.map((item) => item.type).join() !== 'date-header,quick-input,timeline,task-list,calendar') throw new Error('schedule default')
  if (schedule[0]?.span !== 1 || schedule[1]?.span !== 2) throw new Error('header spans')
  const moved = reorderBlocks(schedule, 'calendar', 2)
  if (moved[2]?.type !== 'calendar') throw new Error('reorder')
  const hidden = patchBlock(schedule, 'timeline', { hidden: true }).filter((item) => !item.hidden)
  if (hidden.some((item) => item.type === 'timeline')) throw new Error('hide')
  const again = addBlock(patchBlock(schedule, 'timeline', { hidden: true }), 'timeline')
  if (again.filter((item) => item.type === 'timeline' && !item.hidden).length !== 1) throw new Error('restore')
  if (defaultLayout('diary')[0]?.type !== 'page-body') throw new Error('diary default')
  if (!isUserLayout(schedule) || isUserLayout(undefined)) throw new Error('user layout')
}

selfCheckLayout()
