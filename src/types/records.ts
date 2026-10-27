import type { AppLocale } from '../i18n/locale.ts'
import type { Calendar } from '@blanky/types'
import type { CustomRecordType, FieldValue } from '../features/records/schema.ts'
import type { UserPage } from '../features/builder/schema.ts'
import type { PageLayouts } from '../features/pages/layout.ts'
import type { TrashItem } from '../utils/trash.ts'
import type { WorkItem, WorkspaceCategory } from './work.ts'

export type { Block, BlockProps, BlockType, CheckItem, CustomRecordType, FieldValue, RenderMode, SelectOption } from '../features/records/schema.ts'

/** User's choice on Home. `auto` is sent to classification later. Custom ids are `custom:<typeId>`. */
export type EntryType = 'auto' | 'schedule' | 'task' | 'diary' | 'memo' | 'reading' | `custom:${string}`

export type ResolvedType = 'schedule' | 'task' | 'diary' | 'memo' | 'reading'

export type Capture = {
  id: string
  content: string
  type: EntryType
  createdAt: string
  resolvedType: ResolvedType | null
}

export type DiaryEntry = {
  title?: string
  mood?: string
  weather?: string
  isFavorite?: boolean
  id: string
  date: string
  body: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type Memo = {
  id: string
  title: string
  body: string
  categoryId: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type BookStatus = 'reading' | 'done' | 'want'

export type Book = {
  id: string
  title: string
  author: string
  cover: string | null
  startedAt: string | null
  finishedAt: string | null
  currentPage: number
  totalPages: number
  status: BookStatus
  createdAt: string
}

export type ReadingLog = {
  id: string
  bookId: string
  date: string
  page: number | null
  note: string
  createdAt: string
}

export type ThemeSetting = 'light' | 'dark' | 'system'

export type ScheduleTab = 'all' | 'timeline' | 'tasks'

export type TimelineDensity = 'compact' | 'default' | 'comfortable'

/** `last` repeats the chip the user saved with most recently. */
export type HomeInputDefault = 'auto' | 'schedule' | 'task' | 'diary' | 'memo' | 'reading' | 'last'

export type NavPref = {
  id: string
  visible: boolean
}

export const DEFAULT_NAV: NavPref[] = [
  { id: 'home', visible: true },
  { id: 'schedule', visible: true },
  { id: 'activity', visible: true },
  { id: 'diary', visible: true },
  { id: 'reading', visible: true },
  { id: 'memo', visible: true },
]

export const TASK_DURATIONS = [15, 30, 45, 60, 90, 120] as const

export type Settings = {
  timezone?: string
  scheduling?: Partial<import('../../packages/types/src/planning.ts').SchedulingSettings>
  locale: AppLocale
  theme: ThemeSetting
  accent: string
  savedAccents: string[]
  nav: NavPref[]
  weekStartsOn: 0 | 1
  defaultScheduleTab: ScheduleTab
  dayStartTime: string
  dayEndTime: string
  taskDefaultDuration: number
  defaultEventMinutes: number
  timelineDensity: TimelineDensity
  homeDefaultInput: HomeInputDefault
  lastInputType: string
  autoClassify: boolean
  autoSaveAfterClassify: boolean
  taskView: 'open' | 'all'
  notifyEvents: boolean
  notifyTasks: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'ko',
  theme: 'light',
  accent: 'blue',
  savedAccents: [],
  nav: DEFAULT_NAV,
  weekStartsOn: 0,
  defaultScheduleTab: 'all',
  dayStartTime: '07:00',
  dayEndTime: '23:00',
  taskDefaultDuration: 60,
  defaultEventMinutes: 60,
  timelineDensity: 'default',
  homeDefaultInput: 'auto',
  lastInputType: 'auto',
  autoClassify: true,
  autoSaveAfterClassify: false,
  taskView: 'open',
  notifyEvents: true,
  notifyTasks: true,
}

export type CustomRecord = {
  id: string
  typeId: string
  title: string
  values: Record<string, FieldValue>
  templateVersion: number
  createdAt: string
  updatedAt: string
}

export type LibraryData = {
  activities?: import('../services/schedule/workStore.ts').Activity[]
  personalCalendar?: Calendar
  categories: WorkspaceCategory[]
  items: WorkItem[]
  captures: Capture[]
  diaries: DiaryEntry[]
  memos: Memo[]
  books: Book[]
  logs: ReadingLog[]
  recordTypes: CustomRecordType[]
  records: CustomRecord[]
  trash: TrashItem[]
  settings: Settings
  pageLayouts: PageLayouts
  customPages: UserPage[]
  pageTemplates: UserPage[]
}

export const ENTRY_OPTIONS: { id: ResolvedType; label: string }[] = [
  { id: 'schedule', label: '일정' },
  { id: 'task', label: '할 일' },
  { id: 'diary', label: '일기' },
  { id: 'memo', label: '메모' },
  { id: 'reading', label: '독서 기록' },
]

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  reading: '읽는 중',
  done: '완독',
  want: '읽고 싶은 책',
}
