import { sameBook, validateBookPatch, validateShelf, validateHighlight, validateNote } from '@blanky/types';
import type { Highlight, ReadingLibrary, ReadingNote, UserBook } from '@blanky/types';
import { searchGoogleBooks, getGoogleBook, type ReadingRepository } from '@blanky/api';
type Store = ReadingLibrary & {
    highlights: Highlight[];
    notes: ReadingNote[];
};
export function createLocalReadingRepository(userId: string): ReadingRepository {
    const key = 'blanky.reading.v1.' + userId;
    const read = (): Store => JSON.parse(localStorage.getItem(key) ?? '{"books":[],"shelves":[],"memberships":[],"highlights":[],"notes":[]}');
    const save = (s: Store) => localStorage.setItem(key, JSON.stringify(s));
    const stamp = () => new Date().toISOString();
    const findBook = (s: Store, id: string) => { const b = s.books.find(b => b.id === id); if (!b)
        throw new Error('책을 찾을 수 없습니다.'); return b; };
    const shelfCheck = (s: Store, id: string) => { if (!s.shelves.some(x => x.id === id))
        throw new Error('책장을 찾을 수 없습니다.'); };
    const membership = (s: Store, bookId: string, shelfId: string) => { findBook(s, bookId); shelfCheck(s, shelfId); if (!s.memberships.some(m => m.user_book_id === bookId && m.shelf_id === shelfId))
        s.memberships.push({ user_id: userId, user_book_id: bookId, shelf_id: shelfId, created_at: stamp() }); };
    return {
        async getMyBooks() { const s = read(); return { books: s.books, shelves: s.shelves.sort((a, b) => a.sort_order - b.sort_order), memberships: s.memberships }; },
        async getUserBook(id) { return findBook(read(), id); },
        async addBook(book, status, shelves = []) { validateBookPatch({ reading_status: status }); const s = read(); shelves.forEach(id => shelfCheck(s, id)); let b = s.books.find(b => sameBook(book, b.book)); if (!b) {
            const now = stamp();
            b = { id: crypto.randomUUID(), user_id: userId, book_id: crypto.randomUUID(), reading_status: status, rating: null, current_page: 0, total_pages: book.page_count, progress: status === 'done' ? 100 : 0, started_at: null, finished_at: null, review: '', tags: [], created_at: now, updated_at: now, book: { ...book, categories_fetched_at: book.categories !== undefined ? now : null, id: crypto.randomUUID(), created_at: now } };
            b.book_id = b.book.id;
            s.books.unshift(b);
        } shelves.forEach(id => membership(s, b.id, id)); save(s); return b.id; },
        async updateBook(id, patch) { validateBookPatch(patch); const s = read(), b = findBook(s, id); Object.assign(b, patch, { updated_at: stamp() }); save(s); return b as UserBook; },
        async removeBook(id) { const s = read(); s.books = s.books.filter(b => b.id !== id); s.memberships = s.memberships.filter(m => m.user_book_id !== id); s.highlights = s.highlights.filter(h => h.user_book_id !== id); s.notes = s.notes.filter(n => n.user_book_id !== id); save(s); },
        async getShelves() { return read().shelves; },
        async createShelf(input) { validateShelf(input); if (!input.name.trim())
            throw new Error('책장 이름을 입력해 주세요.'); const s = read(), now = stamp(), shelf = { ...input, id: crypto.randomUUID(), user_id: userId, created_at: now, updated_at: now }; s.shelves.push(shelf); save(s); return shelf; },
        async updateShelf(id, input) { validateShelf(input); const s = read(); shelfCheck(s, id); if (!input.name.trim())
            throw new Error('책장 이름을 입력해 주세요.'); const shelf = s.shelves.find(x => x.id === id)!; Object.assign(shelf, input, { updated_at: stamp() }); save(s); return shelf; },
        async reorderShelves(ids) {
            const s=read();
            if(ids.length!==s.shelves.length || new Set(ids).size!==ids.length || ids.some(id=>!s.shelves.some(shelf=>shelf.id===id)))throw new Error('책장 순서를 다시 확인해 주세요.');
            s.shelves.forEach(shelf=>{shelf.sort_order=ids.indexOf(shelf.id);shelf.updated_at=stamp()});save(s);
        },
        async deleteShelf(id) { const s = read(); s.shelves = s.shelves.filter(x => x.id !== id); s.memberships = s.memberships.filter(m => m.shelf_id !== id); save(s); },
        async addBookToShelf(bookId, shelfId) { const s = read(); membership(s, bookId, shelfId); save(s); },
        async removeBookFromShelf(bookId, shelfId) { const s = read(); s.memberships = s.memberships.filter(m => !(m.user_book_id === bookId && m.shelf_id === shelfId)); save(s); },
        async getHighlights(bookId) { return read().highlights.filter(h => h.user_book_id === bookId).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
        async createHighlight(bookId, input, id = crypto.randomUUID()) { validateHighlight(input); const s = read(); findBook(s, bookId); if (!input.content.trim())
            throw new Error('문장을 입력해 주세요.'); if (s.highlights.some(h => h.id === id))
            throw new Error('이미 저장한 문장입니다.'); const now = stamp(), h = { ...input, id, user_id: userId, user_book_id: bookId, created_at: now, updated_at: now }; s.highlights.unshift(h); save(s); return h; },
        async updateHighlight(id, input) { validateHighlight(input); const s = read(), h = s.highlights.find(h => h.id === id); if (!h)
            throw new Error('문장을 찾을 수 없습니다.'); if (!input.content.trim())
            throw new Error('문장을 입력해 주세요.'); Object.assign(h, input, { updated_at: stamp() }); save(s); return h; },
        async deleteHighlight(id) { const s = read(); s.highlights = s.highlights.filter(h => h.id !== id); save(s); },
        async getReadingNotes(bookId) { return read().notes.filter(n => n.user_book_id === bookId).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
        async createReadingNote(bookId, input, id = crypto.randomUUID()) { validateNote(input); const s = read(); findBook(s, bookId); if (!input.content.trim())
            throw new Error('메모를 입력해 주세요.'); if (s.notes.some(n => n.id === id))
            throw new Error('이미 저장한 메모입니다.'); const now = stamp(), n = { ...input, id, user_id: userId, user_book_id: bookId, created_at: now, updated_at: now }; s.notes.unshift(n); save(s); return n; },
        async updateReadingNote(id, input) { validateNote(input); const s = read(), n = s.notes.find(n => n.id === id); if (!n)
            throw new Error('메모를 찾을 수 없습니다.'); if (!input.content.trim())
            throw new Error('메모를 입력해 주세요.'); Object.assign(n, input, { updated_at: stamp() }); save(s); return n; },
        async deleteReadingNote(id) { const s = read(); s.notes = s.notes.filter(n => n.id !== id); save(s); },
        async refreshCategories() {
            const s=read(),pending=s.books.filter(b=>b.book.external_source==='google'&&!b.book.categories_fetched_at&&!b.book.categories?.length);
            const batch=pending.slice(0,20);
            for(const b of batch){const metadata=await getGoogleBook(b.book.external_id);const current=read(),saved=current.books.find(saved=>saved.id===b.id);if(saved){saved.book.categories=metadata.categories??[];saved.book.categories_fetched_at=stamp();save(current)}}
            return {updated:batch.length,remaining:Math.max(0,pending.length-batch.length)};
        },
        async searchBooks(query) { return searchGoogleBooks(query); },
        async checkOwnership() { },
    };
}
