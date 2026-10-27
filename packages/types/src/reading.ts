export const READING_STATUS = { want: '읽을 예정', reading: '읽는 중', done: '완독', stopped: '중단' } as const;
export type ReadingStatus = keyof typeof READING_STATUS;
export type BookMetadata = {
    external_source: string;
    external_id: string;
    isbn10: string | null;
    isbn13: string | null;
    title: string;
    author: string;
    publisher: string | null;
    published_date: string | null;
    description: string | null;
    cover_url: string | null;
    page_count: number | null;
    categories?: string[];
};
export type ReadingBook = BookMetadata & {
    categories_fetched_at?: string | null;
    id: string;
    created_at: string;
};
export type UserBook = {
    id: string;
    user_id: string;
    book_id: string;
    reading_status: ReadingStatus;
    rating: number | null;
    current_page: number;
    total_pages: number | null;
    progress: number;
    started_at: string | null;
    finished_at: string | null;
    review: string;
    tags: string[];
    created_at: string;
    updated_at: string;
};
export type Shelf = {
    id: string;
    user_id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
};
export type ShelfBook = {
    shelf_id: string;
    user_book_id: string;
    user_id: string;
    created_at: string;
};
export type Highlight = {
    id: string;
    user_id: string;
    user_book_id: string;
    content: string;
    page_number: number | null;
    note: string;
    tags: string[];
    source_type: 'manual' | 'web' | 'pdf' | 'kindle';
    source_url: string | null;
    source_title: string | null;
    created_at: string;
    updated_at: string;
};
export type ReadingNote = {
    id: string;
    user_id: string;
    user_book_id: string;
    content: string;
    tags: string[];
    created_at: string;
    updated_at: string;
};
export type LibraryBook = UserBook & {
    book: ReadingBook;
};
export type ReadingLibrary = {
    books: LibraryBook[];
    shelves: Shelf[];
    memberships: ShelfBook[];
};
export type BookPatch = Partial<Pick<UserBook, 'reading_status' | 'rating' | 'current_page' | 'total_pages' | 'progress' | 'started_at' | 'finished_at' | 'review' | 'tags'>>;
export type ShelfInput = Pick<Shelf, 'name' | 'description' | 'icon' | 'color' | 'sort_order'>;
export type HighlightInput = Pick<Highlight, 'content' | 'page_number' | 'note' | 'tags' | 'source_type' | 'source_url' | 'source_title'>;
export type NoteInput = Pick<ReadingNote, 'content' | 'tags'>;
export function readingProgress(current: number, total: number | null): number { return total && total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0; }
export function sameBook(a: BookMetadata, b: BookMetadata): boolean { return !!((a.isbn13 && a.isbn13 === b.isbn13) || (a.isbn10 && a.isbn10 === b.isbn10) || (a.external_source === b.external_source && a.external_id === b.external_id)); }
export function validateBookPatch(p: BookPatch) {
    if (p.reading_status !== undefined && !Object.hasOwn(READING_STATUS, p.reading_status))
        throw new Error('독서 상태를 확인해 주세요.');
    for (const value of [p.current_page, p.total_pages])
        if (value != null && (!Number.isInteger(value) || value < 0))
            throw new Error('페이지는 0 이상의 정수입니다.');
    if (p.progress !== undefined && (!Number.isFinite(p.progress) || p.progress < 0 || p.progress > 100))
        throw new Error('진행률은 0~100입니다.');
    if (p.rating != null && (!Number.isFinite(p.rating) || p.rating < 1 || p.rating > 5 || p.rating * 2 % 1))
        throw new Error('별점은 1~5점, 0.5 단위입니다.');
}
export function validateShelf(input: ShelfInput) {
    if (!input.name.trim() || input.name.trim().length > 100)
        throw new Error('책장 이름은 1~100자로 입력해 주세요.');
    if (!['primary', 'accent', 'textSecondary'].includes(input.color) && !/^#[0-9a-f]{6}$/i.test(input.color))
        throw new Error('테마 색상을 선택해 주세요.');
    if (!Number.isInteger(input.sort_order) || input.sort_order < 0)
        throw new Error('순서는 0 이상의 정수입니다.');
}
export function validateHighlight(input: HighlightInput) {
    if (!input.content.trim())
        throw new Error('문장을 입력해 주세요.');
    if (input.page_number !== null && (!Number.isInteger(input.page_number) || input.page_number < 1))
        throw new Error('페이지는 1 이상의 정수입니다.');
    if (!['manual', 'web', 'pdf', 'kindle'].includes(input.source_type))
        throw new Error('지원하지 않는 문장 출처입니다.');
}
export function validateNote(input: NoteInput) {
    if (!input.content.trim())
        throw new Error('메모를 입력해 주세요.');
}
