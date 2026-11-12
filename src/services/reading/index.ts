import { createReadingRepository, type ReadingRepository } from '@blanky/api';
import { readingProgress } from '@blanky/types';
import type { Book, ReadingLog } from '../../types/records.ts';
import { getCurrentUserId } from '../auth/index.ts';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts';
import { createLocalReadingRepository } from './local.ts';
import { importLegacyReadingNotes, legacyReadingNoteId } from './legacyNotes.ts';
import { reopensCopy } from '../../utils/readingLogs.ts';
import type { ReadingCopy, RestoreProgress } from '../../utils/trash.ts';
import { readingError } from './messages.ts';
import { snapshotBook, verifyCopy, writeCopy, type CopyStore } from './restore.ts';
export function readingService(userId: string): ReadingRepository {
    const repo = isSupabaseConfigured ? createReadingRepository(getSupabaseClient(), userId) : createLocalReadingRepository(userId);
    // Recheck identity before every remote operation, including extension-facing CRUD.
    return new Proxy(repo, { get(target, key) { const method = Reflect.get(target, key); if (typeof method !== 'function')
            return method; return async (...args: unknown[]) => { if (isSupabaseConfigured && await getCurrentUserId() !== userId)
            throw new Error(readingError('userChanged')); return method.apply(target, args); }; } });
}
const imports = new Map<string, Promise<void>>();
export async function importLegacyReading(userId: string, books: Book[], logs: ReadingLog[]): Promise<void> {
    if (imports.has(userId))
        await imports.get(userId);
    const task = (async () => {
        const key = 'blanky.reading.imported.' + userId;
        const completed: string[] = JSON.parse(localStorage.getItem(key) ?? '[]');
        const repo = readingService(userId);
        for (const book of books) {
            if (completed.includes(book.id))
                continue;
            const id = await repo.addBook({ external_source: 'blanky-legacy', external_id: userId + ':' + book.id, title: book.title, author: book.author, cover_url: book.cover, page_count: book.totalPages || null, isbn10: null, isbn13: null, publisher: null, published_date: null, description: null }, book.status);
            if (!id)
                throw new Error(readingError('importFailed'));
            if (!completed.includes(book.id + ':metadata')) {
                const copy = await repo.updateBook(id, { current_page: book.currentPage, total_pages: book.totalPages || null, progress: readingProgress(book.currentPage, book.totalPages), started_at: book.startedAt, finished_at: book.finishedAt });
                if (copy)
                    markSynced(userId, book.id, copy.updated_at);
                completed.push(book.id + ':metadata');
                localStorage.setItem(key, JSON.stringify(completed));
            }
            await importLegacyReadingNotes(repo, userId, book.id, id, logs);
            completed.push(book.id);
            localStorage.setItem(key, JSON.stringify(completed));
        }
    })();
    imports.set(userId, task);
    try {
        await task;
    }
    finally {
        if (imports.get(userId) === task)
            imports.delete(userId);
    }
}
/** The copy's `updated_at` each time the app itself wrote an imported book, by legacy book id. A copy changed
 *  on the reading page since then no longer matches, so a delete never reopens what the reader set. */
const syncedKey = (userId: string) => 'blanky.reading.synced.' + userId;
function syncedCopies(userId: string): Record<string, string> {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(syncedKey(userId)) ?? '{}');
        return value && typeof value === 'object' ? value as Record<string, string> : {};
    }
    catch {
        return {};
    }
}
function markSynced(userId: string, legacyBookId: string, updatedAt: string): void {
    localStorage.setItem(syncedKey(userId), JSON.stringify({ ...syncedCopies(userId), [legacyBookId]: updatedAt }));
}
/** Undoes the import of one legacy reading log: its note, and the copy's progress follows the legacy book's.
 *  The copy itself always stays, like the legacy book. Not yet imported: nothing to do.
 *  `reopen` carries the finish date of a legacy book this delete un-finished; the copy reopens only while it is
 *  still finished on that date and untouched since the app last wrote it (reopensCopy), so a status set on the
 *  reading page, even the same day, is left alone. */
export async function removeImportedReadingLog(userId: string, legacyBookId: string, logId: string, progress?: { currentPage: number; totalPages: number; reopen?: { finishedAt: string | null } }): Promise<void> {
    // An import still running (the reading page keeps it going after you leave) would otherwise copy the
    // book with the page it read before this delete, after the delete had found nothing to fix.
    await imports.get(userId)?.catch(() => undefined);
    const completed: string[] = JSON.parse(localStorage.getItem('blanky.reading.imported.' + userId) ?? '[]');
    if (!completed.includes(legacyBookId) && !completed.includes(legacyBookId + ':metadata'))
        return;
    const repo = readingService(userId);
    if (progress) {
        const library = await repo.getMyBooks();
        const id = importedBookId(userId, legacyBookId, library.books);
        // The imported copy follows the legacy book's recomputed progress.
        const copy = id ? library.books.find(row => row.id === id) : undefined;
        const synced = syncedCopies(userId)[legacyBookId];
        const reopen = Boolean(progress.reopen) && reopensCopy(copy, synced, progress.reopen?.finishedAt ?? null);
        if (id) {
            const saved = await repo.updateBook(id, { current_page: progress.currentPage, progress: readingProgress(progress.currentPage, progress.totalPages), ...(reopen ? { reading_status: 'reading' as const, finished_at: null } : {}) });
            // Still the app's own write only while the copy was untouched before it.
            if (saved && synced && copy?.updated_at === synced)
                markSynced(userId, legacyBookId, saved.updated_at);
        }
    }
    await repo.deleteReadingNote(await legacyReadingNoteId(userId, legacyBookId, logId));
}
/** What one book of the reading library holds, for the trash: the copy, its shelves, quotes and notes, and
 *  the 서재 book it was imported from. Nothing is removed here; the caller keeps the snapshot in the trash
 *  first and only then deletes the book (removeReadingCopy), so a failed or interrupted delete loses nothing.
 *  `repo` is a custom page's store; without it the reading page's own library is read. */
export async function readReadingCopy(userId: string, id: string, repo?: CopyStore, pageId?: string): Promise<ReadingCopy> {
    // An import still running could otherwise copy the book again right after this delete.
    if (!repo)
        await imports.get(userId)?.catch(() => undefined);
    const snapshot = await snapshotBook(repo ?? readingService(userId), id);
    if (pageId)
        return { ...snapshot, pageId };
    const prefix = userId + ':', { book } = snapshot;
    const legacyBookId = book.book.external_source === 'blanky-legacy' && book.book.external_id.startsWith(prefix) ? book.book.external_id.slice(prefix.length) : undefined;
    const synced = Boolean(legacyBookId) && syncedCopies(userId)[legacyBookId!] === book.updated_at;
    return { ...snapshot, legacyBookId, synced };
}
/** Deletes a book once its snapshot is in the trash. The remote store has no soft delete, so the row is really
 *  removed (its quotes, notes and shelf links go with it) and 복구 writes the snapshot back. */
export async function removeReadingCopy(userId: string, id: string, repo?: CopyStore): Promise<void> {
    await (repo ?? readingService(userId)).removeBook(id);
}
/** Writes a book from the trash back (writeCopy: each step safe to retry, a book this 복구 did not create is
 *  left alone as a conflict) and reads it back to check it against the snapshot (verifyCopy). `record` keeps
 *  the id of the book this 복구 created with the trash row, before anything else is written. Resolves only
 *  once every step passed; on any failure the trash row must stay. */
export async function restoreReadingCopy(userId: string, copy: ReadingCopy, record: (progress: RestoreProgress) => void | Promise<void>, repo?: CopyStore): Promise<void> {
    if (!repo)
        await imports.get(userId)?.catch(() => undefined);
    const store = repo ?? readingService(userId);
    const result = await writeCopy(store, copy, record);
    if (result.intact)
        return;
    // Still the app's own write when it was before the delete, so a later 서재 log delete may reopen it.
    if (!repo && result.updatedAt && copy.legacyBookId && copy.synced)
        markSynced(userId, copy.legacyBookId, result.updatedAt);
    await verifyCopy(store, copy, result.bookId);
}
/** The reading-library book imported from a legacy one, once the import has run. */
export function importedBookId(userId: string, legacyBookId: string, books: readonly { id: string; book: { external_source: string; external_id: string } }[]): string | undefined {
    return books.find(row => row.book.external_source === 'blanky-legacy' && row.book.external_id === userId + ':' + legacyBookId)?.id;
}
