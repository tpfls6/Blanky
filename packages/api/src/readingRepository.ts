import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.generated.ts';
import type { BookMetadata, BookPatch, HighlightInput, NoteInput, ReadingLibrary, ReadingStatus, ShelfInput } from '../../types/src/reading.ts';
import { validateBookPatch, validateShelf, validateHighlight, validateNote } from '../../types/src/reading.ts';
function checked<T>(result: {
    data: T;
    error: {
        message: string;
    } | null;
}): T { if (result.error)
    throw new Error(result.error.message); return result.data; }
export function createReadingRepository(client: SupabaseClient<Database>, userId: string) {
    return {
        async getMyBooks(): Promise<ReadingLibrary> {
            const [users, shelves, memberships] = await Promise.all([
                client.from('user_books').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
                client.from('reading_shelves').select('*').eq('user_id', userId).order('sort_order').order('created_at'),
                client.from('reading_shelf_books').select('*').eq('user_id', userId),
            ]);
            const rows = checked(users) ?? [];
            const metadata = rows.length ? checked(await client.from('books').select('*').in('id', rows.map(r => r.book_id))) ?? [] : [];
            return { books: rows.flatMap(row => { const book = metadata.find(b => b.id === row.book_id); return book ? [{ ...row, book }] : []; }), shelves: checked(shelves) ?? [], memberships: checked(memberships) ?? [] };
        },
        async getUserBook(id: string) { const library = await this.getMyBooks(); const book = library.books.find(b => b.id === id); if (!book)
            throw new Error('책을 찾을 수 없습니다.'); return book; },
        async addBook(book: BookMetadata, status: ReadingStatus, shelves: string[] = []) { return checked(await client.rpc('add_reading_book', { p_book: book as unknown as Json, p_status: status, p_shelves: shelves })); },
        async updateBook(id: string, patch: BookPatch) { validateBookPatch(patch); return checked(await client.from('user_books').update(patch).eq('id', id).eq('user_id', userId).select().single()); },
        async removeBook(id: string) { checked(await client.from('user_books').delete().eq('id', id).eq('user_id', userId)); },
        async getShelves() { return checked(await client.from('reading_shelves').select('*').eq('user_id', userId).order('sort_order')) ?? []; },
        async createShelf(input: ShelfInput) { validateShelf(input); return checked(await client.from('reading_shelves').insert({ ...input, user_id: userId }).select().single()); },
        async updateShelf(id: string, input: ShelfInput) { validateShelf(input); return checked(await client.from('reading_shelves').update(input).eq('id', id).eq('user_id', userId).select().single()); },
        async reorderShelves(ids: string[]) { checked(await client.rpc('reorder_reading_shelves', {p_ids: ids})); },
        async deleteShelf(id: string) { checked(await client.from('reading_shelves').delete().eq('id', id).eq('user_id', userId)); },
        async addBookToShelf(bookId: string, shelfId: string) { checked(await client.from('reading_shelf_books').upsert({ shelf_id: shelfId, user_book_id: bookId, user_id: userId }, { onConflict: 'shelf_id,user_book_id' })); },
        async removeBookFromShelf(bookId: string, shelfId: string) { checked(await client.from('reading_shelf_books').delete().eq('user_book_id', bookId).eq('shelf_id', shelfId).eq('user_id', userId)); },
        async getHighlights(bookId: string) { return checked(await client.from('reading_highlights').select('*').eq('user_id', userId).eq('user_book_id', bookId).order('created_at', { ascending: false })) ?? []; },
        async createHighlight(bookId: string, input: HighlightInput, id?: string) { validateHighlight(input); return checked(await client.from('reading_highlights').insert({ ...input, id, user_id: userId, user_book_id: bookId }).select().single()); },
        async updateHighlight(id: string, input: HighlightInput) { validateHighlight(input); return checked(await client.from('reading_highlights').update(input).eq('id', id).eq('user_id', userId).select().single()); },
        async deleteHighlight(id: string) { checked(await client.from('reading_highlights').delete().eq('id', id).eq('user_id', userId)); },
        async getReadingNotes(bookId: string) { return checked(await client.from('reading_notes').select('*').eq('user_id', userId).eq('user_book_id', bookId).order('created_at', { ascending: false })) ?? []; },
        async createReadingNote(bookId: string, input: NoteInput, id?: string) { validateNote(input); return checked(await client.from('reading_notes').insert({ ...input, id, user_id: userId, user_book_id: bookId }).select().single()); },
        async updateReadingNote(id: string, input: NoteInput) { validateNote(input); return checked(await client.from('reading_notes').update(input).eq('id', id).eq('user_id', userId).select().single()); },
        async deleteReadingNote(id: string) { checked(await client.from('reading_notes').delete().eq('id', id).eq('user_id', userId)); },
        async refreshCategories(): Promise<{updated:number;remaining:number}> {
            const result=await client.functions.invoke('search-books',{body:{action:'refreshCategories'}});
            if(result.error)throw new Error('도서 분류를 불러오지 못했습니다. 최신 Migration과 search-books 함수 배포를 확인해 주세요.');
            if(typeof result.data?.updated!=='number'||typeof result.data?.remaining!=='number')throw new Error('분류 응답을 확인해 주세요.');return result.data;
        },
        async searchBooks(query: string): Promise<BookMetadata[]> {
            const result = await client.functions.invoke('search-books', { body: { query } });
            if (result.error) {
                const context = (result.error as {
                    context?: Response;
                }).context;
                const detail = context?.json ? await context.json().catch(() => null) : null;
                throw new Error(typeof detail?.error === 'string' ? detail.error : '책 검색을 사용할 수 없습니다. search-books 함수 배포와 네트워크를 확인해 주세요.');
            }
            const data = result.data;
            if (!data || !Array.isArray(data.books))
                throw new Error('책 검색 결과를 확인할 수 없습니다.');
            return data.books;
        },
        async checkOwnership() { const { data, error } = await client.auth.getUser(); if (error || data.user?.id !== userId)
            throw new Error('로그인 사용자가 변경되었습니다.'); },
    };
}
export type ReadingRepository = ReturnType<typeof createReadingRepository>;
