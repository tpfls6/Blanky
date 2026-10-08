import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const cache=new Map()
globalThis.localStorage={getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)}
const server=await createServer({envDir:false,define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'},server:{middlewareMode:true},appType:'custom'})
try {
 const {readingService,importLegacyReading}=await server.ssrLoadModule('/src/services/reading/index.ts')
 const {isSupabaseConfigured}=await server.ssrLoadModule('/src/services/supabase/client.ts')
 assert.equal(isSupabaseConfigured,false,'tests must not mutate production')
 const alice=readingService('reading-smoke-alice'),bob=readingService('reading-smoke-bob')
 const meta={external_source:'google',external_id:'smoke',title:'테스트 책',author:'테스트 저자',isbn10:null,isbn13:'9781234567890',publisher:'출판사',published_date:'2026',description:'책 설명',cover_url:null,page_count:350,categories:['Fiction','Literary Fiction']}
 const shelf=await alice.createShelf({name:'인생책',description:'오래 기억할 책',icon:'★',color:'primary',sort_order:0})
 const second=await alice.createShelf({name:'소설',description:'',icon:'📚',color:'accent',sort_order:1})
 await alice.reorderShelves([second.id,shelf.id]);assert.deepEqual((await alice.getMyBooks()).shelves.map(s=>s.id),[second.id,shelf.id]);
 await assert.rejects(()=>alice.reorderShelves([shelf.id,shelf.id]));await assert.rejects(()=>bob.reorderShelves([shelf.id]));
 const id=await alice.addBook(meta,'want',[shelf.id,second.id]);assert.equal((await alice.getUserBook(id)).reading_status,'want')
 assert.equal(await alice.addBook({...meta,external_id:'other-provider-id'},'done'),id,'ISBN duplicate retains existing reading record')
 assert.equal((await alice.getMyBooks()).books.length,1)
 await alice.updateBook(id,{reading_status:'reading',current_page:220,progress:63,rating:4,review:'좋았다',tags:['성장']})
 await alice.updateBook(id,{reading_status:'done',progress:100,finished_at:'2026-10-07'})
 await alice.updateBook(id,{reading_status:'stopped',progress:77,rating:4.5});assert.equal((await alice.getUserBook(id)).reading_status,'stopped');assert.equal((await alice.getUserBook(id)).progress,77)
 assert.equal((await alice.getMyBooks()).memberships.length,2)
 await alice.addBookToShelf(id,shelf.id);assert.equal((await alice.getMyBooks()).memberships.length,2)
 await alice.updateShelf(shelf.id,{name:'좋았던 책',description:'수정 설명',icon:'♡',color:'accent',sort_order:3})
 assert.equal((await alice.getShelves()).find(s=>s.id===shelf.id).name,'좋았던 책')
 await alice.removeBookFromShelf(id,shelf.id);assert.equal((await alice.getMyBooks()).memberships.length,1);assert.equal((await alice.getMyBooks()).books.length,1)
 await alice.deleteShelf(second.id);assert.equal((await alice.getMyBooks()).memberships.length,0);assert.equal((await alice.getMyBooks()).books.length,1)
 const highlight={content:'기억할 문장',page_number:72,note:'생각',tags:['삶'],source_type:'manual',source_url:null,source_title:null}
 const h=await alice.createHighlight(id,highlight);await alice.updateHighlight(h.id,{...highlight,content:'수정 문장'});assert.equal((await alice.getHighlights(id))[0].content,'수정 문장');await alice.deleteHighlight(h.id);assert.equal((await alice.getHighlights(id)).length,0)
 const n=await alice.createReadingNote(id,{content:'독서 메모',tags:['관계']});await alice.updateReadingNote(n.id,{content:'수정 메모',tags:[]});assert.equal((await alice.getReadingNotes(id))[0].content,'수정 메모');await alice.deleteReadingNote(n.id);assert.equal((await alice.getReadingNotes(id)).length,0)
 assert.equal((await readingService('reading-smoke-alice').getMyBooks()).books[0].rating,4.5,'new service instance reloads persisted data')
 assert.equal((await bob.getMyBooks()).books.length,0);await assert.rejects(()=>bob.updateBook(id,{review:'stolen'}));await assert.rejects(()=>bob.addBookToShelf(id,shelf.id))
 const legacy=[{id:crypto.randomUUID(),title:'기존 책',author:'저자',cover:null,totalPages:100,currentPage:25,status:'reading',startedAt:null,finishedAt:null,createdAt:'2026-09-01'}]
 const logs=[{id:crypto.randomUUID(),bookId:legacy[0].id,date:'2026-09-02',page:25,note:'기존 감상',createdAt:'2026-09-02'}]
 await Promise.all([importLegacyReading('reading-smoke-alice',legacy,logs),importLegacyReading('reading-smoke-alice',legacy,logs)])
 let data=await alice.getMyBooks();assert.equal(data.books.length,2);const migrated=data.books.find(b=>b.book.title==='기존 책');assert.equal(migrated.progress,25);assert.ok((await alice.getReadingNotes(migrated.id))[0].content.includes('기존 감상'))
 await alice.removeBook(migrated.id);await importLegacyReading('reading-smoke-alice',legacy,logs);assert.equal((await alice.getMyBooks()).books.length,1,'deleted imported book does not resurrect')
 await alice.createHighlight(id,highlight);await alice.createReadingNote(id,{content:'cleanup',tags:[]});await alice.removeBook(id);assert.equal((await alice.getHighlights(id)).length,0);assert.equal((await alice.getReadingNotes(id)).length,0)
 const {BUILTIN_THEMES}=await server.ssrLoadModule('/packages/types/src/theme.ts')
 const {themeVariables}=await server.ssrLoadModule('/src/theme/variables.ts')
 for(const theme of BUILTIN_THEMES){const vars=themeVariables(theme.config);assert.equal(vars['--fg'],theme.config.colors.textPrimary);assert.equal(vars['--bg'],theme.config.colors.background)}
 const {THEME_SLOTS}=await server.ssrLoadModule('/packages/types/src/themePackage.ts');for(const slot of ['reading-page','reading-sidebar','reading-shelf','reading-book-grid','reading-book-card','reading-book-cover','reading-detail','reading-highlight','reading-note'])assert.ok(THEME_SLOTS.includes(slot))
 const interactions=await server.ssrLoadModule('/src/pages/Reading/readingInteractions.ts');
 const fixture={book:{categories:['Fiction','Literary Fiction']}};
 assert.equal(interactions.matchesCategory(fixture,'Fiction'),true);assert.equal(interactions.matchesCategory(fixture,'Science'),false);
 assert.equal(interactions.matchesCategory({book:{}},interactions.UNCLASSIFIED),true);
 assert.deepEqual(interactions.moveShelf([{id:'a'},{id:'b'},{id:'c'}],'a','c').map(s=>s.id),['b','c','a']);
 const emoji=await server.ssrLoadModule('/src/pages/Reading/readingEmoji.ts');assert.ok(emoji.EMOJIS.length>1000);assert.ok(emoji.isEmoji('👩‍💻'));assert.ok(emoji.isEmoji('🇰🇷'));assert.ok(emoji.isEmoji('🦋'));assert.equal(emoji.isEmoji('plain text'),false);
 const catalog=await server.ssrLoadModule('/src/pages/Reading/readingIconCatalog.ts');assert.ok(catalog.iconCatalog.length>1000);assert.ok(catalog.findReadingIcon('BookOpen'));
 const {StarRating}=await server.ssrLoadModule('/src/pages/Reading/StarRating.tsx');
 const stars=renderToString(React.createElement(StarRating,{value:4.5,onChange:()=>{}}));assert.equal((stars.match(/점 선택/g)??[]).length,10);assert.ok(stars.includes('aria-label="4.5점 선택" aria-pressed="true"'));assert.ok(stars.includes('width:50%'));
 const {ReadingIconPicker}=await server.ssrLoadModule('/src/pages/Reading/ReadingIconPicker.tsx');assert.ok(renderToString(React.createElement(ReadingIconPicker,{value:'🦋',onChange:()=>{}})).includes('🦋'));
 const source=await import('node:fs/promises').then(fs=>fs.readFile('src/pages/Reading/ReadingPage.tsx','utf8'));
 assert.equal(source.includes('type="checkbox"'),false);assert.equal(source.includes('ShelfChecks'),false);
 assert.equal(source.includes('진행률'),false);assert.equal(source.includes('현재 페이지'),false);assert.equal(source.includes('총 페이지'),false);assert.equal(source.includes('<label>순서'),false);
 console.log('PASS updated reading: persisted shelf reorder, invalid/foreign order rejected, category filters, '+emoji.EMOJIS.length+' emojis, '+catalog.iconCatalog.length+' icons, star buttons, removed page/progress/order fields');
 const {ReadingPage}=await server.ssrLoadModule('/src/pages/Reading/ReadingPage.tsx')
 const {SessionContext}=await server.ssrLoadModule('/src/state/useSession.ts')
 const {LibraryContext}=await server.ssrLoadModule('/src/state/useLibrary.ts')
 const tree=React.createElement(MemoryRouter,null,React.createElement(SessionContext.Provider,{value:{user:{id:'reading-smoke-alice'}}},React.createElement(LibraryContext.Provider,{value:{books:[],logs:[],pageLayouts:{},setPageLayout:()=>{}}},React.createElement(ReadingPage))))
 assert.ok(renderToString(tree).includes('reading-page'))
 console.log('PASS reading: duplicate prevention, all statuses, progress/rating, shelf CRUD, many-to-many, highlight/note CRUD, persistence, user isolation, legacy migration, cascade cleanup, Theme slots, SSR page render')
} finally {await server.close()}
