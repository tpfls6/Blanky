begin;

select plan(9);

select tests.create_supabase_user('owner@example.com', 'password');
select tests.create_supabase_user('other@example.com', 'password');

select tests.authenticate_as('owner@example.com');

insert into public.categories (id, user_id, name)
values ('11111111-1111-1111-1111-111111111111', tests.get_supabase_uid('owner@example.com'), '학교');

insert into public.schedules (user_id, title, date)
values (tests.get_supabase_uid('owner@example.com'), '회의', '2026-10-02');

insert into public.user_preferences (user_id)
values (tests.get_supabase_uid('owner@example.com'));

insert into public.custom_record_types (user_id, name, color, schema)
values (
  tests.get_supabase_uid('owner@example.com'),
  '운동',
  '#3C8664',
  '{"blocks":[]}'::jsonb
);

insert into public.custom_records (user_id, record_type_id, title)
select tests.get_supabase_uid('owner@example.com'), id, '스쿼트'
from public.custom_record_types
where user_id = tests.get_supabase_uid('owner@example.com');

insert into public.classification_feedback (user_id, input_text, predicted_type, corrected_type)
values (tests.get_supabase_uid('owner@example.com'), '문제 풀기', 'event', 'task');

insert into public.user_pages (id, user_id, name, blocks)
values (
  '22222222-2222-2222-2222-222222222222',
  tests.get_supabase_uid('owner@example.com'),
  '공부',
  '[]'::jsonb
);

select tests.authenticate_as('other@example.com');

select is_empty('select id from public.categories', 'other user cannot read categories');
select is_empty('select id from public.schedules', 'other user cannot read schedules');
select is_empty('select user_id from public.user_preferences', 'other user cannot read preferences');
select is_empty('select id from public.custom_record_types', 'other user cannot read record types');
select is_empty('select id from public.custom_records', 'other user cannot read records');
select is_empty('select id from public.classification_feedback', 'other user cannot read feedback');
select is_empty('select id from public.user_pages', 'other user cannot read user pages');

select throws_ok(
  format(
    'insert into public.categories (user_id, name) values (%L, %L)',
    tests.get_supabase_uid('owner@example.com'),
    'stolen'
  ),
  '42501',
  null,
  'other user cannot insert with a foreign id'
);

select tests.clear_authentication();
select is_empty('select id from public.categories', 'anonymous cannot read categories');

select * from finish();
rollback;
