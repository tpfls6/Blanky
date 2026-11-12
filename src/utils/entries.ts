import { CATEGORIES } from '../data/mockWorkspace.ts'
import { captureTarget } from '../features/records/schema.ts'
import type { CustomRecord, EntryType, LibraryData, ResolvedType } from '../types/records.ts'
import { DEFAULT_SETTINGS } from '../types/records.ts'
import { createWorkItem } from './work.ts'
import { parseQuick } from './parseQuick.ts'
import { formatISODate } from './date.ts'
import { captureIntent } from './captureIntent.ts'
import { parseReading } from './readingParse.ts'

export { parseReading }

export function guessType(content: string): ResolvedType {
  const text = content.trim()
  const intent = captureIntent(text)
  if (intent.type !== 'conversation') return intent.type
  if (/(?:예약|회의|약속)/.test(text) || /(?:오전|오후|저녁|밤)\s*\d{1,2}\s*시/.test(text)) return 'schedule'
  if (/까지/.test(text) && /(?:하기|제출|해야|과제)/.test(text)) return 'task'
  if (/아이디어|메모/.test(text)) return 'memo'
  if (/기분|였다|했다/.test(text)) return 'diary'
  return 'memo'
}

export function splitTags(text: string): { body: string; tags: string[] } {
  const tags: string[] = []
  const body = text
    .replace(/#([^\s#]+)/g, (_, tag: string) => {
      tags.push(tag)
      return ''
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  return { body, tags }
}


function stamp(now: Date): string {
  return now.toISOString()
}

export function applyCapture(
  data: LibraryData,
  content: string,
  type: EntryType,
  now = new Date(),
  /** Replaying the same ids lets a preview and the committed state agree on what was created. */
  newId: () => string = () => crypto.randomUUID(),
): LibraryData {
  const trimmed = content.trim()
  if (!trimmed) return data
  if (type === 'auto' && !data.settings.autoClassify) return data

  const createdAt = stamp(now)
  if (type.startsWith('custom:')) {
    return addCustom(data, type.slice('custom:'.length), trimmed, createdAt, newId, {
      ...data,
      captures: [...data.captures, { id: newId(), content: trimmed, type, createdAt, resolvedType: null }],
    })
  }

  if (type !== 'auto' && type !== 'schedule' && type !== 'task' && type !== 'diary' && type !== 'memo' && type !== 'reading') {
    return data
  }
  const resolved: ResolvedType = type === 'auto' ? guessType(trimmed) : type
  const next: LibraryData = {
    ...data,
    captures: [
      ...data.captures,
      { id: newId(), content: trimmed, type, createdAt, resolvedType: resolved },
    ],
  }

  if (resolved === 'schedule' || resolved === 'task') {
    const kind = resolved === 'task' ? 'task' : 'event'
    const draft = parseQuick(trimmed, now, data.categories, kind)
    const item = createWorkItem({
      kind: draft.kind,
      title: draft.title,
      description: trimmed,
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      duration: draft.duration,
      dueDate: draft.dueDate,
      dueTime: draft.dueTime,
      endDate: draft.endDate,
      allDay: draft.allDay,
      categoryId: draft.categoryId,
    })
    return item ? { ...next, items: [...next.items, item] } : next
  }

  if (resolved === 'diary') {
    const draft = parseQuick(trimmed, now, data.categories, 'task')
    const { body, tags } = splitTags(trimmed)
    return {
      ...next,
      diaries: [
        {
          id: newId(),
          date: draft.date,
          body,
          tags,
          createdAt,
          updatedAt: createdAt,
        },
        ...next.diaries,
      ],
    }
  }

  if (resolved === 'memo') {
    const { body, tags } = splitTags(trimmed)
    const title = (body.split('\n').find((line) => line.trim()) ?? '메모').trim().slice(0, 48)
    return {
      ...next,
      memos: [
        {
          id: newId(),
          title: title || '메모',
          body,
          categoryId: null,
          tags,
          createdAt,
          updatedAt: createdAt,
        },
        ...next.memos,
      ],
    }
  }

  return addReading(next, trimmed, now, newId)
}

function addCustom(data: LibraryData, typeId: string, content: string, createdAt: string, newId: () => string, next: LibraryData): LibraryData {
  const recordType = data.recordTypes.find((item) => item.id === typeId)
  if (!recordType) return data
  const key = captureTarget(recordType.blocks)
  const values: CustomRecord['values'] = key ? { [key]: content } : {}
  const record: CustomRecord = {
    id: newId(),
    typeId,
    title: content.slice(0, 48) || recordType.name,
    values,
    templateVersion: recordType.version,
    createdAt,
    updatedAt: createdAt,
  }
  return { ...next, records: [record, ...next.records] }
}

function addReading(data: LibraryData, content: string, now: Date, newId: () => string): LibraryData {
  const parsed = parseReading(content)
  const key = parsed.title.replace(/\s/g, '')
  const existing = data.books.find((book) => book.title.replace(/\s/g, '') === key)
  const createdAt = stamp(now)
  const date = formatISODate(now)
  const bookId = existing?.id ?? newId()
  const books = existing
    ? data.books.map((book) =>
        book.id === existing.id
          ? {
              ...book,
              author: book.author || parsed.author || '',
              currentPage: Math.max(book.currentPage, parsed.page ?? book.currentPage, parsed.finished ? parsed.total ?? book.totalPages : 0),
              totalPages: parsed.total ?? book.totalPages,
              // A book already finished keeps how it got there; otherwise this capture finished it.
              ...(parsed.finished ? { status: 'done' as const, finishedAt: book.finishedAt ?? date, ...(book.status === 'done' ? {} : { finishedBy: 'auto' as const }) } : {}),
            }
          : book,
      )
    : [
        {
          id: bookId,
          title: parsed.title,
          author: parsed.author ?? '',
          cover: null,
          startedAt: date,
          finishedAt: parsed.finished ? date : null,
          currentPage: parsed.page ?? (parsed.finished ? parsed.total ?? 0 : 0),
          totalPages: parsed.total ?? 0,
          status: parsed.finished ? 'done' as const : 'reading' as const,
          ...(parsed.finished ? { finishedBy: 'auto' as const } : {}),
          createdAt,
        },
        ...data.books,
      ]

  return {
    ...data,
    books,
    logs: [
      {
        id: newId(),
        bookId,
        date,
        page: parsed.page,
        note: parsed.note,
        createdAt,
        previousPage: existing?.currentPage ?? 0,
        ...(parsed.finished ? { finished: true } : {}),
      },
      ...data.logs,
    ],
  }
}

export function selfCheckEntries(): void {
  if (!import.meta.env.DEV) return
  const now = new Date(2026, 9, 1)
  const base: LibraryData = {
    categories: CATEGORIES,
    items: [],
    captures: [],
    diaries: [],
    memos: [],
    books: [],
    logs: [],
    recordTypes: [],
    records: [],
    trash: [],
    settings: DEFAULT_SETTINGS,
    pageLayouts: {},
    pageGaps: {},
    customPages: [],
    pageTemplates: [],
  }
  const schedule = applyCapture(base, '내일 오후 3시 병원 예약', 'auto', now)
  const event = schedule.items[0]
  if (!event || event.kind !== 'event' || event.date !== '2026-10-02' || event.startTime !== '15:00') {
    throw new Error('classify schedule')
  }
  if (schedule.captures[0]?.type !== 'auto' || schedule.captures[0].resolvedType !== 'schedule') {
    throw new Error('capture stays auto')
  }
  const task = applyCapture(base, '금요일까지 과제 제출하기', 'auto', now)
  if (task.items[0]?.kind !== 'task' || task.items[0].date !== '2026-10-01' || task.items[0].dueDate !== '2026-10-02') throw new Error('classify task')
  const diary = applyCapture(base, '오늘 날씨가 좋아서 기분이 좋았다', 'auto', now)
  if (diary.diaries[0]?.date !== '2026-10-01' || !diary.diaries[0].body.includes('기분이 좋았다')) {
    throw new Error('classify diary')
  }
  const memo = applyCapture(base, '포트폴리오 About 영역 수정 아이디어', 'auto', now)
  if (!memo.memos[0] || memo.memos.length !== 1) throw new Error('classify memo')
  const reading = applyCapture(base, '노르웨이의 숲 130페이지까지 읽음. 나오코 부분이 인상적이었다.', 'auto', now)
  if (reading.books[0]?.title !== '노르웨이의 숲' || reading.books[0].currentPage !== 130) {
    throw new Error('classify reading')
  }
  if (reading.logs[0]?.page !== 130) throw new Error('reading log')
  const custom = applyCapture(
    {
      ...base,
      recordTypes: [
        {
          id: 'workout',
          name: '운동 기록',
          icon: 'Dumbbell',
          color: '#3C8664',
          description: '',
          schemaVersion: 1,
          version: 1,
          createdAt: '',
          updatedAt: '',
          blocks: [
            { id: 'title', type: 'title', fieldKey: 'title', props: { label: '제목', required: true, locked: true } },
            { id: 'name', type: 'textField', fieldKey: 'name', props: { label: '운동명', required: true } },
          ],
        },
      ],
    },
    '스쿼트 40kg',
    'custom:workout',
    now,
  )
  if (custom.records[0]?.typeId !== 'workout' || custom.records[0].values.name !== '스쿼트 40kg') {
    throw new Error('custom record')
  }
}
