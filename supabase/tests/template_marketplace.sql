begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into auth.users(id,email) values
  ('c7000000-0000-0000-0000-000000000001','tpl-a@example.test'),
  ('c7000000-0000-0000-0000-000000000002','tpl-b@example.test');
insert into public.app_admins(user_id) values ('c7000000-0000-0000-0000-000000000001');
insert into public.user_pages(id,user_id,name,kind,blocks,collections) values
  ('c7100000-0000-0000-0000-000000000001','c7000000-0000-0000-0000-000000000001','내 운동','template','[]','[]');

set local role authenticated;
set local request.jwt.claim.sub = 'c7000000-0000-0000-0000-000000000002';
select isnt_empty($$select id from public.template_listings where name='영화 기록' and status='published'$$, 'official templates are public');
select throws_ok($$select public.review_template('10000000-0000-4000-8000-000000000002','archived')$$, 'P0001', null, 'non-admin cannot review');

set local request.jwt.claim.sub = 'c7000000-0000-0000-0000-000000000001';
select lives_ok($$select public.publish_template(
  'c7100000-0000-0000-0000-000000000001','공유 운동','설명','fitness','{운동}','https://images.example.com/a.png','{}','ko','가이드',null
)$$, 'creator can submit a listing');
select is((select status from public.template_listings where name='공유 운동'), 'pending_review', 'new listing waits for review');
select lives_ok($$select public.review_template((select id from public.template_listings where name='공유 운동'), 'published')$$, 'admin can publish');

set local request.jwt.claim.sub = 'c7000000-0000-0000-0000-000000000002';
select lives_ok($$select public.install_template(
  '10000000-0000-4000-8000-000000000002',
  'c7200000-0000-0000-0000-000000000001',
  '{"page":{"id":"c7300000-0000-0000-0000-000000000001","name":"영화 기록","icon":"Film","description":"","blocks":[]},"collections":[],"records":[]}'::jsonb
)$$, 'published install works');
select lives_ok($$select public.install_template(
  '10000000-0000-4000-8000-000000000002',
  'c7200000-0000-0000-0000-000000000001',
  '{"page":{"id":"c7300000-0000-0000-0000-000000000099","name":"영화 기록","icon":"Film","blocks":[]},"collections":[],"records":[]}'::jsonb
)$$, 'same request id is idempotent');
select is((select count(*) from public.user_pages where user_id='c7000000-0000-0000-0000-000000000002'), 1::bigint, 'duplicate request does not create a second page');
select is((select install_count from public.template_listings where id='10000000-0000-4000-8000-000000000002'), 1, 'install count increments once');
select throws_ok($$update public.template_listings set install_count=99 where id='10000000-0000-4000-8000-000000000002'$$, 'P0001', null, 'install count is protected');
select is_empty($$select id from public.user_pages where user_id<>auth.uid() and kind='template'$$, 'other users private templates stay hidden');
select lives_ok($$select public.report_template('10000000-0000-4000-8000-000000000002','spam link')$$, 'published listing can be reported');
select * from finish();
rollback;
