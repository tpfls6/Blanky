import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapGoogleBook, searchGoogleBooks } from './bookSearch.ts';
import { readingProgress, sameBook, validateBookPatch, validateHighlight, validateShelf } from '../../types/src/reading.ts';
import { createReadingRepository } from './readingRepository.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.generated.ts';
const volume = { id: 'v1', volumeInfo: { title: '한국 책', authors: ['저자'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567890' }], imageLinks: { thumbnail: 'http://books.google.com/cover' }, pageCount: 350 } };
test('search maps optional metadata, Korean query, ISBN query and provider failure', async () => {
    const book = mapGoogleBook(volume)!;
    assert.equal(book.cover_url, 'https://books.google.com/cover');
    assert.equal(book.page_count, 350);
    assert.equal(book.publisher, null);
    assert.equal(mapGoogleBook({ id: 'bad' }), null);
    let url = '';
    const fetcher = (async (input: URL | RequestInfo) => { url = String(input); return Response.json({ items: [volume, { id: 'bad' }] }); }) as typeof fetch;
    assert.equal((await searchGoogleBooks('한국 책', { fetcher })).length, 1);
    assert.equal(new URL(url).searchParams.get('q'), '한국 책');
    assert.equal(new URL(url).searchParams.has('key'), false);
    await searchGoogleBooks('978-1234567890', { fetcher, key: 'server-test' });
    assert.equal(new URL(url).searchParams.get('q'), 'isbn:9781234567890');
    await assert.rejects(() => searchGoogleBooks('x', { fetcher: async () => new Response('', { status: 429 }) }), /잠시/);
    await assert.rejects(() => searchGoogleBooks(' '));
    assert.deepEqual(await searchGoogleBooks('empty', { fetcher: async () => Response.json({}) }), []);
});
test('book identity deduplicates provider ID and ISBN without equating unrelated editions', () => {
    const book = mapGoogleBook(volume)!;
    assert.ok(sameBook(book, { ...book, external_source: 'another', external_id: 'v2' }));
    assert.ok(sameBook(book, { ...book, isbn13: null }));
    assert.equal(sameBook(book, { ...book, external_id: 'v3', isbn13: 'different' }), false);
});
test('progress is clamped and manual progress, stopped state and half-star rating are supported', () => {
    assert.equal(readingProgress(220, 350), 63);
    assert.equal(readingProgress(500, 350), 100);
    assert.equal(readingProgress(10, null), 0);
    validateBookPatch({ reading_status: 'stopped', progress: 42, rating: 4.5 });
    for (const p of [{ progress: 101 }, { progress: NaN }, { current_page: -1 }, { total_pages: 3.5 }, { rating: 4.2 }, { rating: 0 }])
        assert.throws(() => validateBookPatch(p));
});
test('remote mutations constrain owner and atomic add never accepts a client-supplied owner', async () => {
    const calls: unknown[] = [];
    const client = { from: (table: string) => { calls.push(table); const q = { update: (p: unknown) => { calls.push(p); return q; }, delete: () => q, eq: (k: string, v: string) => { calls.push([k, v]); return q; }, select: () => q, single: async () => ({ data: { id: 'book' }, error: null }), then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) }; return q; }, rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: 'id', error: null }; } } as unknown as SupabaseClient<Database>;
    const repo = createReadingRepository(client, 'owner');
    await repo.updateBook('book', { reading_status: 'done' });
    assert.ok(calls.some(v => JSON.stringify(v) === '["user_id","owner"]'));
    await repo.removeBookFromShelf('book', 'shelf');
    assert.ok(calls.some(v => JSON.stringify(v) === '["shelf_id","shelf"]'));
    await repo.addBook(mapGoogleBook(volume)!, 'want', ['shelf']);
    const rpc = calls.at(-1) as [
        string,
        Record<string, unknown>
    ];
    assert.equal(rpc[0], 'add_reading_book');
    assert.equal('user_id' in rpc[1], false);
});

test('record and shelf validation is identical in local and remote repositories', () => {
 assert.throws(() => validateBookPatch({reading_status:'constructor' as never}));
 assert.throws(() => validateShelf({name:' ',description:'',icon:'📚',color:'primary',sort_order:0}));
 assert.throws(() => validateShelf({name:'책장',description:'',icon:'📚',color:'primary',sort_order:1.5}));
 assert.throws(() => validateHighlight({content:'문장',page_number:0,note:'',tags:[],source_type:'manual',source_url:null,source_title:null}));
 validateHighlight({content:'문장',page_number:null,note:'',tags:[],source_type:'web',source_url:'https://example.test',source_title:'자료'});
});

test('Google subject categories are preserved, normalized and optional',()=>{
 const mapped=mapGoogleBook({...volume,volumeInfo:{...volume.volumeInfo,categories:['Fiction','Fiction',' Philosophy ',123],mainCategory:'Fiction'}})!;
 assert.deepEqual(mapped.categories,['Fiction','Philosophy']);assert.deepEqual(mapGoogleBook(volume)!.categories,[]);
});
test('shelf reorder is one owner-checked database RPC',async()=>{
 const calls:unknown[]=[];
 const client={rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {data:null,error:null}}} as unknown as SupabaseClient<Database>;
 await createReadingRepository(client,'owner').reorderShelves(['second','first']);
 assert.deepEqual(calls,[['reorder_reading_shelves',{p_ids:['second','first']}]]);
});

import { importLegacyReadingNotes, legacyReadingNoteId } from '../../../src/services/reading/legacyNotes.ts';
import type { ReadingNote } from '../../types/src/reading.ts';
import type { ReadingLog } from '../../../src/types/records.ts';

test('legacy note IDs are valid, stable UUIDs scoped to the owner and book', async () => {
    const id = await legacyReadingNoteId('owner', 'book-forest', 'log-forest-2');
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(await legacyReadingNoteId('owner', 'book-forest', 'log-forest-2'), id);
    assert.notEqual(await legacyReadingNoteId('other', 'book-forest', 'log-forest-2'), id);
    assert.notEqual(await legacyReadingNoteId('owner', 'another-book', 'log-forest-2'), id);
    assert.equal(await legacyReadingNoteId('owner', 'book', id), id);
});

test('legacy import resumes after partial failure without duplicates or content loss', async () => {
    const notes: ReadingNote[] = [];
    let fail = true;
    const repo = {
        async getReadingNotes() { return [...notes]; },
        async createReadingNote(bookId: string, input: {content: string; tags: string[]}, id?: string) {
            assert.match(id!, /^[0-9a-f-]{36}$/);
            if (notes.length === 1 && fail) { fail = false; throw new Error('network'); }
            const note = {...input, id: id!, user_id: 'owner', user_book_id: bookId, created_at: '', updated_at: ''};
            notes.push(note);
            return note;
        },
    };
    const logs: ReadingLog[] = [
        {id: 'log-forest-2', bookId: 'book-forest', date: '2026-10-08', page: 130, note: '나오코 부분이 인상적이었다.', createdAt: ''},
        {id: 'log-forest-1', bookId: 'book-forest', date: '2026-10-05', page: 90, note: '90페이지까지 읽음.', createdAt: ''},
        {id: 'unrelated', bookId: 'another-book', date: '2026-10-08', page: null, note: '다른 책', createdAt: ''},
    ];
    const run = () => importLegacyReadingNotes(repo, 'owner', 'book-forest', 'remote-book', logs);
    await assert.rejects(run, /network/);
    await run();
    await run();
    assert.equal(notes.length, 2);
    assert.equal(notes[0].content, '2026-10-08\np.130\n나오코 부분이 인상적이었다.');
    assert.equal(notes[0].user_book_id, 'remote-book');
    assert.notEqual(notes[0].id, notes[1].id);
    // Preserve notes already imported in local mode with the original string ID.
    notes[0].id = 'log-forest-2';
    await run();
    assert.equal(notes.length, 2);
});


test('Google Books failures identify configuration and quota problems without leaking provider payloads', async () => {
    const cases = [
        {status:403, reason:'SERVICE_DISABLED', expected:/활성화되지/},
        {status:400, reason:'API_KEY_INVALID', expected:/유효하지/},
        {status:403, reason:'API_KEY_HTTP_REFERRER_BLOCKED', expected:/웹사이트 제한/},
        {status:403, reason:'API_KEY_SERVICE_BLOCKED', expected:/접근 제한/},
        {status:403, reason:'dailyLimitExceeded', expected:/할당량/},
        {status:429, reason:'RESOURCE_EXHAUSTED', expected:/할당량/},
        {status:403, reason:'unknown', expected:/권한이 거부/},
        {status:503, reason:'unknown', expected:/HTTP 503/},
    ];
    for (const entry of cases) {
        await assert.rejects(() => searchGoogleBooks('밝은 밤', {fetcher:async () => Response.json({error:{message:'private-project-and-key',details:[{reason:entry.reason}]}},{status:entry.status})}), error => {
            assert.ok(error instanceof Error);
            assert.match(error.message, entry.expected);
            assert.equal(error.message.includes('private-project-and-key'), false);
            return true;
        });
    }
    await assert.rejects(() => searchGoogleBooks('책', {fetcher:async () => Response.json({error:{errors:[{reason:'accessNotConfigured'}]}},{status:403})}), /활성화되지/);
    await assert.rejects(() => searchGoogleBooks('책', {fetcher:async () => new Response('unavailable', {status:502})}), /HTTP 502/);
});
