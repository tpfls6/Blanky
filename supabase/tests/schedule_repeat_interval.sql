begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into auth.users(id,email) values ('ae000000-0000-0000-0000-00000000000a','interval@example.test'), ('ae000000-0000-0000-0000-00000000000b','other@example.test');
select has_column('public', 'schedules', 'repeat_interval', 'custom repeat interval column exists');
-- Existing and plain rows default to 1.
insert into public.schedules(id,user_id,title,date,kind) values ('ae200000-0000-0000-0000-000000000001','ae000000-0000-0000-0000-00000000000a','plain','2026-11-05','task');
select is((select repeat_interval from public.schedules where id='ae200000-0000-0000-0000-000000000001'), 1::smallint, 'defaults to 1');
select lives_ok($$insert into public.schedules(user_id,title,date,kind,repeat_rule,repeat_days,repeat_interval,repeat_until)
  values ('ae000000-0000-0000-0000-00000000000a','biweekly','2026-11-10','task','weekly','{2}',2,'2026-12-31')$$, 'every other week task with an end');
select throws_ok($$insert into public.schedules(user_id,title,date,repeat_rule,repeat_interval) values ('ae000000-0000-0000-0000-00000000000a','x','2026-11-05','none',2)$$, '23514', null, 'a one-off cannot carry an interval');
select throws_ok($$insert into public.schedules(user_id,title,date,repeat_rule,repeat_interval) values ('ae000000-0000-0000-0000-00000000000a','x','2026-11-05','daily',0)$$, '23514', null, 'interval below 1 refused');
select throws_ok($$insert into public.schedules(user_id,title,date,repeat_rule,repeat_interval) values ('ae000000-0000-0000-0000-00000000000a','x','2026-11-05','daily',100)$$, '23514', null, 'interval above 99 refused');

-- Rows written before the column existed (production today) get 1 and pass the check when the migration is replayed.
alter table public.schedules drop constraint schedules_repeat_interval_valid;
alter table public.schedules drop column repeat_interval;
insert into public.schedules(id,user_id,title,date,kind,repeat_rule,repeat_days) values
  ('ae200000-0000-0000-0000-000000000002','ae000000-0000-0000-0000-00000000000a','legacy weekly','2026-11-02','task','weekly','{1,3}'),
  ('ae200000-0000-0000-0000-000000000003','ae000000-0000-0000-0000-00000000000a','legacy once','2026-11-02','event','none','{}');
alter table public.schedules add column if not exists repeat_interval smallint not null default 1;
alter table public.schedules drop constraint if exists schedules_repeat_interval_valid;
select lives_ok($$alter table public.schedules add constraint schedules_repeat_interval_valid check (
  repeat_interval between 1 and 99 and (repeat_rule <> 'none' or repeat_interval = 1))$$, 'migration applies over legacy rows');
select is((select array_agg(repeat_interval order by id) from public.schedules where id in ('ae200000-0000-0000-0000-000000000002','ae200000-0000-0000-0000-000000000003')), '{1,1}'::smallint[], 'legacy rows read as every 1');

-- RLS: the owner edits the interval; another user can neither see nor change it.
set local role authenticated;
set local request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000a';
select lives_ok($$update public.schedules set repeat_interval=3 where id='ae200000-0000-0000-0000-000000000002'$$, 'owner updates interval');
set local request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000b';
select is((select count(*) from public.schedules where id='ae200000-0000-0000-0000-000000000002'), 0::bigint, 'other user cannot read the series');
update public.schedules set repeat_interval=9 where id='ae200000-0000-0000-0000-000000000002';
reset role;
select is((select repeat_interval from public.schedules where id='ae200000-0000-0000-0000-000000000002'), 3::smallint, 'other user cannot change the interval');
-- Completing one day splits it off as a one-off row that keeps interval 1.
set local role authenticated;
set local request.jwt.claim.sub = 'ae000000-0000-0000-0000-00000000000a';
select lives_ok($$insert into public.schedules(user_id,title,date,kind,status,repeat_rule,series_id) values
  ('ae000000-0000-0000-0000-00000000000a','legacy weekly','2026-11-04','task','done','none','ae200000-0000-0000-0000-000000000002')$$, 'done occurrence row saves');
select * from finish();
rollback;
