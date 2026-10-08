import { createClient } from 'npm:@supabase/supabase-js@2';
import { searchGoogleBooks, getGoogleBook } from '../../../packages/api/src/bookSearch.ts';
declare const Deno: {
    serve(handler: (request: Request) => Promise<Response>): void;
    env: {
        get(key: string): string | undefined;
    };
};
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async (request) => {
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
    if (request.method === 'OPTIONS')
        return new Response('ok', { headers });
    if (request.method !== 'POST')
        return reply({ error: '지원하지 않는 요청입니다.' }, 405);
    const authorization = request.headers.get('Authorization');
    if (!authorization)
        return reply({ error: '로그인이 필요합니다.' }, 401);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data, error } = await client.auth.getUser();
    if (error || !data.user)
        return reply({ error: '로그인이 필요합니다.' }, 401);
    let body: {
        query?: unknown;
        action?: unknown;
    };
    try {
        body = await request.json();
    }
    catch {
        return reply({ error: '입력을 확인해 주세요.' }, 400);
    }

    const key = Deno.env.get('GOOGLE_BOOKS_API_KEY');
    if (!key)
        return reply({ error: '책 검색 API Key가 설정되지 않았습니다. GOOGLE_BOOKS_API_KEY를 Edge Function Secret에 설정해 주세요.' }, 503);
    if (body?.action === 'refreshCategories') {
        try {
            const owned=await client.from('user_books').select('book_id').eq('user_id',data.user.id);if(owned.error)throw owned.error;
            const ids=(owned.data??[]).map(row=>row.book_id);if(!ids.length)return reply({updated:0,remaining:0});
            const pending=await client.from('books').select('id,external_id').in('id',ids).eq('external_source','google').is('categories_fetched_at',null);if(pending.error)throw pending.error;
            const batch=(pending.data??[]).slice(0,20);
            const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
            // Only books discovered through this caller's RLS-protected library are updated.
            for(let i=0;i<batch.length;i+=4)await Promise.all(batch.slice(i,i+4).map(async book=>{
                const metadata=await getGoogleBook(book.external_id,key);
                const updated=await admin.from('books').update({categories:metadata.categories??[],categories_fetched_at:new Date().toISOString()}).eq('id',book.id).eq('external_source','google');if(updated.error)throw updated.error;
            }));
            return reply({updated:batch.length,remaining:Math.max(0,(pending.data?.length??0)-batch.length)});
        } catch (error) {return reply({error:error instanceof Error ? error.message : '도서 분류를 가져오지 못했습니다.'},502)}
    }
    if(typeof body?.query!=='string'||!body.query.trim()||body.query.trim().length>200)return reply({error:'검색어는 1~200자로 입력해 주세요.'},400);
    try {
        return reply({ books: await searchGoogleBooks(body.query, { key }) });
    }
    catch (error) {
        return reply({ error: error instanceof Error ? error.message : '도서 검색 실패' }, 502);
    }
});
