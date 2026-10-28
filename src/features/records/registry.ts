import {
  AlignLeft,
  Calendar,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  Clock,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Lightbulb,
  Link,
  List,
  ListChecks,
  Minus,
  Quote,
  Space,
  Star,
  Tags,
  TextCursorInput,
  Type,
  Hash,
  Gauge,
  type LucideIcon,
} from 'lucide-react'
import { SWATCHES } from '../../constants/swatches.ts'
import { isFieldBlock, type Block, type BlockProps, type BlockType } from './schema.ts'

export type MenuGroup = 'basic' | 'fields' | 'layout'

export type InsertItem = {
  label: string
  group: MenuGroup
  keywords: string[]
  icon: LucideIcon
  nest: boolean
  create: () => Block
}

const GROUP_LABEL: Record<MenuGroup, string> = {
  basic: '기본',
  fields: '입력',
  layout: '레이아웃',
}

export function groupLabel(group: MenuGroup): string {
  return GROUP_LABEL[group]
}

function option(label: string, index: number) {
  return { id: crypto.randomUUID(), label, color: SWATCHES[index % SWATCHES.length]?.hex ?? '#3A62B0' }
}

function defaultProps(type: BlockType): BlockProps {
  switch (type) {
    case 'title':
      return { label: '제목', placeholder: '제목을 입력하세요', required: true, locked: true }
    case 'text':
      return { text: '' }
    case 'heading':
      return { level: 2, text: '' }
    case 'divider':
      return {}
    case 'callout':
      return { icon: 'Lightbulb', text: '', color: SWATCHES[0].hex }
    case 'quote':
      return { text: '' }
    case 'toggle':
      return { title: '토글', defaultOpen: false }
    case 'spacer':
      return { size: 'md' }
    case 'checklist':
      return { items: [{ id: crypto.randomUUID(), label: '항목', checked: false }] }
    case 'textField':
      return { label: '텍스트', placeholder: '', required: false, width: 'full' }
    case 'longText':
      return { label: '긴 텍스트', placeholder: '', required: false, width: 'full' }
    case 'number':
      return { label: '숫자', placeholder: '', required: false, unit: '', min: null, max: null, width: 'full' }
    case 'date':
      return { label: '날짜', required: false, includeTime: false }
    case 'time':
      return { label: '시간', required: false }
    case 'dateTime':
      return { label: '날짜와 시간', required: false, includeTime: true }
    case 'checkbox':
      return { label: '체크박스', required: false }
    case 'select':
      return { label: '선택', required: false, options: [option('옵션', 0)] }
    case 'multiSelect':
      return { label: '다중 선택', required: false, options: [option('옵션', 0)] }
    case 'url':
      return { label: 'URL', placeholder: 'https://', required: false, width: 'full' }
    case 'image':
      return { label: '이미지', placeholder: 'https://', required: false, width: 'full' }
    case 'rating':
      return { label: '별점', required: false, min: 1, max: 5 }
    case 'progress':
      return { label: '진행률', required: false, min: 0, max: 100, unit: '%' }
    case 'tags':
      return { label: '태그', required: false }
    default:
      return {}
  }
}

export function createBlock(type: BlockType, props?: Partial<BlockProps>, children?: Block[]): Block {
  const block: Block = {
    id: crypto.randomUUID(),
    type,
    props: { ...defaultProps(type), ...props },
  }
  if (isFieldBlock(type)) block.fieldKey = crypto.randomUUID()
  if (type === 'toggle') block.children = children ?? []
  return block
}

function item(label: string, group: MenuGroup, keywords: string[], icon: LucideIcon, nest: boolean, create: () => Block): InsertItem {
  return { label, group, keywords: [label.toLowerCase(), ...keywords], icon, nest, create }
}

export const INSERT_MENU: readonly InsertItem[] = [
  item('텍스트', 'basic', ['text', 'paragraph'], Type, true, () => createBlock('text')),
  item('제목 1', 'basic', ['heading', 'h1', 'heading1'], Heading1, true, () => createBlock('heading', { level: 1, text: '' })),
  item('제목 2', 'basic', ['heading', 'h2', 'heading2'], Heading2, true, () => createBlock('heading', { level: 2, text: '' })),
  item('제목 3', 'basic', ['heading', 'h3', 'heading3'], Heading3, true, () => createBlock('heading', { level: 3, text: '' })),
  item('구분선', 'basic', ['divider', 'line'], Minus, true, () => createBlock('divider')),
  item('인용', 'basic', ['quote'], Quote, true, () => createBlock('quote')),
  item('토글', 'basic', ['toggle'], ChevronRight, false, () => createBlock('toggle')),
  item('체크리스트', 'basic', ['checklist', 'todo'], ListChecks, true, () => createBlock('checklist')),
  item('짧은 텍스트', 'fields', ['text', 'input', 'short'], TextCursorInput, true, () => createBlock('textField')),
  item('긴 텍스트', 'fields', ['long', 'textarea', 'longtext'], AlignLeft, true, () => createBlock('longText')),
  item('숫자', 'fields', ['number'], Hash, true, () => createBlock('number')),
  item('날짜', 'fields', ['date'], Calendar, true, () => createBlock('date')),
  item('시간', 'fields', ['time'], Clock, true, () => createBlock('time')),
  item('날짜와 시간', 'fields', ['datetime', 'date time'], CalendarClock, true, () => createBlock('dateTime')),
  item('체크박스', 'fields', ['checkbox', 'check'], CheckSquare, true, () => createBlock('checkbox')),
  item('선택', 'fields', ['select'], List, true, () => createBlock('select')),
  item('다중 선택', 'fields', ['multi', 'multiselect'], Tags, true, () => createBlock('multiSelect')),
  item('URL', 'fields', ['url', 'link', 'http'], Link, true, () => createBlock('url')),
  item('이미지', 'fields', ['image', 'img', 'photo'], Image, true, () => createBlock('image')),
  item('별점', 'fields', ['rating', 'star'], Star, true, () => createBlock('rating')),
  item('진행률', 'fields', ['progress', 'percent'], Gauge, true, () => createBlock('progress')),
  item('태그', 'fields', ['tag', 'tags'], Tags, true, () => createBlock('tags')),
  item('콜아웃', 'layout', ['callout'], Lightbulb, true, () => createBlock('callout')),
  item('여백', 'layout', ['spacer', 'space'], Space, true, () => createBlock('spacer')),
]

export function filterMenu(query: string, nested: boolean): InsertItem[] {
  const text = query.trim().toLowerCase()
  return INSERT_MENU.filter((entry) => {
    if (nested && !entry.nest) return false
    if (!text) return true
    return entry.keywords.some((keyword) => keyword.includes(text)) || entry.label.toLowerCase().includes(text)
  })
}
