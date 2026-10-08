begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
insert into auth.users(id, email) values
 ('a1000000-0000-0000-0000-000000000001', 'calendar-a@example.test'),
 ('b1000000-0000-0000-0000-000000000002', 'calendar-b@example.test');
insert into public.calendars(id, owner_user_id, name) values
 ('b3000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'other calendar');
select is((select count(*) from public.calendars where owner_user_id in
 ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002')
 and is_default_personal), 2::bigint, 'signup creates personal calendars');

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select is((select count(*) from public.calendars), 1::bigint, 'owner sees only own calendar');
select lives_ok($$insert into public.schedules(id, user_id, title, date)
 values ('a2000000-0000-0000-0000-000000000001', auth.uid(), 'legacy insert', '2026-10-01')$$,
 'old client can insert without calendar');
select is((select calendar_id from public.schedules where id = 'a2000000-0000-0000-0000-000000000001'),
 (select id from public.calendars where is_default_personal), 'default calendar assigned');
select is((select created_by_user_id from public.schedules where id = 'a2000000-0000-0000-0000-000000000001'),
 auth.uid(), 'authenticated author assigned');
select lives_ok($$update public.schedules set title = 'edited' where id = 'a2000000-0000-0000-0000-000000000001'$$,
 'owner can update schedule');
select throws_ok($$update public.schedules set calendar_id = 'b3000000-0000-0000-0000-000000000002'$$,
 '23503', null, 'cannot move schedule into another user calendar');
select throws_ok($$update public.schedules set created_by_user_id = 'b1000000-0000-0000-0000-000000000002'$$,
 '42501', null, 'author is immutable');
select lives_ok($$insert into public.calendars(id, owner_user_id, name)
 values ('a3000000-0000-0000-0000-000000000001', auth.uid(), 'second')$$, 'can create another personal calendar');
insert into public.schedules(user_id, calendar_id, title, date)
 values (auth.uid(), 'a3000000-0000-0000-0000-000000000001', 'keep', '2026-10-01');
select throws_ok($$delete from public.calendars where id = 'a3000000-0000-0000-0000-000000000001'$$,
 '23503', null, 'nonempty calendar deletion cannot erase schedules');
select throws_ok($$update public.calendars set is_default_personal = false where is_default_personal$$,
 '42501', null, 'default calendar cannot be demoted');
select is_empty($$delete from public.calendars where is_default_personal returning id$$, 'default calendar cannot be deleted');
select throws_ok($$insert into public.calendars(owner_user_id, type, name) values(auth.uid(), 'shared', 'premature shared')$$,
 '42501', null, 'shared creation waits for membership policies');

set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';
select is_empty($$select id from public.schedules$$, 'other user cannot read schedules');
select is_empty($$update public.schedules set title = 'stolen' returning id$$, 'other user cannot update');
select is_empty($$delete from public.schedules returning id$$, 'other user cannot delete');
select throws_ok($$insert into public.schedules(user_id, title, date)
 values ('a1000000-0000-0000-0000-000000000001', 'forged', '2026-10-01')$$,
 '42501', null, 'forged user ID rejected');

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select lives_ok($$delete from public.schedules where id = 'a2000000-0000-0000-0000-000000000001'$$,
 'owner can delete schedule');
reset role;
delete from auth.users where id = 'a1000000-0000-0000-0000-000000000001';
select is_empty($$select id from public.calendars where owner_user_id = 'a1000000-0000-0000-0000-000000000001'$$,
 'account deletion cleans up personal calendar');
select is_empty($$select id from public.schedules where user_id = 'a1000000-0000-0000-0000-000000000001'$$,
 'account deletion also cleans up remaining schedules');
select * from finish();
rollback;
