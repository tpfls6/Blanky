import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const cache=new Map()
globalThis.localStorage={getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)}
const server=await createServer({envDir:false,define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'},server:{middlewareMode:true},appType:'custom'})
try {
 const {readingService,importLegacyReading,removeImportedReadingLog,readReadingCopy,removeReadingCopy,restoreReadingCopy}=await server.ssrLoadModule('/src/services/reading/index.ts')
 const {ReadingRestoreError}=await server.ssrLoadModule('/src/services/reading/restore.ts')
 // The trash keeps the snapshot first and deletes after it (library trashReadingBook); 복구 records the book it creates.
 const takeReadingCopy=async(user,id)=>{const copy=await readReadingCopy(user,id);await removeReadingCopy(user,id);return copy}
 const recordInto=stored=>progress=>{stored.restore=progress}
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
 // The reading page imports a book read to p.120 while Home deletes that 120 log (back to p.50): the delete waits for the import.
 for(let run=0;run<10;run++){
  const user='reading-smoke-race-'+run,book={id:crypto.randomUUID(),title:'경합 책',author:'',cover:null,totalPages:300,currentPage:120,status:'reading',startedAt:null,finishedAt:null,createdAt:'2026-09-01'}
  const raceLogs=[50,120].map((page,at)=>({id:crypto.randomUUID(),bookId:book.id,date:'2026-09-0'+(at+2),page,note:'',createdAt:'2026-09-0'+(at+2)}))
  await Promise.all([importLegacyReading(user,[book],raceLogs),removeImportedReadingLog(user,book.id,raceLogs[1].id,{currentPage:50,totalPages:300})])
  const copy=(await readingService(user).getMyBooks()).books.find(b=>b.book.title==='경합 책')
  assert.equal(copy.current_page,50,'run '+run+': the imported copy follows the delete');assert.equal((await readingService(user).getReadingNotes(copy.id)).length,1,'run '+run+': the deleted log leaves no note')
 }
 // A delete that un-finishes a book its logs finished reopens the imported copy, unless the copy's status was changed on the reading page.
 for(const edited of [false,true]){
  const user='reading-smoke-reopen-'+edited,book={id:crypto.randomUUID(),title:'완독 책',author:'',cover:null,totalPages:300,currentPage:300,status:'done',finishedBy:'auto',startedAt:'2026-09-01',finishedAt:'2026-09-03',createdAt:'2026-09-01T00:00:00.000Z'}
  const doneLogs=[{id:crypto.randomUUID(),bookId:book.id,date:'2026-09-01',page:100,note:'',createdAt:'2026-09-01T00:00:00.000Z',previousPage:0},{id:crypto.randomUUID(),bookId:book.id,date:'2026-09-03',page:null,note:'완독',createdAt:'2026-09-03T00:00:00.000Z',previousPage:100,finished:true}]
  await importLegacyReading(user,[book],doneLogs);const service=readingService(user)
  const copyId=(await service.getMyBooks()).books[0].id;assert.deepEqual(((c)=>[c.reading_status,c.finished_at,c.current_page])(await service.getUserBook(copyId)),['done','2026-09-03',300])
  if(edited)await service.updateBook(copyId,{reading_status:'stopped'})
  await removeImportedReadingLog(user,book.id,doneLogs[1].id,{currentPage:100,totalPages:300,reopen:{finishedAt:'2026-09-03'}})
  const copy=await service.getUserBook(copyId)
  assert.deepEqual([copy.reading_status,copy.finished_at,copy.current_page],edited?['stopped','2026-09-03',100]:['reading',null,100],'reopen, edited='+edited)
 }
 const tick=()=>new Promise(r=>setTimeout(r,5))
 const finishedBook=(user)=>{const book={id:crypto.randomUUID(),title:'같은 날 책',author:'',cover:null,totalPages:300,currentPage:300,status:'done',finishedBy:'auto',startedAt:'2026-09-03',finishedAt:'2026-09-03',createdAt:'2026-09-03T00:00:00.000Z'};return {book,logs:[{id:crypto.randomUUID(),bookId:book.id,date:'2026-09-03',page:null,note:'완독',createdAt:'2026-09-03T00:00:00.000Z',previousPage:0,finished:true}]}}
 // Same day: Home 완독 → imported → on the reading page 읽는 중 (re-read) then 완독 again, keeping the same date → the log is deleted.
 // The copy is done on the legacy finish date, which the date-only check used to take for the import's finish and reopen.
 {
  const user='reading-smoke-same-day',{book,logs:doneLogs}=finishedBook(user)
  await importLegacyReading(user,[book],doneLogs);const service=readingService(user),copyId=(await service.getMyBooks()).books[0].id
  await tick();await service.updateBook(copyId,{reading_status:'reading'});await tick();await service.updateBook(copyId,{reading_status:'done',finished_at:'2026-09-03'})
  const before=await service.getUserBook(copyId);assert.deepEqual([before.reading_status,before.finished_at],['done','2026-09-03'],'reproduced: same status and date as the import wrote')
  await removeImportedReadingLog(user,book.id,doneLogs[0].id,{currentPage:0,totalPages:300,reopen:{finishedAt:'2026-09-03'}})
  const copy=await service.getUserBook(copyId)
  assert.deepEqual([copy.reading_status,copy.finished_at],['done','2026-09-03'],'a finish set on the reading page stays')
 }
 // A copy imported before the app kept its own writes cannot be told apart, so it is left finished.
 {
  const user='reading-smoke-unknown',{book,logs:doneLogs}=finishedBook(user)
  await importLegacyReading(user,[book],doneLogs);localStorage.removeItem('blanky.reading.synced.'+user)
  const service=readingService(user),copyId=(await service.getMyBooks()).books[0].id
  await removeImportedReadingLog(user,book.id,doneLogs[0].id,{currentPage:0,totalPages:300,reopen:{finishedAt:'2026-09-03'}})
  assert.equal((await service.getUserBook(copyId)).reading_status,'done','no record: no reopen')
 }
 // Deleting a book's last log keeps the imported copy (and its other data); only the log's note goes.
 {
  const user='reading-smoke-last-log',book={id:crypto.randomUUID(),title:'마지막 로그 책',author:'',cover:null,totalPages:200,currentPage:40,status:'reading',startedAt:null,finishedAt:null,createdAt:'2026-09-05T00:00:00.000Z'}
  const lastLogs=[{id:crypto.randomUUID(),bookId:book.id,date:'2026-09-05',page:40,note:'첫 기록',createdAt:'2026-09-05T00:00:00.000Z',previousPage:0}]
  await importLegacyReading(user,[book],lastLogs);const service=readingService(user)
  await removeImportedReadingLog(user,book.id,lastLogs[0].id,{currentPage:0,totalPages:200})
  const books=(await service.getMyBooks()).books;assert.equal(books.length,1,'the copy stays');assert.equal(books[0].current_page,0)
  assert.equal((await service.getReadingNotes(books[0].id)).length,0,'the log note is gone')
 }
 // 독서 화면 삭제 → 휴지통 → 복구: the copy with its record, shelf, quotes and notes (the 서재 log's note under its own id) comes back.
 {
  const user='reading-smoke-trash',book={id:crypto.randomUUID(),title:'휴지통 책',author:'',cover:null,totalPages:200,currentPage:60,status:'reading',startedAt:null,finishedAt:null,createdAt:'2026-09-06T00:00:00.000Z'}
  const trashLogs=[{id:crypto.randomUUID(),bookId:book.id,date:'2026-09-06',page:60,note:'홈 기록',createdAt:'2026-09-06T00:00:00.000Z',previousPage:0}]
  await importLegacyReading(user,[book],trashLogs);const service=readingService(user)
  const keep=await service.createShelf({name:'보관',description:'',icon:'📚',color:'accent',sort_order:0}),copyId=(await service.getMyBooks()).books[0].id
  await service.addBookToShelf(copyId,keep.id);await service.updateBook(copyId,{rating:4,review:'감상',tags:['보관']})
  const quote=await service.createHighlight(copyId,highlight),notesBefore=(await service.getReadingNotes(copyId)).map(n=>n.id)
  assert.equal(notesBefore.length,1,'the Home log was imported as a note')
  const copy=await takeReadingCopy(user,copyId)
  assert.deepEqual([copy.legacyBookId,copy.shelves,copy.highlights.length,copy.notes.length],[book.id,[keep.id],1,1])
  assert.equal((await service.getMyBooks()).books.length,0,'the copy left the reading library')
  await importLegacyReading(user,[book],trashLogs);assert.equal((await service.getMyBooks()).books.length,0,'a trashed copy is not imported again')
  const stored=JSON.parse(JSON.stringify(copy))
  for(const run of [1,2]){
   await restoreReadingCopy(user,stored,recordInto(stored))
   const after=await service.getMyBooks();assert.equal(after.books.length,1,'restore '+run+' adds one copy')
   const back=after.books[0];assert.deepEqual([back.reading_status,back.current_page,back.rating,back.review,back.tags],['reading',60,4,'감상',['보관']])
   assert.deepEqual(after.memberships.map(m=>m.shelf_id),[keep.id],'shelf comes back once')
   assert.deepEqual((await service.getHighlights(back.id)).map(h=>h.id),[quote.id]);assert.deepEqual((await service.getReadingNotes(back.id)).map(n=>n.id),notesBefore)
  }
  // Home's 삭제 on the restored log still finds its note.
  await removeImportedReadingLog(user,book.id,trashLogs[0].id);assert.equal((await service.getReadingNotes((await service.getMyBooks()).books[0].id)).length,0,'the restored log note still maps to its log')
 }
 // P0: a restore that failed midway (after add_reading_book) is finished by the retry: the book it created is
 // recorded with the trash row first, so the retry writes the record, shelf and quotes into that one.
 {
  const user='reading-smoke-retry',service=readingService(user)
  const keep=await service.createShelf({name:'재시도',description:'',icon:'📚',color:'accent',sort_order:0})
  const copyId=await service.addBook({...meta,external_id:'retry',isbn13:'9780000000017'},'reading',[keep.id])
  await service.updateBook(copyId,{current_page:150,progress:50,rating:5,review:'다시 읽고 싶다',tags:['재시도'],started_at:'2026-09-01'})
  const quote=await service.createHighlight(copyId,highlight)
  const stored=JSON.parse(JSON.stringify(await takeReadingCopy(user,copyId)))
  // First attempt: the book is added, then the network fails before the record is written.
  let failed=false
  const flaky=new Proxy(service,{get(target,key){const value=Reflect.get(target,key);if(key==='updateBook'&&!failed)return async()=>{failed=true;throw new Error('network')};return typeof value==='function'?value.bind(target):value}})
  await assert.rejects(restoreReadingCopy(user,stored,recordInto(stored),flaky),/network/)
  assert.ok(stored.restore?.bookId,'the created book is recorded before the failing step')
  const bare=(await service.getMyBooks()).books[0];assert.deepEqual([bare.rating,bare.review],[null,''],'the first attempt left a bare copy')
  const reloaded=JSON.parse(JSON.stringify(stored))
  await restoreReadingCopy(user,reloaded,recordInto(reloaded))
  const after=await service.getMyBooks();assert.equal(after.books.length,1,'the retry adds no second copy')
  const back=after.books[0];assert.deepEqual([back.current_page,back.rating,back.review,back.tags,back.started_at],[150,5,'다시 읽고 싶다',['재시도'],'2026-09-01'],'the retry restores the record, not a bare copy')
  assert.deepEqual(after.memberships.filter(m=>m.user_book_id===back.id).map(m=>m.shelf_id),[keep.id])
  assert.deepEqual((await service.getHighlights(back.id)).map(h=>h.id),[quote.id])
  // The same book added again since the delete (not by this 복구) is a conflict: its own record stays.
  const other=JSON.parse(JSON.stringify(await takeReadingCopy(user,back.id)))
  const again=await service.addBook(other.book.book,'want');await service.updateBook(again,{rating:2,review:'새 감상'})
  await assert.rejects(restoreReadingCopy(user,other,recordInto(other)),error=>error instanceof ReadingRestoreError&&error.reason==='conflict')
  const mine=(await service.getMyBooks()).books;assert.equal(mine.length,1);assert.deepEqual([mine[0].rating,mine[0].review],[2,'새 감상'],'a re-added book keeps its own record')
  assert.equal((await service.getHighlights(mine[0].id)).length,0,'no quotes written into it')
 }
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
 const emoji=await server.ssrLoadModule('/src/pages/Reading/readingEmoji.ts');{const coffee=emoji.EMOJIS.find(e=>e.value==='☕');assert.deepEqual(coffee.names,{ko:'커피',en:'coffee'});assert.ok(coffee.keywords.includes('커피')&&coffee.keywords.includes('coffee'),'search keeps both languages');const kr=emoji.EMOJIS.find(e=>e.value==='🇰🇷');assert.ok(/[가-힣]/.test(kr.names.ko)&&/Korea/.test(kr.names.en)&&kr.keywords.includes(kr.names.en),'flags: a name in each language, both searchable');assert.deepEqual(emoji.EMOJIS.find(e=>e.value==='1️⃣').names,{ko:'숫자 1',en:'number 1'})}assert.ok(emoji.EMOJIS.length>1000);assert.ok(emoji.isEmoji('👩‍💻'));assert.ok(emoji.isEmoji('🇰🇷'));assert.ok(emoji.isEmoji('🦋'));assert.equal(emoji.isEmoji('plain text'),false);
 const catalog=await server.ssrLoadModule('/src/pages/Reading/readingIconCatalog.ts');assert.ok(catalog.iconCatalog.length>1000);assert.ok(catalog.findReadingIcon('BookOpen'));
 const {SessionContext}=await server.ssrLoadModule('/src/state/useSession.ts')
 const {LibraryContext}=await server.ssrLoadModule('/src/state/useLibrary.ts')
 const inLocale=(locale,child)=>React.createElement(MemoryRouter,null,React.createElement(SessionContext.Provider,{value:{user:{id:'reading-smoke-alice'}}},React.createElement(LibraryContext.Provider,{value:{settings:{locale,onboardingPages:["reading"],onboardingDone:true},settingsReady:true,updateSettings:()=>{},books:[],logs:[],pageLayouts:{},setPageLayout:()=>{}}},child)))
 const visible=html=>html.replace(/<[^>]*>/g,' ')
 const {StarRating}=await server.ssrLoadModule('/src/pages/Reading/StarRating.tsx');
 const stars=renderToString(inLocale('ko',React.createElement(StarRating,{value:4.5,onChange:()=>{}})));assert.equal((stars.match(/점 선택/g)??[]).length,10);assert.ok(stars.includes('aria-label="4.5점 선택" aria-pressed="true"'));assert.ok(stars.includes('width:50%'));
 const {ReadingIconPicker}=await server.ssrLoadModule('/src/pages/Reading/ReadingIconPicker.tsx');assert.ok(renderToString(inLocale('ko',React.createElement(ReadingIconPicker,{value:'🦋',onChange:()=>{},color:'#3C8664',onColor:()=>{}}))).includes('🦋'));
 for(const element of [React.createElement(StarRating,{value:4.5,onChange:()=>{}}),React.createElement(ReadingIconPicker,{value:'🦋',onChange:()=>{},color:'#3C8664',onColor:()=>{}})]){const html=renderToString(inLocale('en',element));assert.doesNotMatch(html,/[가-힣]/,'english has no Korean: '+html.slice(0,200))}
 assert.ok(renderToString(inLocale('en',React.createElement(StarRating,{value:4.5,onChange:()=>{}}))).includes('aria-label="Rate 4.5"'))
 const source=await import('node:fs/promises').then(fs=>fs.readFile('src/pages/Reading/ReadingPage.tsx','utf8'));
 assert.equal(source.includes('type="checkbox"'),false);assert.equal(source.includes('ShelfChecks'),false);
 assert.equal(source.includes('진행률'),false);assert.equal(source.includes('현재 페이지'),false);assert.equal(source.includes('총 페이지'),false);assert.equal(source.includes('<label>순서'),false);
 console.log('PASS updated reading: persisted shelf reorder, invalid/foreign order rejected, category filters, '+emoji.EMOJIS.length+' emojis, '+catalog.iconCatalog.length+' icons, star buttons, removed page/progress/order fields');
 const {ReadingPage}=await server.ssrLoadModule('/src/pages/Reading/ReadingPage.tsx')
 assert.ok(renderToString(inLocale('ko',React.createElement(ReadingPage))).includes('reading-page'))
 const english=renderToString(inLocale('en',React.createElement(ReadingPage)));assert.ok(english.includes('Loading your library'));assert.doesNotMatch(visible(english),/[가-힣]/,'english reading page has no Korean')
 console.log('PASS reading: duplicate prevention, all statuses, progress/rating, shelf CRUD, many-to-many, highlight/note CRUD, persistence, user isolation, legacy migration, cascade cleanup, Theme slots, SSR page render')
} finally {await server.close()}
