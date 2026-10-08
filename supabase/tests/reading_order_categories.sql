begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
insert into auth.users(id,email) values('a8300000-0000-0000-0000-000000000001','reading-order-a@example.test'),('b8300000-0000-0000-0000-000000000002','reading-order-b@example.test');
insert into reading_shelves(id,user_id,name,sort_order) values
 ('a8400000-0000-0000-0000-000000000001','a8300000-0000-0000-0000-000000000001','First',0),
 ('a8400000-0000-0000-0000-000000000002','a8300000-0000-0000-0000-000000000001','Second',1),
 ('b8400000-0000-0000-0000-000000000003','b8300000-0000-0000-0000-000000000002','Other',0);
set local role authenticated;
set local request.jwt.claim.sub='a8300000-0000-0000-0000-000000000001';
select lives_ok($$select reorder_reading_shelves(array['a8400000-0000-0000-0000-000000000002'::uuid,'a8400000-0000-0000-0000-000000000001'::uuid])$$,'owner reorders all shelves');
select is((select sort_order from reading_shelves where name='Second'),0,'new order is persisted');
select throws_ok($$select reorder_reading_shelves(array['a8400000-0000-0000-0000-000000000001'::uuid,'b8400000-0000-0000-0000-000000000003'::uuid])$$,'P0001','Shelf order must contain exactly your shelves','foreign shelf rejected');
select throws_ok($$select reorder_reading_shelves(array['a8400000-0000-0000-0000-000000000001'::uuid,'a8400000-0000-0000-0000-000000000001'::uuid])$$,'P0001','Shelf order must contain exactly your shelves','duplicate shelf rejected');
select throws_ok($$select reorder_reading_shelves(array['a8400000-0000-0000-0000-000000000001'::uuid])$$,'P0001','Shelf order must contain exactly your shelves','partial order rejected');
select is((select sort_order from reading_shelves where name='Second'),0,'failed reorder leaves previous order');
select lives_ok($$select add_reading_book('{"external_source":"test","external_id":"categories-order-test","title":"Categorized","categories":["Fiction","Philosophy"]}','want')$$,'book categories accepted');
select is((select categories from books where external_id='categories-order-test'),array['Fiction','Philosophy']::text[],'multiple API categories saved');
select * from finish();
rollback;
