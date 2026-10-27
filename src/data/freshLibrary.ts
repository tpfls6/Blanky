import { shiftISO, todayISO } from '../utils/date.ts'
import { CATEGORIES, createSeed } from './mockWorkspace.ts'
import type { Book, DiaryEntry, LibraryData, Memo, ReadingLog } from '../types/records.ts'
import { DEFAULT_SETTINGS } from '../types/records.ts'

function nowIso(): string {
  return new Date().toISOString()
}

export function freshLibrary(): LibraryData {
  const today = todayISO()
  const createdAt = nowIso()
  const diary: DiaryEntry = {
    id: 'diary-seed',
    date: today,
    body: '오늘 운동을 하고 저녁을 먹었다.\n프로젝트도 조금 수정했다.',
    tags: ['일상', '운동'],
    createdAt,
    updatedAt: createdAt,
  }
  const memo: Memo = {
    id: 'memo-seed',
    title: '포트폴리오 About',
    body: 'About 영역은 프로젝트를 나열하기보다, 내가 어떤 문제를 푸는지 먼저 적자.',
    categoryId: 'blanky',
    tags: ['포트폴리오'],
    createdAt,
    updatedAt: createdAt,
  }
  const book: Book = {
    id: 'book-forest',
    title: '노르웨이의 숲',
    author: '무라카미 하루키',
    cover: null,
    startedAt: shiftISO(today, -10),
    finishedAt: null,
    currentPage: 130,
    totalPages: 480,
    status: 'reading',
    createdAt,
  }
  const logs: ReadingLog[] = [
    {
      id: 'log-forest-2',
      bookId: book.id,
      date: today,
      page: 130,
      note: '나오코 부분이 인상적이었다.',
      createdAt,
    },
    {
      id: 'log-forest-1',
      bookId: book.id,
      date: shiftISO(today, -3),
      page: 90,
      note: '90페이지까지 읽음.',
      createdAt,
    },
  ]

  return {
    categories: CATEGORIES,
    items: createSeed(),
    captures: [],
    diaries: [diary],
    memos: [memo],
    books: [book],
    logs,
    recordTypes: [],
    records: [],
    trash: [],
    settings: { ...DEFAULT_SETTINGS, nav: DEFAULT_SETTINGS.nav.map((item) => ({ ...item })), savedAccents: [] },
    pageLayouts: {},
    customPages: [],
    pageTemplates: [],
  }
}
