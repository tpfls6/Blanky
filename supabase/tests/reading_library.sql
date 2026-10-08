begin;
create extension if not exists pgtap with schema extensions;
select plan(38);
insert into auth.users(id,email) values
 ('a8000000-0000-0000-0000-000000000001','reading-a@example.test'),
 ('b8000000-0000-0000-0000-000000000002','reading-b@example.test');
insert into public.books(id,external_source,external_id,title,page_count) values
 ('c8000000-0000-0000-0000-000000000001','test','one','Shared book',350);
insert into public.user_books(id,user_id,book_id) values
 ('a8100000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-000000000001'),
 ('b8100000-0000-0000-0000-000000000002','b8000000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-000000000001');
insert into public.reading_shelves(id,user_id,name) values
 ('a8200000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','A shelf'),
 ('b8200000-0000-0000-0000-000000000002','b8000000-0000-0000-0000-000000000002','B shelf');
insert into public.reading_shelf_books(shelf_id,user_book_id,user_id) values
 ('a8200000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001'),
 ('b8200000-0000-0000-0000-000000000002','b8100000-0000-0000-0000-000000000002','b8000000-0000-0000-0000-000000000002');
insert into public.reading_highlights(user_id,user_book_id,content) values
 ('a8000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001','A quote'),
 ('b8000000-0000-0000-0000-000000000002','b8100000-0000-0000-0000-000000000002','B quote');
insert into public.reading_notes(user_id,user_book_id,content) values
 ('a8000000-0000-0000-0000-000000000001','a8100000-0000-0000-0000-000000000001','A note'),
 ('b8000000-0000-0000-0000-000000000002','b8100000-0000-0000-0000-000000000002','B note');
set local role authenticated;
set local request.jwt.claim.sub='a8000000-0000-0000-0000-000000000001';
select is((select count(*) from public.user_books),1::bigint,'only own books visible');
select is((select count(*) from public.reading_shelves),1::bigint,'only own shelves visible');
select is((select count(*) from public.reading_shelf_books),1::bigint,'only own memberships visible');
select is((select count(*) from public.reading_highlights),1::bigint,'only own highlights visible');
select is((select count(*) from public.reading_notes),1::bigint,'only own notes visible');
select is_empty($$update public.user_books set review='stolen' where user_id='b8000000-0000-0000-0000-000000000002' returning id$$,'other book update blocked');
select is_empty($$delete from public.user_books where user_id='b8000000-0000-0000-0000-000000000002' returning id$$,'other book delete blocked');
select is_empty($$update public.reading_shelves set name='stolen' where user_id='b8000000-0000-0000-0000-000000000002' returning id$$,'other shelf update blocked');
select is_empty($$delete from public.reading_shelves where user_id='b8000000-0000-0000-0000-000000000002' returning id$$,'other shelf delete blocked');
select is_empty($$update public.reading_shelf_books set user_book_id='a8100000-0000-0000-0000-000000000001' where user_id='b8000000-0000-0000-0000-000000000002' returning shelf_id$$,'other membership update blocked');
select is_empty($$delete from public.reading_shelf_books where user_id='b8000000-0000-0000-0000-000000000002' returning shelf_id$$,'other membership delete blocked');
select is_empty($$update public.reading_highlights set content='stolen' where user_id='b8000000-0000-0000-0000-000000000002' returning id$$,'other highlight update blocked');
select is_empty($$delete from public.reading_highlights where user_id='b8000000-0000-0000-0000-000000000002' returning id$$,'other highlight delete blocked');
select is_empty($$update public.reading_notes set content='stolen' where user_id='b8000000-0000-0000-0000-000000000002' returning id$$,'other note update blocked');
select is_empty($$delete from public.reading_notes where user_id='b8000000-0000-0000-0000-000000000002' returning id$$,'other note delete blocked');
select throws_ok($$insert into public.user_books(user_id,book_id) values('b8000000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-000000000001')$$,'42501',null,'forged book owner rejected');
select throws_ok($$insert into public.reading_shelves(user_id,name) values('b8000000-0000-0000-0000-000000000002','forged')$$,'42501',null,'forged shelf owner rejected');
select throws_ok($$insert into public.reading_shelf_books(user_id,shelf_id,user_book_id) values('b8000000-0000-0000-0000-000000000002','b8200000-0000-0000-0000-000000000002','b8100000-0000-0000-0000-000000000002')$$,'42501',null,'forged membership owner rejected');
select throws_ok($$insert into public.reading_highlights(user_id,user_book_id,content) values('b8000000-0000-0000-0000-000000000002','b8100000-0000-0000-0000-000000000002','forged')$$,'42501',null,'forged highlight owner rejected');
select throws_ok($$insert into public.reading_notes(user_id,user_book_id,content) values('b8000000-0000-0000-0000-000000000002','b8100000-0000-0000-0000-000000000002','forged')$$,'42501',null,'forged note owner rejected');
select throws_ok($$insert into public.reading_shelf_books(user_id,shelf_id,user_book_id) values(auth.uid(),'b8200000-0000-0000-0000-000000000002','a8100000-0000-0000-0000-000000000001')$$,'23503',null,'cannot link foreign shelf');
select throws_ok($$insert into public.reading_highlights(user_id,user_book_id,content) values(auth.uid(),'b8100000-0000-0000-0000-000000000002','foreign')$$,'23503',null,'cannot attach highlight to foreign book');
select throws_ok($$insert into public.reading_notes(user_id,user_book_id,content) values(auth.uid(),'b8100000-0000-0000-0000-000000000002','foreign')$$,'23503',null,'cannot attach note to foreign book');
select throws_ok($$select public.add_reading_book('{"external_source":"test","external_id":"one","title":"Shared book"}','want',array['b8200000-0000-0000-0000-000000000002'::uuid])$$,'P0001','Shelf not owned','atomic add rejects foreign shelf');
select is(public.add_reading_book('{"external_source":"test","external_id":"one","title":"Shared book"}','want'), 'a8100000-0000-0000-0000-000000000001'::uuid,'duplicate returns existing book');
select is((select count(*) from public.user_books),1::bigint,'duplicate never creates a second user book');
select lives_ok($$update public.user_books set reading_status='reading',current_page=220,progress=63,rating=4.5 where user_id=auth.uid()$$,'progress and half stars supported');
select lives_ok($$update public.user_books set reading_status='done',progress=100 where user_id=auth.uid()$$,'completed state supported');
select lives_ok($$update public.user_books set reading_status='stopped',progress=77 where user_id=auth.uid()$$,'stopped state and manual progress supported');
select throws_ok($$update public.user_books set progress=101$$,'23514',null,'invalid progress rejected');
select throws_ok($$update public.user_books set rating=4.2$$,'23514',null,'invalid rating increment rejected');
select lives_ok($$update public.reading_shelves set name='renamed',icon='♡',color='accent',sort_order=2$$,'shelf edit supported');
select lives_ok($$delete from public.reading_shelves where user_id=auth.uid()$$,'shelf deletion supported');
select is((select count(*) from public.reading_shelf_books),0::bigint,'shelf deletion removes memberships');
select is((select count(*) from public.user_books),1::bigint,'shelf deletion preserves library book');
select lives_ok($$delete from public.user_books where user_id=auth.uid()$$,'owner book deletion supported');
select is((select count(*) from public.reading_highlights),0::bigint,'book deletion cascades highlights');
select is((select count(*) from public.reading_notes),0::bigint,'book deletion cascades notes');
select * from finish();
rollback;
