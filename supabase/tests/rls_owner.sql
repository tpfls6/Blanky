begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

select has_column('public', 'user_pages', 'collections', 'user_pages.collections exists');

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'owner@example.test'),
  ('b1000000-0000-0000-0000-000000000002', 'other@example.test');

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

insert into public.categories (id, user_id, name)
values ('11111111-1111-1111-1111-111111111111', auth.uid(), '학교');

insert into public.schedules (user_id, title, date)
values (auth.uid(), '회의', '2026-10-02');

insert into public.user_preferences (user_id)
values (auth.uid());

insert into public.custom_record_types (user_id, name, color, schema)
values (auth.uid(), '운동', '#3C8664', '{"blocks":[]}'::jsonb);

insert into public.custom_records (user_id, record_type_id, title)
select auth.uid(), id, '스쿼트'
from public.custom_record_types
where user_id = auth.uid();

insert into public.classification_feedback (user_id, input_text, predicted_type, corrected_type)
values (auth.uid(), '문제 풀기', 'event', 'task');

insert into public.user_pages (id, user_id, name, blocks)
values (
  '22222222-2222-2222-2222-222222222222',
  auth.uid(),
  '공부',
  '[]'::jsonb
);

set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';

select is_empty('select id from public.categories', 'other user cannot read categories');
select is_empty('select id from public.schedules', 'other user cannot read schedules');
select is_empty('select user_id from public.user_preferences', 'other user cannot read preferences');
select is_empty('select id from public.custom_record_types', 'other user cannot read record types');
select is_empty('select id from public.custom_records', 'other user cannot read records');
select is_empty('select id from public.classification_feedback', 'other user cannot read feedback');
select is_empty('select id from public.user_pages', 'other user cannot read user pages');

update public.user_pages set name = 'stolen';
update public.custom_records set title = 'stolen';
update public.user_pages set collections = '[{"id":"x"}]'::jsonb;
delete from public.user_pages;
delete from public.custom_records;

select throws_ok(
  format(
    'insert into public.categories (user_id, name) values (%L, %L)',
    'a1000000-0000-0000-0000-000000000001',
    'stolen'
  ),
  '42501',
  null,
  'other user cannot insert with a foreign id'
);

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select results_eq('select name from public.user_pages', $$values ('공부'::text)$$, 'other user cannot change page name');
select results_eq('select title from public.custom_records', $$values ('스쿼트'::text)$$, 'other user cannot change records');
select isnt_empty('select id from public.user_pages', 'other user cannot delete owner pages');
select results_eq('select collections from public.user_pages', $$values ('[]'::jsonb)$$, 'other user cannot change collections');

select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select is_empty('select id from public.categories', 'anonymous cannot read categories');

select * from finish();
rollback;
