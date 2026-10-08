import { createReadingRepository, type ReadingRepository } from '@blanky/api';
import { readingProgress } from '@blanky/types';
import type { Book, ReadingLog } from '../../types/records.ts';
import { getCurrentUserId } from '../auth/index.ts';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts';
import { createLocalReadingRepository } from './local.ts';
import { importLegacyReadingNotes } from './legacyNotes.ts';
export function readingService(userId: string): ReadingRepository {
    const repo = isSupabaseConfigured ? createReadingRepository(getSupabaseClient(), userId) : createLocalReadingRepository(userId);
    // Recheck identity before every remote operation, including extension-facing CRUD.
    return new Proxy(repo, { get(target, key) { const method = Reflect.get(target, key); if (typeof method !== 'function')
            return method; return async (...args: unknown[]) => { if (isSupabaseConfigured && await getCurrentUserId() !== userId)
            throw new Error('로그인 사용자가 변경되었습니다.'); return method.apply(target, args); }; } });
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
                throw new Error('이전 독서 기록을 가져오기 위한 도서를 생성하지 못했습니다.');
            if (!completed.includes(book.id + ':metadata')) {
                await repo.updateBook(id, { current_page: book.currentPage, total_pages: book.totalPages || null, progress: readingProgress(book.currentPage, book.totalPages), started_at: book.startedAt, finished_at: book.finishedAt });
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
