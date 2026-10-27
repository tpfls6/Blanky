begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users(id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'batch-a@example.test'),
  ('b1000000-0000-0000-0000-000000000002', 'batch-b@example.test');

insert into public.schedules(id, user_id, title, date, start_time, end_time)
values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '근로', '2026-10-28', '15:00', '16:00'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', '근로', '2026-10-28', '15:00', '16:00'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', '수업', '2026-10-28', '15:00', '16:00'),
  ('a2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', '수업', '2026-10-28', '15:00', '16:00'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', '타인', '2026-10-28', '15:00', '16:00');

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

select is(
  (select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000001',
    array['a2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004']::uuid[]
  )->>'status'),
  'applied',
  'owner batch deletes both duplicates'
);
select is(
  (select count(*) from public.schedules where user_id = 'a1000000-0000-0000-0000-000000000001'),
  2::bigint,
  'requery after apply keeps the two originals'
);
select is(
  (select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000001',
    array['a2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004']::uuid[]
  )->>'status'),
  'unchanged',
  'same key replays without a second delete'
);

select throws_ok(
  $$select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000001',
    array['a2000000-0000-0000-0000-000000000001']::uuid[]
  )$$,
  'P0001',
  'IDEMPOTENCY_CONFLICT',
  'same key with different ids is rejected'
);

select throws_ok(
  $$select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000002',
    array['a2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001']::uuid[]
  )$$,
  'P0001',
  'FORBIDDEN',
  'foreign id fails the whole batch'
);
select is(
  (select count(*) from public.schedules where id = 'a2000000-0000-0000-0000-000000000001'),
  1::bigint,
  'forbidden batch rolls back the owner row'
);

select throws_ok(
  $$select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000003',
    array['a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000099']::uuid[]
  )$$,
  'P0001',
  'NOT_FOUND',
  'missing id fails the whole batch'
);
select is(
  (select count(*) from public.schedules where id = 'a2000000-0000-0000-0000-000000000001'),
  1::bigint,
  'missing-id batch rolls back'
);

set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';
select is_empty($$select id from public.schedule_batch_jobs$$, 'other user cannot read owner batch jobs');
select is_empty(
  $$select id from public.schedules where id = 'a2000000-0000-0000-0000-000000000001'$$,
  'other user cannot read owner schedules'
);
select throws_ok(
  $$select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000004',
    array['a2000000-0000-0000-0000-000000000001']::uuid[]
  )$$,
  'P0001',
  'FORBIDDEN',
  'other user cannot delete by guessing an id'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
insert into public.schedules(id, user_id, title, date, change_source)
values (
  'a2000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000001',
  '가져온 근로',
  '2026-10-28',
  'calendar_sync'
);
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000005',
    array['a2000000-0000-0000-0000-000000000010']::uuid[]
  )$$,
  'P0001',
  'GOOGLE_PROTECTED',
  'google-origin rows stay out of the local batch'
);
select is(
  (select count(*) from public.schedules where id = 'a2000000-0000-0000-0000-000000000010'),
  1::bigint,
  'protected google-origin row is still present'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
insert into public.google_calendar_connections(id, user_id, status, oauth_state_hash, origin)
values (
  'c3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'awaiting_consent',
  'batch-state',
  'http://127.0.0.1:5173'
);
insert into public.calendars(id, owner_user_id, type, name, timezone)
values (
  'c4000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'external',
  'Google',
  'Asia/Seoul'
);
update public.google_calendar_connections set
  status = 'ready',
  oauth_state_hash = null,
  origin = null,
  google_sub = 'sub-batch',
  account_email = 'batch@example.test',
  refresh_token = 'refresh',
  access_token = 'access',
  access_token_expires_at = now() + interval '1 hour',
  google_calendar_id = 'primary',
  blanky_calendar_id = 'c4000000-0000-0000-0000-000000000001',
  calendar_summary = 'Google',
  calendar_timezone = 'Asia/Seoul'
where id = 'c3000000-0000-0000-0000-000000000001';

insert into public.schedules(id, user_id, title, date)
values ('a2000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000001', '보낸 근로', '2026-10-28');
insert into public.google_calendar_event_links(
  connection_id, schedule_id, google_event_id, etag, applied_blanky_updated_at, origin
) values (
  'c3000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000020',
  'evt-blanky',
  'etag-1',
  now(),
  'blanky'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select is(
  (select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000006',
    array['a2000000-0000-0000-0000-000000000020']::uuid[]
  )->>'google'),
  'pending',
  'blanky-origin google copies leave sync pending'
);
select is(
  (select count(*) from public.google_sync_jobs where schedule_id = 'a2000000-0000-0000-0000-000000000020' and status = 'pending'),
  1::bigint,
  'pending google delete is stored once'
);
select is(
  (select public.retry_google_sync_jobs()->>'pending'),
  '1',
  'retry keeps the job pending while the event link remains'
);
select is(
  (select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000006',
    array['a2000000-0000-0000-0000-000000000020']::uuid[]
  )->>'status'),
  'unchanged',
  'replay of a pending batch does not enqueue a second google delete'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
delete from public.google_calendar_event_links where schedule_id = 'a2000000-0000-0000-0000-000000000020';
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select is(
  (select public.retry_google_sync_jobs()->>'done'),
  '1',
  'retry marks the google job done after the link is gone'
);

select throws_ok(
  $$insert into public.schedule_batch_jobs(id, user_id, request_hash, status, deleted_ids, google_status)
    values (gen_random_uuid(), auth.uid(), 'x', 'applied', '{}', 'idle')$$,
  '42501',
  null,
  'authenticated cannot insert batch jobs directly'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.apply_schedule_batch(
    'd1000000-0000-0000-0000-000000000007',
    array['a2000000-0000-0000-0000-000000000001']::uuid[]
  )$$,
  '42501',
  null,
  'anonymous cannot apply a batch'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select isnt_empty($$select id from public.schedule_changes where action = 'deleted'$$, 'batch deletes keep the existing change log');

select * from finish();
rollback;
