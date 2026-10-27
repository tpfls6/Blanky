import {
  Activity,
  BookOpen,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  Heading1,
  Heading2,
  Heading3,
  Image,
  LayoutTemplate,
  Lightbulb,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Sparkles,
  SquareSplitHorizontal,
  StickyNote,
  Table2,
  Type,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { cloneBlocks, createBlock, type BuilderBlock, type BuilderBlockType, type PageTemplate } from './schema.ts'

export type MenuGroup = 'basic' | 'layout' | 'blanky'

export type InsertItem = {
  id: string
  labelKey: string
  group: MenuGroup
  keywords: string[]
  icon: LucideIcon
  create: () => BuilderBlock
}

function item(id: string, labelKey: string, group: MenuGroup, keywords: string[], icon: LucideIcon, type: BuilderBlockType, extra?: () => BuilderBlock): InsertItem {
  return {
    id,
    labelKey,
    group,
    keywords: [id, ...keywords],
    icon,
    create: extra ?? (() => createBlock(type)),
  }
}

export const INSERT_MENU: readonly InsertItem[] = [
  item('text', 'builder.block.text', 'basic', ['text', '텍스트', 'paragraph'], Type, 'text'),
  item('h1', 'builder.block.h1', 'basic', ['h1', 'heading', '제목'], Heading1, 'heading', () => createBlock('heading', { level: 1 })),
  item('h2', 'builder.block.h2', 'basic', ['h2', 'heading', '제목'], Heading2, 'heading', () => createBlock('heading', { level: 2 })),
  item('h3', 'builder.block.h3', 'basic', ['h3', 'heading', '제목'], Heading3, 'heading', () => createBlock('heading', { level: 3 })),
  item('bullet', 'builder.block.bullet', 'basic', ['bullet', 'list', '글머리'], List, 'bullet'),
  item('numbered', 'builder.block.numbered', 'basic', ['number', 'ol', '번호'], ListOrdered, 'numbered'),
  item('check', 'builder.block.check', 'basic', ['todo', 'check', '체크'], ListChecks, 'check'),
  item('quote', 'builder.block.quote', 'basic', ['quote', '인용'], Quote, 'quote'),
  item('divider', 'builder.block.divider', 'basic', ['divider', '구분선'], Minus, 'divider'),
  item('image', 'builder.block.image', 'basic', ['image', '이미지'], Image, 'image'),
  item('link', 'builder.block.link', 'basic', ['link', '링크'], Link, 'link'),
  item('bookmark', 'builder.block.bookmark', 'basic', ['bookmark', '북마크'], Link, 'bookmark'),
  item('button', 'builder.block.button', 'basic', ['button', '버튼'], CheckSquare, 'button'),
  item('toggle', 'builder.block.toggle', 'basic', ['toggle', '토글'], ChevronRight, 'toggle'),
  item('callout', 'builder.block.callout', 'basic', ['callout', '콜아웃'], Lightbulb, 'callout'),
  item('collection', 'builder.block.collection', 'layout', ['collection', '컬렉션', 'table', '데이터베이스'], Table2, 'collection'),
  item('columns2', 'builder.block.columns2', 'layout', ['columns', '열', '2열'], SquareSplitHorizontal, 'columns', () =>
    createBlock('columns', {}, [createBlock('column', { width: 50 }, [createBlock('text')]), createBlock('column', { width: 50 }, [createBlock('text')])]),
  ),
  item('columns3', 'builder.block.columns3', 'layout', ['columns', '열', '3열'], LayoutTemplate, 'columns', () =>
    createBlock('columns', {}, [
      createBlock('column', { width: 34 }, [createBlock('text')]),
      createBlock('column', { width: 33 }, [createBlock('text')]),
      createBlock('column', { width: 33 }, [createBlock('text')]),
    ]),
  ),
  item('today', 'builder.block.today', 'blanky', ['today', '오늘'], CalendarDays, 'widget-today'),
  item('calendar', 'builder.block.calendar', 'blanky', ['calendar', '캘린더'], CalendarRange, 'widget-calendar'),
  item('tasks', 'builder.block.tasks', 'blanky', ['task', '할일'], CheckSquare, 'widget-tasks'),
  item('memos', 'builder.block.memos', 'blanky', ['memo', '메모'], StickyNote, 'widget-memos'),
  item('diary', 'builder.block.diary', 'blanky', ['diary', '일기'], BookOpen, 'widget-diary'),
  item('reading', 'builder.block.reading', 'blanky', ['reading', '독서'], BookOpen, 'widget-reading'),
  item('activity', 'builder.block.activity', 'blanky', ['activity', '활동'], Activity, 'widget-activity'),
  item('planner', 'builder.block.planner', 'blanky', ['planner', 'ai'], Sparkles, 'widget-planner'),
]

export const GROUPS: MenuGroup[] = ['basic', 'layout', 'blanky']

export function filterMenu(query: string): InsertItem[] {
  const text = query.trim().toLowerCase()
  if (!text) return [...INSERT_MENU]
  return INSERT_MENU.filter((entry) => entry.keywords.some((keyword) => keyword.includes(text)) || entry.id.includes(text))
}

function named(id: string, name: string, icon: string, blocks: BuilderBlock[]): PageTemplate {
  return { id, name, icon, blocks }
}

export const BUILTIN_TEMPLATES: readonly PageTemplate[] = [
  named('blank', '빈 페이지', 'StickyNote', [createBlock('text')]),
  named('study', '공부 관리', 'GraduationCap', [
    createBlock('heading', { level: 1, text: '공부' }),
    createBlock('widget-today'),
    createBlock('widget-tasks'),
    createBlock('callout', { text: '오늘 끝낼 한 가지' }),
  ]),
  named('dashboard', '개인 대시보드', 'House', [
    createBlock('heading', { level: 1, text: '대시보드' }),
    createBlock('columns', {}, [
      createBlock('column', { width: 50 }, [createBlock('widget-today')]),
      createBlock('column', { width: 50 }, [createBlock('widget-tasks')]),
    ]),
    createBlock('widget-diary'),
  ]),
  named('reading', '독서 관리', 'BookOpen', [
    createBlock('heading', { level: 1, text: '독서' }),
    createBlock('widget-reading'),
    createBlock('widget-memos'),
  ]),
  named('project', '프로젝트 관리', 'Briefcase', [
    createBlock('heading', { level: 1, text: '프로젝트' }),
    createBlock('check', { text: '다음 할 일' }),
    createBlock('widget-tasks'),
    createBlock('widget-memos'),
  ]),
  named('weekly', '주간 계획', 'CalendarDays', [
    createBlock('heading', { level: 1, text: '이번 주' }),
    createBlock('widget-calendar'),
    createBlock('widget-planner'),
    createBlock('widget-today'),
  ]),
]

export function blocksFromTemplate(template: PageTemplate): BuilderBlock[] {
  return cloneBlocks(template.blocks)
}
