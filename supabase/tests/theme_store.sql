begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
insert into auth.users(id,email) values ('a7000000-0000-0000-0000-000000000001','theme-a@example.test'),('b7000000-0000-0000-0000-000000000002','theme-b@example.test');
insert into public.themes(id,creator_id,name,visibility,pricing_type,price,theme_config) values
('a7100000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','Public','public','free',0,'{}'),
('a7100000-0000-0000-0000-000000000002','a7000000-0000-0000-0000-000000000001','Private','private','free',0,'{}'),
('a7100000-0000-0000-0000-000000000003','a7000000-0000-0000-0000-000000000001','Paid','public','paid',1500,'{}');
set local role authenticated;
set local request.jwt.claim.sub='b7000000-0000-0000-0000-000000000002';
select is_empty($$select id from public.themes where name='Private'$$,'private themes are hidden');
select is_empty($$update public.themes set name='Stolen' where creator_id<>auth.uid() returning id$$,'other creators cannot update');
select is_empty($$delete from public.themes where creator_id<>auth.uid() returning id$$,'other creators cannot delete');
select throws_ok($$insert into public.themes(creator_id,name,theme_config) values('a7000000-0000-0000-0000-000000000001','Forged','{}')$$,'42501',null,'creator forgery blocked');
select throws_ok($$select public.install_theme('a7100000-0000-0000-0000-000000000002')$$,'P0001',null,'private install blocked');
select throws_ok($$select public.install_theme('a7100000-0000-0000-0000-000000000003')$$,'P0001',null,'paid install blocked');
select throws_ok($$insert into public.user_themes(user_id,theme_id,acquired_type) values(auth.uid(),'a7100000-0000-0000-0000-000000000003','purchase')$$,'42501',null,'purchase forgery blocked');
select throws_ok($$insert into public.user_theme_settings(user_id,active_theme_id) values(auth.uid(),'a7100000-0000-0000-0000-000000000003')$$,'42501',null,'unowned paid activation blocked');
select lives_ok($$select public.install_theme('a7100000-0000-0000-0000-000000000001')$$,'free install works');
select lives_ok($$select public.install_theme('a7100000-0000-0000-0000-000000000001')$$,'install is idempotent');
select is((select download_count from public.themes where name='Public'),1,'download counts unique installs');
select lives_ok($$insert into public.user_theme_settings(user_id,active_theme_id) values(auth.uid(),'a7100000-0000-0000-0000-000000000001')$$,'owned theme activation works');
set local request.jwt.claim.sub='a7000000-0000-0000-0000-000000000001';
select is_empty($$select user_id from public.user_themes$$,'ownership lists isolated');
select is_empty($$select user_id from public.user_theme_settings$$,'active settings isolated');
select throws_ok($$update public.themes set download_count=999 where name='Public'$$,'P0001',null,'counter tampering blocked');
select lives_ok($$update public.themes set name='Updated' where name='Private'$$,'creator can edit own private theme');
select is_empty($$delete from public.themes where creator_id is null returning id$$,'builtin delete blocked');
select * from finish();
rollback;
