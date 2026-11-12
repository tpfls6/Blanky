import assert from 'node:assert/strict'
import { test } from 'node:test'
import { freshLibrary } from '../src/data/freshLibrary.ts'
import { auditReadingLogs, dropReadingLog, pageWithoutLog, previousPageOf, reopensCopy, withoutBook, withoutReadingLog } from '../src/utils/readingLogs.ts'
import type { Book, CaptureRef, LibraryData } from '../src/types/records.ts'
import { asBookTrash, type ReadingCopy } from '../src/utils/trash.ts'

type ReadingRef = Extract<CaptureRef, { kind: 'reading' }>
/** One Home reading capture: a page, or a 완독 capture (with the total it states). */
type Entry = number | { page?: number | null; finished?: boolean; total?: number }

const book: Book = { id: 'b', title: '데미안', author: '', cover: null, startedAt: null, finishedAt: null, currentPage: 10, totalPages: 0, status: 'reading', createdAt: '2026-01-01T00:00:00.000Z' }

let next = 0
/** Logs captures the way Home does (utils/entries addReading, which node cannot load) one second apart,
 *  and returns the library with each log's chat ref. A book the first capture starts shares its time. */
function capture(start: LibraryData, entries: Entry[]): { data: LibraryData; refs: ReadingRef[] } {
  let data = start
  const refs: ReadingRef[] = []
  for (const entry of entries) {
    const { page = null, finished = false, total } = typeof entry === 'number' ? { page: entry } : entry
    const createdAt = new Date(Date.UTC(2026, 0, 2, 0, 0, next)).toISOString()
    const existing = data.books.find(item => item.title === '데미안')
    const id = 'log-' + next++
    const target = existing ?? { ...book, id: 'new-' + id, currentPage: 0, createdAt }
    const reached = Math.max(existing ? target.currentPage : 0, page ?? target.currentPage, finished ? total ?? target.totalPages : 0)
    const raised: Book = { ...target, currentPage: reached, totalPages: total ?? target.totalPages,
      ...(finished ? { status: 'done' as const, finishedAt: target.finishedAt ?? '2026-01-02', ...(target.status === 'done' && existing ? {} : { finishedBy: 'auto' as const }) } : {}) }
    const log = { id, bookId: target.id, date: '2026-01-02', page, note: '', createdAt, previousPage: existing?.currentPage ?? 0, ...(finished ? { finished: true } : {}) }
    refs.push({ kind: 'reading', id, bookId: target.id, newBook: !existing, title: target.title, previousPage: existing?.currentPage, page })
    data = { ...data, books: existing ? data.books.map(item => item.id === target.id ? raised : item) : [raised, ...data.books], logs: [log, ...data.logs] }
  }
  return { data, refs }
}

/** What 삭제 on one Home reading row does to the legacy library (state/library eraseCapture). */
const erase = (data: LibraryData, ref: ReadingRef): LibraryData => withoutReadingLog(data, ref)

/** Logs saved before `previousPage` was kept with them. */
const older = (data: LibraryData, keep: (page: number | null) => boolean = () => false): LibraryData =>
  ({ ...data, logs: data.logs.map(log => keep(log.page) ? log : { ...log, previousPage: undefined }) })

function permutations<T>(items: T[]): T[][] {
  return items.length <= 1 ? [items] : items.flatMap((item, at) => permutations(items.filter((_, other) => other !== at)).map(rest => [item, ...rest]))
}

const seeded = (patch: Partial<Book> = {}): LibraryData => ({ ...freshLibrary(), books: [{ ...book, ...patch }] })
const pageOf = (data: LibraryData) => data.books[0]?.currentPage

test('a Home reading log keeps the page the book had before it', () => {
  const { data } = capture(seeded(), [50, 120])
  assert.deepEqual(data.logs.map(log => [log.page, log.previousPage]), [[120, 50], [50, 10]])
  const started = capture(freshLibrary(), [30]).data
  assert.equal(started.logs[0].previousPage, 0, 'the log that starts a book starts from 0')
  assert.equal(started.books[0].createdAt, started.logs[0].createdAt, 'and shares its time')
})

test('newer logs: deleting every log in any order returns the book to its page before them', () => {
  for (const pages of [[50, 120], [50, 120, 200], [120, 50], [50, 50, 120]]) {
    const { data, refs } = capture(seeded(), pages)
    for (const order of permutations(refs)) {
      let state = data
      const trail: number[] = []
      for (const ref of order) { state = erase(state, ref); trail.push(pageOf(state)) }
      assert.equal(pageOf(state), 10, `pages ${pages} deleted as ${order.map(ref => ref.page)} went ${trail}`)
      assert.equal(state.logs.length, 0)
    }
  }
})

test('the page follows the logs that are left', () => {
  const { data, refs } = capture(seeded(), [10, 50, 120])
  // QA's case: 10 → 50 → 120, delete 120 then 50.
  const afterTop = erase(data, refs[2])
  assert.equal(pageOf(afterTop), 50)
  assert.equal(pageOf(erase(afterTop, refs[1])), 10)
  // The other order: deleting 50 first leaves 120, and deleting 120 then lands on 10, not 50.
  const afterMiddle = erase(data, refs[1])
  assert.equal(pageOf(afterMiddle), 120)
  assert.equal(pageOf(erase(afterMiddle, refs[2])), 10)
  // A log below the current page changes nothing.
  assert.equal(pageOf(erase(data, refs[0])), 120)
})

test('a log added after a delete starts from the page the delete left', () => {
  const first = capture(seeded(), [50, 120])
  const trimmed = erase(first.data, first.refs[1])
  const added = capture(trimmed, [80])
  assert.equal(added.data.logs[0].previousPage, 50)
  let state = erase(added.data, first.refs[0])
  assert.equal(pageOf(state), 80)
  state = erase(state, added.refs[0])
  assert.equal(pageOf(state), 10)
})

test('older logs of a book a capture started: every delete order lands on the logs left', () => {
  for (const pages of [[50, 120], [120, 50], [50, 120, 200], [30, 30, 90]]) {
    const { data: newer, refs } = capture(freshLibrary(), pages)
    const data = older(newer)
    for (const order of permutations(refs)) {
      let state = data
      const left = new Set(refs.map(ref => ref.id))
      const trail: Array<number | undefined> = []
      for (const ref of order) {
        state = erase(state, ref); left.delete(ref.id); trail.push(pageOf(state))
        const expected = Math.max(0, ...refs.filter(item => left.has(item.id)).map(item => item.page ?? 0))
        assert.equal(state.books.length, 1, 'the book stays')
        assert.equal(pageOf(state), expected, `pages ${pages} deleted as ${order.map(item => item.page)} went ${trail}`)
      }
      assert.equal(pageOf(state), 0, `pages ${pages} deleted as ${order.map(item => item.page)} went ${trail}`)
      assert.equal(state.logs.length, 0)
    }
  }
})

test('older logs of a book with no recorded start: only what a remaining log confirms is corrected', () => {
  const { data: newer, refs } = capture(seeded(), [50, 120])
  const data = older(newer)
  // 120 → 50: the ref copied 50 when 120 was saved and log 50 is still there to confirm it.
  const afterTop = erase(data, refs[1])
  assert.equal(pageOf(afterTop), 50)
  // Then nothing records the 10 the book started from, so the page stays as it is.
  assert.equal(pageOf(erase(afterTop, refs[0])), 50, 'unsure keeps the page')
  // 50 → 120 (QA's case, which used to land on 50): 50 is below the page, and nothing confirms where 120 began.
  const afterLow = erase(data, refs[0])
  assert.equal(pageOf(afterLow), 120)
  assert.equal(afterLow.logs[0].previousPage, undefined, 'no guess is written down')
  assert.equal(pageOf(erase(afterLow, refs[1])), 120, 'unsure keeps the page')
  // Without a ref there is no confirmation either.
  assert.equal(pageOf(erase(data, { ...refs[1], previousPage: undefined })), 120)
})

test('older logs followed by newer ones', () => {
  const started = capture(freshLibrary(), [50])
  const { data: mixed, refs: later } = capture(older(started.data), [120, 200])
  const refs = [...started.refs, ...later]
  for (const order of permutations(refs)) {
    let state = mixed
    const left = new Set(refs.map(ref => ref.id))
    for (const ref of order) {
      state = erase(state, ref); left.delete(ref.id)
      assert.equal(pageOf(state), Math.max(0, ...refs.filter(item => left.has(item.id)).map(item => item.page ?? 0)), `deleted as ${order.map(item => item.page)}`)
    }
  }
})

test('older logs that disagree with the book or share a time are left alone', () => {
  const { data: newer, refs } = capture(freshLibrary(), [50, 120])
  // The book was edited to 150 after its logs: something besides the logs moved it.
  const edited = older({ ...newer, books: newer.books.map(item => ({ ...item, currentPage: 150 })) })
  assert.deepEqual(previousPageOf(edited.books[0], edited.logs, edited.logs[0]), { unsure: 'mismatch' })
  const tied = older({ ...newer, logs: newer.logs.map(log => ({ ...log, createdAt: newer.books[0].createdAt })) })
  assert.deepEqual(previousPageOf(tied.books[0], tied.logs, tied.logs[0]), { unsure: 'order' })
  assert.equal(pageOf(erase(tied, refs[1])), 120)
  // A ref that disagrees with the logs (a log before it was deleted by an older build) is not trusted.
  const plain = older(newer)
  assert.deepEqual(previousPageOf(plain.books[0], plain.logs, plain.logs[0], 80), { unsure: 'mismatch' })
})

test('working out older logs is repeatable and writes only what it settles', () => {
  const { data: newer, refs } = capture(freshLibrary(), [50, 120, 200])
  const data = older(newer)
  const target = data.books[0]
  const first = data.logs.map(log => previousPageOf(target, data.logs, log))
  assert.deepEqual(data.logs.map(log => previousPageOf(target, data.logs, log)), first)
  assert.deepEqual(first, [120, 50, 0])
  assert.deepEqual(dropReadingLog(data.logs, 'missing', target), data.logs, 'no such log changes nothing')
  // Deleting 50 writes the pages the later older logs now start from, the same ones working them out gives.
  const after = erase(data, refs[0])
  assert.deepEqual(after.logs.map(log => [log.page, log.previousPage]), [[200, 120], [120, 0]])
  assert.deepEqual(after.logs.map(log => previousPageOf(after.books[0], after.logs, log)), [120, 0])
  assert.deepEqual(auditReadingLogs(after.books, after.logs), auditReadingLogs(after.books, after.logs))
  assert.equal(data.logs[0].previousPage, undefined, 'the input is not changed')
})

test('a book its logs finished is worked out again from the logs left', () => {
  // 100쪽, then 완독 (총 300쪽): the 완독 log raised the book to 300.
  const { data, refs } = capture(freshLibrary(), [100, { finished: true, total: 300 }])
  assert.deepEqual([data.books[0].status, data.books[0].finishedBy, pageOf(data)], ['done', 'auto', 300])
  const unfinished = erase(data, refs[1])
  assert.deepEqual([unfinished.books[0].status, unfinished.books[0].finishedAt, unfinished.books[0].finishedBy, pageOf(unfinished)], ['reading', null, undefined, 100])
  // The other order: the 완독 log stays, so the book stays finished at 300 until it goes too.
  const kept = erase(data, refs[0])
  assert.deepEqual([kept.books[0].status, pageOf(kept)], ['done', 300])
  const last = erase(kept, refs[1])
  assert.deepEqual([last.books[0].status, last.books[0].finishedAt, pageOf(last)], ['reading', null, 0])
  // Reaching the last page keeps it finished even once the 완독 log is gone.
  const full = capture(freshLibrary(), [{ page: 300, total: 300 }, { finished: true }])
  assert.deepEqual([erase(full.data, full.refs[1]).books[0].status, pageOf(erase(full.data, full.refs[1]))], ['done', 300])
})

test('a book finished by hand, or with no recorded source, keeps its status and page', () => {
  for (const finishedBy of ['manual', undefined] as const) {
    const start = seeded({ status: 'done', finishedAt: '2026-01-01', currentPage: 120, totalPages: 300, ...(finishedBy ? { finishedBy } : {}) })
    const { data, refs } = capture(start, [300])
    for (const order of permutations(refs)) {
      let state = data
      for (const ref of order) state = erase(state, ref)
      assert.deepEqual([state.books[0].status, state.books[0].finishedAt, state.books[0].finishedBy, pageOf(state)], ['done', '2026-01-01', finishedBy, 300], String(finishedBy))
    }
    // QA's case: a finished book used to drop to the page left (300 → 100) while staying done.
    const two = capture(start, [100, 300])
    assert.equal(pageOf(erase(two.data, two.refs[1])), 300)
  }
  // A 완독 capture on a book already finished by hand does not make it the logs' finish.
  const manual = capture(seeded({ status: 'done', finishedAt: '2026-01-01', finishedBy: 'manual', totalPages: 300 }), [{ finished: true }])
  assert.equal(manual.data.books[0].finishedBy, 'manual')
  assert.equal(erase(manual.data, manual.refs[0]).books[0].status, 'done')
})

test('the audit lists what deletes leave alone', () => {
  const { data: newer } = capture(seeded(), [50, 120])
  const audit = auditReadingLogs([...older(newer).books, { ...book, id: 'old', status: 'done', finishedAt: '2025-12-31' }], older(newer).logs)
  assert.deepEqual(audit.logs.map(row => [row.page, row.reason]), [[120, 'no-start'], [50, 'no-start']])
  assert.deepEqual(audit.finished.map(row => row.bookId), ['old'])
  const started = capture(freshLibrary(), [50, 120]).data
  assert.deepEqual(auditReadingLogs(started.books, older(started).logs).logs, [], 'a book a capture started settles every log')
  assert.equal(pageWithoutLog(started.books[0], started.logs, { kind: 'reading', id: 'missing', bookId: started.books[0].id, newBook: false, title: '' }), 120)
})

test('deleting the last log keeps the book, new or old, finished or not', () => {
  // A book the capture started: it stays, back at 0 and still reading.
  const fresh = capture(freshLibrary(), [30])
  const freshLeft = erase(fresh.data, fresh.refs[0])
  assert.deepEqual(freshLeft.books.map(item => [item.id, item.status, item.currentPage]), [[fresh.refs[0].bookId, 'reading', 0]])
  assert.equal(freshLeft.logs.length, 0)
  assert.deepEqual(freshLeft.trash, [], 'nothing goes to the trash')
  // A book from before: back to its page before the log.
  const old = capture(seeded(), [50])
  assert.deepEqual(erase(old.data, old.refs[0]).books.map(item => [item.id, item.currentPage]), [['b', 10]])
  // Finished by its logs (a 완독 capture that started the book): it stays, reopened at the page before.
  const auto = capture(freshLibrary(), [{ finished: true, total: 300 }])
  assert.deepEqual([auto.data.books[0].status, auto.data.books[0].finishedBy], ['done', 'auto'])
  const autoLeft = erase(auto.data, auto.refs[0])
  assert.deepEqual(autoLeft.books.map(item => [item.status, item.finishedAt, item.finishedBy, item.currentPage]), [['reading', null, undefined, 0]])
  assert.deepEqual(autoLeft.trash, [])
  // Finished by hand or with no recorded source: kept exactly as it was, page included.
  for (const finishedBy of ['manual', undefined] as const) {
    const start = seeded({ status: 'done', finishedAt: '2026-01-01', currentPage: 120, totalPages: 300, ...(finishedBy ? { finishedBy } : {}) })
    const one = capture(start, [80])
    const left = erase(one.data, one.refs[0])
    assert.deepEqual(left.books, one.data.books, String(finishedBy))
    assert.equal(left.logs.length, 0)
  }
  // A book a capture started and then finished by hand on the same day keeps its finish too.
  const started = capture(freshLibrary(), [40])
  const byHand = { ...started.data, books: started.data.books.map(item => ({ ...item, status: 'done' as const, finishedAt: '2026-01-02', finishedBy: 'manual' as const })) }
  assert.deepEqual(erase(byHand, started.refs[0]).books, byHand.books)
})

test('deleting a book on purpose moves it to the trash with its logs', () => {
  const { data } = capture(seeded(), [50, 120])
  const removed = withoutBook(data, 'b')
  assert.deepEqual(removed.books, [])
  assert.deepEqual(removed.logs, [])
  assert.deepEqual(removed.trash.map(row => [row.kind, row.id, row.title]), [['book', 'b', '데미안']])
  const payload = removed.trash[0].payload as { book: Book; logs: unknown[] }
  assert.deepEqual([payload.book, payload.logs.length], [data.books[0], 2])
  assert.equal(withoutBook(data, 'missing').trash.length, 0, 'no such book changes nothing')
})

test('a reading-page delete keeps the copy with the 서재 book, or alone when there is none', () => {
  const { data } = capture(seeded(), [50, 120])
  const copy = { book: { id: 'copy-1', book: { title: '데미안' } }, shelves: ['s1'], highlights: [{ id: 'h1', content: '문장' }], notes: [{ id: 'n1', content: '메모' }], legacyBookId: 'b', synced: true } as unknown as ReadingCopy
  const removed = withoutBook(data, 'b', copy)
  assert.deepEqual([removed.books.length, removed.logs.length], [0, 0])
  assert.deepEqual(removed.trash.map(row => [row.kind, row.id, row.title]), [['book', 'b', '데미안']])
  const bundle = asBookTrash(JSON.parse(JSON.stringify(removed.trash[0].payload)))
  assert.deepEqual([bundle?.book?.id, bundle?.logs.length, bundle?.copy?.book.id, bundle?.copy?.shelves, bundle?.copy?.highlights.length, bundle?.copy?.notes.length, bundle?.copy?.legacyBookId, bundle?.copy?.synced],
    ['b', 2, 'copy-1', ['s1'], 1, 1, 'b', true])
  // A book added on the reading page has no 서재 book: the row is the copy's own.
  const alone = withoutBook(data, '', { ...copy, legacyBookId: undefined })
  assert.deepEqual([alone.books.length, alone.logs.length], [1, 2], 'the 서재 stays as it is')
  assert.deepEqual(alone.trash.map(row => [row.id, row.title]), [['copy-1', '데미안']])
  const only = asBookTrash(alone.trash[0].payload)
  assert.deepEqual([only?.book, only?.logs, only?.copy?.book.id], [null, [], 'copy-1'])
  // Rows written before copies were kept still restore the 서재 book.
  assert.deepEqual(asBookTrash({ id: 'b', book: data.books[0], logs: data.logs })?.copy, null)
  assert.equal(asBookTrash({ id: 'x', book: null, copy: { book: {} } }), null, 'junk is dropped')
})

test('a same-day finish set on the reading page is not reopened by a log delete', () => {
  // Home 완독 on 2026-01-02 finished the legacy book; the import wrote the copy (done, same date).
  const imported = { reading_status: 'done', finished_at: '2026-01-02', updated_at: '2026-01-02T09:00:00.000Z' }
  assert.equal(reopensCopy(imported, imported.updated_at, '2026-01-02'), true, 'an untouched copy follows the legacy book')
  // On the reading page: 읽는 중 (re-read), then 완독 again the same day. The date matches, the write does not.
  const refinished = { ...imported, updated_at: '2026-01-02T15:00:00.000Z' }
  assert.equal(reopensCopy(refinished, imported.updated_at, '2026-01-02'), false)
  // A copy imported before the app kept its writes cannot be told apart, so it is left alone.
  assert.equal(reopensCopy(imported, undefined, '2026-01-02'), false)
  assert.equal(reopensCopy({ ...imported, reading_status: 'reading' }, imported.updated_at, '2026-01-02'), false)
  assert.equal(reopensCopy({ ...imported, finished_at: '2026-01-01' }, imported.updated_at, '2026-01-02'), false)
  assert.equal(reopensCopy(undefined, imported.updated_at, '2026-01-02'), false)
  // The legacy book (finished by its 완독 log) itself still reopens: only the copy's own finish is kept.
  const { data, refs } = capture(freshLibrary(), [100, { finished: true, total: 300 }])
  assert.deepEqual(erase(data, refs[1]).books.map(item => [item.status, item.currentPage]), [['reading', 100]])
})
