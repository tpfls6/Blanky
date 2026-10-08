begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
insert into auth.users(id, email) values
 ('a7000000-0000-0000-0000-000000000001', 'activity-a@example.test'),
 ('b7000000-0000-0000-0000-000000000002', 'activity-b@example.test');
set local role authenticated;
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000001';
insert into public.schedules(id, user_id, title, date, kind, due_date, change_source)
 values ('a7100000-0000-0000-0000-000000000001', auth.uid(), 'Slides', '2026-10-08', 'task', '2026-10-09', 'ai_chat');
select is((select count(*) from public.schedule_changes), 1::bigint, 'creation writes one atomic history entry');
select is((select source from public.schedule_changes), 'ai_chat', 'AI source saved');
select is((select entity_type from public.schedule_changes), 'task', 'task entity saved');
update public.schedules set due_date = '2026-10-10' where id = 'a7100000-0000-0000-0000-000000000001';
select is((select before_data->>'due_date' from public.schedule_changes where action = 'updated'), '2026-10-09', 'before snapshot retained');
select is((select after_data->>'due_date' from public.schedule_changes where action = 'updated'), '2026-10-10', 'after snapshot retained');
update public.schedules set status = 'done', change_source = 'manual' where id = 'a7100000-0000-0000-0000-000000000001';
select is((select count(*) from public.schedule_changes where action = 'completed'), 1::bigint, 'completion logged separately');
delete from public.schedules where id = 'a7100000-0000-0000-0000-000000000001';
select is((select before_data->>'title' from public.schedule_changes where action = 'deleted'), 'Slides', 'deletion retains snapshot');
set local request.jwt.claim.sub = 'b7000000-0000-0000-0000-000000000002';
select is((select count(*) from public.schedule_changes), 0::bigint, 'another user cannot read history');
select * from finish();
rollback;
