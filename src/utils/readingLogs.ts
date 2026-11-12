import type { Book, CaptureRef, ReadingLog } from '../types/records.ts'
import { toTrash, withTrash, type ReadingCopy, type RestoreProgress, type TrashItem } from './trash.ts'

type ReadingRef = Extract<CaptureRef, { kind: 'reading' }>

/** Why the page before a log saved without `previousPage` cannot be told from the book's own records. */
export type UnsureReason =
  /** Two older logs of the book share a time, so which came first is unknown. */
  | 'order'
  /** A log before it keeps its own `previousPage` (a newer capture), which may have moved the book in ways
   *  its page does not show (a 완독 capture jumps to the last page). */
  | 'mixed'
  /** Nothing records where the book stood before its earliest remaining log. */
  | 'no-start'
  /** The logs do not add up to the page the book (or the next newer log) recorded, so something else
   *  (an edit, an earlier delete) moved it. */
  | 'mismatch'

/** The page a log brought the book to: a 완독 capture raised it to the last page even without a page. */
function reach(book: Book, log: ReadingLog): number | null {
  return log.finished ? Math.max(log.page ?? 0, book.totalPages) : log.page
}

function pagesOf(book: Book, logs: readonly ReadingLog[]): number[] {
  return logs.flatMap(log => { const page = reach(book, log); return page === null ? [] : [page] })
}

/** The book's page before `log`. Captures since `previousPage` was kept carry it. For an older log it is
 *  worked out only when the same book's records settle it exactly:
 *  - the book began with its earliest log (a Home capture stamps both with the same time), so it started
 *    at 0 and stood at the highest page logged before `log`; or
 *  - the chat ref copied the page when `log` was captured and a log still left before it reached exactly
 *    that page (deletes only ever lower it, so only a remaining log can confirm the copy).
 *  The logs from there on must also add up to the page the book shows, or to where the next newer log
 *  says it started. Anything else is `unsure`, and callers leave the page as it is. */
export function previousPageOf(book: Book, logs: readonly ReadingLog[], log: ReadingLog, refPage?: number): number | { unsure: UnsureReason } {
  if (log.previousPage !== undefined) return log.previousPage
  const own = logs.filter(item => item.bookId === book.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const older = own.filter(item => item.previousPage === undefined)
  if (new Set(older.map(item => item.createdAt)).size !== older.length) return { unsure: 'order' }
  const earlier = own.filter(item => item.createdAt < log.createdAt)
  if (earlier.some(item => item.previousPage !== undefined)) return { unsure: 'mixed' }
  const before = pagesOf(book, earlier)
  let page: number
  if (own[0]?.createdAt === book.createdAt) page = Math.max(0, ...before)
  else if (refPage !== undefined && before.length && refPage === Math.max(...before)) page = refPage
  else return { unsure: 'no-start' }
  if (refPage !== undefined && refPage !== page) return { unsure: 'mismatch' }
  const next = own.find(item => item.createdAt > log.createdAt && item.previousPage !== undefined)
  const run = own.filter(item => item.createdAt >= log.createdAt && (!next || item.createdAt < next.createdAt))
  if (Math.max(page, ...pagesOf(book, run)) !== (next?.previousPage ?? book.currentPage)) return { unsure: 'mismatch' }
  return page
}

/** A book's progress once one Home reading log is gone. Logs only ever raise it, so a log below the
 *  current page changes nothing; otherwise the highest page left wins, but never below the progress the
 *  book had before that log. An older log whose starting page the records cannot settle leaves the page
 *  as it is. */
export function pageWithoutLog(book: Book, logs: readonly ReadingLog[], saved: ReadingRef): number {
  const removed = logs.find(log => log.id === saved.id)
  const reached = removed ? reach(book, removed) : null
  if (!removed || reached === null || reached < book.currentPage) return book.currentPage
  const before = previousPageOf(book, logs, removed, saved.previousPage)
  if (typeof before !== 'number') return book.currentPage
  return Math.max(before, ...pagesOf(book, logs.filter(log => log.bookId === book.id && log.id !== saved.id)))
}

/** The book once one Home reading log is gone. A book its logs finished (`finishedBy: 'auto'`) is worked
 *  out again from the logs left: still finished while a 완독 log stays or the page still reaches the last
 *  one, otherwise back to reading without a finish date. A book finished by hand, or finished before the
 *  source was kept, is left exactly as it is, page included, so it never shows done at a lower page. */
export function bookWithoutLog(book: Book, logs: readonly ReadingLog[], saved: ReadingRef): Book {
  if (book.status === 'done' && book.finishedBy !== 'auto') return book
  const currentPage = pageWithoutLog(book, logs, saved)
  if (book.status !== 'done') return currentPage === book.currentPage ? book : { ...book, currentPage }
  const finished = logs.some(log => log.bookId === book.id && log.id !== saved.id && log.finished)
    || (book.totalPages > 0 && currentPage >= book.totalPages)
  if (finished) return currentPage === book.currentPage ? book : { ...book, currentPage }
  return { ...book, currentPage, status: 'reading', finishedAt: null, finishedBy: undefined }
}

/** The logs once one is gone. A later log that started from the page the removed one reached now starts
 *  where the removed one started, so deleting 50 then 120 ends on the same page as 120 then 50. Given the
 *  book, later older logs (no `previousPage`) up to the next newer one get the page they now start from,
 *  worked out while the removed log still anchors it; without that, the next delete could not tell. */
export function dropReadingLog(logs: readonly ReadingLog[], id: string, book?: Book, refPage?: number): ReadingLog[] {
  const removed = logs.find(log => log.id === id)
  const before = removed && book ? previousPageOf(book, logs, removed, refPage) : removed?.previousPage
  const start = typeof before === 'number' ? before : undefined
  const reached = removed ? (book ? reach(book, removed) : removed.page) : null
  const later = removed ? logs.filter(log => log.bookId === removed.bookId && log.id !== id && log.createdAt >= removed.createdAt) : []
  const stop = later.filter(log => log.previousPage !== undefined).map(log => log.createdAt).sort()[0]
  return logs.flatMap(log => {
    if (log.id === id) return []
    if (!removed || start === undefined || !later.includes(log)) return [log]
    if (log.previousPage === undefined) {
      if (!book || (stop !== undefined && log.createdAt > stop)) return [log]
      const between = later.filter(item => item.createdAt < log.createdAt)
      return [{ ...log, previousPage: Math.max(start, ...pagesOf(book, between)) }]
    }
    const relink = reached !== null && reached > start && log.previousPage === reached
    return [relink ? { ...log, previousPage: start } : log]
  })
}

/** The library once 삭제 on one Home reading row ran: the log goes and its book is worked out again from
 *  the logs left (bookWithoutLog). The book itself always stays, even with no log left, finished or not;
 *  only deleting the book (reading page or 서재) moves it to the trash. */
export function withoutReadingLog<T extends { books: Book[]; logs: ReadingLog[] }>(data: T, saved: ReadingRef): T {
  return {
    ...data,
    books: data.books.map(item => item.id === saved.bookId ? bookWithoutLog(item, data.logs, saved) : item),
    logs: dropReadingLog(data.logs, saved.id, data.books.find(item => item.id === saved.bookId), saved.previousPage),
  }
}

/** The library once a book is deleted on purpose (서재 or the reading page): the book and its logs go to
 *  the trash together, so restoring it brings both back. A reading-page delete also passes the copy it took
 *  out of the reading library (its notes, quotes and shelves); it shares the row with the 서재 book it was
 *  imported from, or has a row of its own when there is none. */
export function withoutBook<T extends { books: Book[]; logs: ReadingLog[]; trash: TrashItem[] }>(data: T, id: string, copy?: ReadingCopy): T {
  const book = data.books.find(item => item.id === id)
  const logs = data.logs.filter(log => log.bookId === id)
  const title = book?.title ?? copy?.book.book.title ?? ''
  const payload = copy ? { id: book?.id ?? copy.book.id, book: book ?? null, logs, copy } : { id, book, logs }
  return {
    ...data,
    books: data.books.filter(item => item.id !== id),
    logs: data.logs.filter(log => log.bookId !== id),
    trash: book || copy ? withTrash(data, toTrash('book', payload, title)) : data.trash,
  }
}

/** The last step of a book's 복구, once its reading-library copy is back and checked: the 서재 book and its
 *  logs return and the row leaves the trash, all in one change. A 서재 book still there under the same id
 *  (a delete that stopped before removing it) is kept as it is and only gets the logs it lacks. */
export function withBookRestored<T extends { books: Book[]; logs: ReadingLog[]; trash: TrashItem[] }>(data: T, rowId: string, bundle: { book: Book | null; logs: ReadingLog[] }): T {
  const trash = data.trash.filter(item => item.id !== rowId)
  const { book } = bundle
  if (!book) return { ...data, trash }
  return {
    ...data,
    trash,
    books: data.books.some(item => item.id === book.id) ? data.books : [book, ...data.books],
    logs: [...bundle.logs.filter(log => !data.logs.some(item => item.id === log.id)), ...data.logs],
  }
}

/** A book's trash row with what a 복구 that has not finished yet already wrote (see ReadingCopy.restore). */
export function withRestoreProgress(row: TrashItem, progress: RestoreProgress): TrashItem {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {}
  const copy = payload.copy && typeof payload.copy === 'object' ? payload.copy as Record<string, unknown> : null
  return copy ? { ...row, payload: { ...payload, copy: { ...copy, restore: progress } } } : row
}

/** Whether a delete that un-finished a legacy book may reopen its imported copy. The finish date alone cannot
 *  tell the import's finish from one set on the reading page the same day (re-reading, then 완독 again), so
 *  the copy must also be untouched since the app last wrote it: its `updated_at` still equals the one kept
 *  when the import (or an earlier delete) wrote it. A copy with no such record, imported before it was
 *  kept, is never reopened. */
export function reopensCopy(copy: { reading_status: string; finished_at: string | null; updated_at: string } | undefined, synced: string | undefined, finishedAt: string | null): boolean {
  return Boolean(copy && synced && copy.reading_status === 'done' && copy.finished_at === finishedAt && copy.updated_at === synced)
}

export type ReadingAudit = {
  /** Older logs whose starting page the book's records cannot settle; deleting them keeps the page. */
  logs: { bookId: string; title: string; logId: string; page: number | null; createdAt: string; reason: UnsureReason }[]
  /** Finished books with no recorded source; deleting their logs changes nothing on the book. */
  finished: { bookId: string; title: string; currentPage: number; totalPages: number; finishedAt: string | null }[]
}

/** For checking local data by hand (development builds expose it as `window.__blankyReadingAudit()`).
 *  Chat refs are not read here, so a log the ref check would settle at delete time may still be listed. */
export function auditReadingLogs(books: readonly Book[], logs: readonly ReadingLog[]): ReadingAudit {
  return {
    logs: logs.flatMap(log => {
      const book = log.previousPage === undefined ? books.find(item => item.id === log.bookId) : undefined
      const before = book ? previousPageOf(book, logs, log) : 0
      return book && typeof before !== 'number' ? [{ bookId: book.id, title: book.title, logId: log.id, page: log.page, createdAt: log.createdAt, reason: before.unsure }] : []
    }),
    finished: books.flatMap(book => book.status === 'done' && !book.finishedBy
      ? [{ bookId: book.id, title: book.title, currentPage: book.currentPage, totalPages: book.totalPages, finishedAt: book.finishedAt }] : []),
  }
}
