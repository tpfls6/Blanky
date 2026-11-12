import type { AppLocale } from '../i18n/locale.ts'
import type { Calendar } from '@blanky/types'
import type { CustomRecordType, FieldValue } from '../features/records/schema.ts'
import type { UserPage } from '../features/builder/schema.ts'
import type { PageGaps, PageLayouts } from '../features/pages/layout.ts'
import type { TrashItem } from '../utils/trash.ts'
import type { WorkItem, WorkspaceCategory } from './work.ts'

export type { Block, BlockProps, BlockType, CheckItem, CustomRecordType, FieldValue, RenderMode, SelectOption } from '../features/records/schema.ts'

/** User's choice on Home. `auto` is sent to classification later. Custom ids are `custom:<typeId>`. */
export type EntryType = 'auto' | 'schedule' | 'task' | 'diary' | 'memo' | 'reading' | `custom:${string}`

export type ResolvedType = 'schedule' | 'task' | 'diary' | 'memo' | 'reading'

/** The one record a Home capture created, so the chat can open or remove exactly that row. */
export type CaptureRef =
  | { kind: 'memo'; id: string; title: string }
  | { kind: 'diary'; id: string; title: string }
  /** A reading log; `newBook` marks a book the same capture started (kept for older refs: deleting the
   *  last log no longer removes the book).
   *  `previousPage` is the book's progress before this log, restored when no paged log is left;
   *  `page` is the page this log recorded, shown on its chat row. */
  | { kind: 'reading'; id: string; bookId: string; newBook: boolean; title: string; previousPage?: number; page?: number | null }

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
  /** How a finished book got there: `auto` from its reading logs (a 완독 capture, or a log reaching the
   *  last page), `manual` set on the book itself. Books finished before this was kept have none, and
   *  deleting a log never changes their status or progress. */
  finishedBy?: 'manual' | 'auto'
}

export type ReadingLog = {
  id: string
  bookId: string
  date: string
  page: number | null
  note: string
  createdAt: string
  /** The book's progress before a Home capture added this log (0 for the log that started the book).
   *  Kept with the log so deleting logs in any order lands on the same page. */
  previousPage?: number
  /** The capture said the book was finished (완독), which raised the book to its last page. */
  finished?: boolean
}

export type ThemeSetting = 'light' | 'dark' | 'system'

export type ScheduleTab = 'all' | 'timeline' | 'tasks'

export type TimelineDensity = 'compact' | 'default' | 'comfortable'

export type CalendarView = 'simple' | 'detailed'

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
  /** Pinned mobile tabs, in order. Unset preserves the existing default bar. */
  mobileBarIds?: string[]
  weekStartsOn: 0 | 1
  defaultScheduleTab: ScheduleTab
  dayStartTime: string
  dayEndTime: string
  taskDefaultDuration: number
  defaultEventMinutes: number
  timelineDensity: TimelineDensity
  calendarView: CalendarView
  homeDefaultInput: HomeInputDefault
  lastInputType: string
  autoClassify: boolean
  autoSaveAfterClassify: boolean
  taskView: 'open' | 'all'
  notifyEvents: boolean
  notifyTasks: boolean
  customTemplatesGuideSeen: boolean
  onboardingDone: boolean
  /** Pages whose first-visit guide was finished or skipped; synced with the other preferences. */
  onboardingPages: string[]
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
  calendarView: 'simple',
  homeDefaultInput: 'auto',
  lastInputType: 'auto',
  autoClassify: true,
  autoSaveAfterClassify: false,
  taskView: 'open',
  notifyEvents: true,
  notifyTasks: true,
  customTemplatesGuideSeen: false,
  onboardingDone: false,
  onboardingPages: [],
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
  pageGaps: PageGaps
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
