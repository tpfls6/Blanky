import type { BookMetadata } from '../../types/src/reading.ts';
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function string(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }

async function googleBooksError(response: Response): Promise<Error> {
    const payload = record(await response.json().catch(() => null));
    const error = record(payload.error);
    const reasons = [...(Array.isArray(error.errors) ? error.errors : []), ...(Array.isArray(error.details) ? error.details : [])].map(value => string(record(value).reason) ?? '').join(' ').toLowerCase();
    const message = (string(error.message) ?? '').toLowerCase();
    const detail = reasons + ' ' + message;
    if (/service_disabled|accessnotconfigured|has not been used|is disabled/.test(detail))
        return new Error('Google Books API가 활성화되지 않았습니다. API 키를 만든 Google Cloud 프로젝트에서 Books API를 활성화해 주세요.');
    if (/api_key_invalid|keyinvalid|api key not valid|api key expired/.test(detail))
        return new Error('Google Books API 키가 유효하지 않습니다. Supabase의 GOOGLE_BOOKS_API_KEY 값을 확인해 주세요.');
    if (/api_key_http_referrer_blocked|referer|referrer/.test(detail))
        return new Error('Google Books API 키의 웹사이트 제한으로 서버 검색이 차단되었습니다. 서버용 키의 애플리케이션 제한 설정을 확인해 주세요.');
    if (/api_key_service_blocked|api_key_ip_address_blocked|iprefererblocked|blocked|not allowed/.test(detail))
        return new Error('Google Books API 키의 접근 제한으로 검색이 차단되었습니다. Books API 허용 여부와 서버 IP 제한을 확인해 주세요.');
    if (response.status === 429 || /quota|ratelimit|dailylimit|resource_exhausted/.test(detail))
        return new Error('Google Books 검색 할당량을 초과했습니다. 잠시 후 다시 시도하거나 Google Cloud 할당량을 확인해 주세요.');
    if (response.status === 401 || response.status === 403)
        return new Error('Google Books 검색 권한이 거부되었습니다. API 키, Books API 활성화 및 키 제한 설정을 확인해 주세요. (HTTP ' + response.status + ')');
    return new Error('도서 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요. (HTTP ' + response.status + ')');
}

export function mapGoogleBook(value: unknown): BookMetadata | null {
    const row = record(value), info = record(row.volumeInfo), id = string(row.id), title = string(info.title);
    if (!id || !title)
        return null;
    const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers.map(record) : [];
    const image = string(record(info.imageLinks).thumbnail) ?? string(record(info.imageLinks).smallThumbnail);
    const categories = [...new Set([...(Array.isArray(info.categories) ? info.categories : []), info.mainCategory].filter((value): value is string => typeof value === 'string' && !!value.trim()).map(value => value.trim()))];
    return { categories, external_source: 'google', external_id: id, title, author: Array.isArray(info.authors) ? info.authors.filter(a => typeof a === 'string').join(', ') : '', publisher: string(info.publisher), published_date: string(info.publishedDate), description: string(info.description), cover_url: image && /^https?:\/\//.test(image) ? image.replace(/^http:/, 'https:') : null, page_count: typeof info.pageCount === 'number' && info.pageCount > 0 ? Math.floor(info.pageCount) : null, isbn10: string(identifiers.find(i => i.type === 'ISBN_10')?.identifier), isbn13: string(identifiers.find(i => i.type === 'ISBN_13')?.identifier) };
}
export async function searchGoogleBooks(query: string, options: {
    key?: string;
    fetcher?: typeof fetch;
} = {}): Promise<BookMetadata[]> {
    const q = query.trim();
    if (!q || q.length > 200)
        throw new Error('검색어는 1~200자로 입력해 주세요.');
    const isbn = q.replace(/[-\s]/g, '');
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.search = new URLSearchParams({ q: /^(\d{10}|\d{13}|\d{9}X)$/i.test(isbn) ? 'isbn:' + isbn : q, maxResults: '24', printType: 'books', orderBy: 'relevance' }).toString();
    if (options.key)
        url.searchParams.set('key', options.key);
    const response = await (options.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok)
        throw await googleBooksError(response);
    const body = record(await response.json());
    return (Array.isArray(body.items) ? body.items : []).flatMap(item => { const book = mapGoogleBook(item); return book ? [book] : []; });
}

export async function getGoogleBook(id: string, key?: string): Promise<BookMetadata> {
 const url=new URL('https://www.googleapis.com/books/v1/volumes/'+encodeURIComponent(id));if(key)url.searchParams.set('key',key);
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw await googleBooksError(response);
 const book=mapGoogleBook(await response.json());if(!book)throw new Error('도서 정보를 찾을 수 없습니다.');return book;
}
