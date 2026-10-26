begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users(id, email) values
 ('c1000000-0000-0000-0000-000000000001', 'gcal-a@example.test'),
 ('c1000000-0000-0000-0000-000000000002', 'gcal-b@example.test');

select is(
  has_table_privilege('authenticated', 'public.google_calendar_connections', 'select'),
  false,
  'authenticated has no select grant on connections'
);
select is(
  has_table_privilege('authenticated', 'public.google_calendar_connections', 'insert'),
  false,
  'authenticated has no insert grant on connections'
);
select is(
  has_table_privilege('authenticated', 'public.google_calendar_event_links', 'select'),
  false,
  'authenticated has no select grant on event links'
);
select is(
  has_table_privilege('authenticated', 'public.google_calendar_event_links', 'insert'),
  false,
  'authenticated has no insert grant on event links'
);

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$insert into public.google_calendar_connections(user_id, status, oauth_state_hash, origin)
    values (auth.uid(), 'awaiting_consent', 'state-a', 'http://127.0.0.1:5173')$$,
  '42501',
  null,
  'authenticated cannot insert connections'
);
select throws_ok(
  $$insert into public.calendars(owner_user_id, type, name)
    values (auth.uid(), 'external', 'Google')$$,
  '42501',
  null,
  'authenticated cannot insert type=external'
);
select lives_ok(
  $$insert into public.schedules(id, user_id, title, date, change_source)
    values ('c2000000-0000-0000-0000-000000000001', auth.uid(), 'imported', '2026-10-23', 'calendar_sync')$$,
  'change_source calendar_sync is allowed'
);
select throws_ok(
  $$insert into public.schedules(user_id, title, date, change_source)
    values (auth.uid(), 'bad source', '2026-10-23', 'google')$$,
  '23514',
  null,
  'unknown change_source is rejected'
);
reset role;

select throws_ok(
  $$insert into public.google_calendar_connections(user_id, status, oauth_state_hash, origin, refresh_token)
    values ('c1000000-0000-0000-0000-000000000001', 'awaiting_consent', 'state-token', 'http://127.0.0.1:5173', 'refresh')$$,
  '23514',
  null,
  'awaiting_consent cannot store a refresh token'
);
select throws_ok(
  $$insert into public.google_calendar_connections(
      user_id, status, google_sub, account_email, refresh_token, access_token, access_token_expires_at
    ) values (
      'c1000000-0000-0000-0000-000000000001', 'ready', 'sub', 'a@example.test', 'r', 'a', now()
    )$$,
  '23514',
  null,
  'ready cannot miss blanky_calendar_id'
);
select throws_ok(
  $$insert into public.google_calendar_connections(user_id, status)
    values ('c1000000-0000-0000-0000-000000000001', 'disconnected')$$,
  '23514',
  null,
  'invalid connection status is rejected'
);

insert into public.google_calendar_connections(id, user_id, status, oauth_state_hash, origin)
values (
  'c3000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'awaiting_consent',
  'state-ok',
  'http://127.0.0.1:5173'
);

insert into public.calendars(id, owner_user_id, type, name, timezone)
values (
  'c4000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'external',
  'Google',
  'Asia/Seoul'
);

update public.google_calendar_connections set
  status = 'ready',
  oauth_state_hash = null,
  origin = null,
  google_sub = 'sub-1',
  account_email = 'a@example.test',
  refresh_token = 'refresh',
  access_token = 'access',
  access_token_expires_at = now() + interval '1 hour',
  google_calendar_id = 'primary',
  blanky_calendar_id = 'c4000000-0000-0000-0000-000000000001',
  calendar_summary = 'Google',
  calendar_timezone = 'Asia/Seoul'
where id = 'c3000000-0000-0000-0000-000000000001';

select is(
  (select status from public.google_calendar_connections where id = 'c3000000-0000-0000-0000-000000000001'),
  'ready',
  'service role can bind a ready connection'
);

insert into public.google_calendar_event_links(
  connection_id, schedule_id, google_event_id, etag, applied_blanky_updated_at, origin
) values (
  'c3000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001',
  'evt-1',
  'etag-1',
  now(),
  'google'
);

select throws_ok(
  $$insert into public.google_calendar_event_links(
      connection_id, schedule_id, google_event_id, etag, applied_blanky_updated_at, origin
    ) values (
      'c3000000-0000-0000-0000-000000000001',
      'c2000000-0000-0000-0000-000000000099',
      'evt-1',
      'etag-2',
      now(),
      'google'
    )$$,
  '23505',
  null,
  'google_event_id is unique per connection'
);
select throws_ok(
  $$insert into public.google_calendar_event_links(
      connection_id, schedule_id, google_event_id, etag, applied_blanky_updated_at, origin
    ) values (
      'c3000000-0000-0000-0000-000000000001',
      'c2000000-0000-0000-0000-000000000001',
      'evt-2',
      'etag-2',
      now(),
      'blanky'
    )$$,
  '23505',
  null,
  'schedule_id is unique'
);
select throws_ok(
  $$insert into public.google_calendar_event_links(
      connection_id, schedule_id, google_event_id, etag, applied_blanky_updated_at, origin
    ) values (
      'c3000000-0000-0000-0000-000000000001',
      'c2000000-0000-0000-0000-000000000098',
      'evt-3',
      'etag-3',
      now(),
      'both'
    )$$,
  '23514',
  null,
  'event link origin must be blanky or google'
);

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$delete from public.calendars where id = 'c4000000-0000-0000-0000-000000000001'$$,
  '23503',
  null,
  'bound external calendar cannot be deleted'
);
select lives_ok(
  $$delete from public.schedules where id = 'c2000000-0000-0000-0000-000000000001'$$,
  'deleting a mapped schedule does not require deleting the event link'
);
reset role;

select is(
  (select count(*) from public.google_calendar_event_links where schedule_id = 'c2000000-0000-0000-0000-000000000001'),
  1::bigint,
  'event link survives schedule delete'
);

delete from public.google_calendar_connections where id = 'c3000000-0000-0000-0000-000000000001';
select is_empty(
  $$select schedule_id from public.google_calendar_event_links$$,
  'deleting a connection cascades event links'
);

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
select lives_ok(
  $$delete from public.calendars where id = 'c4000000-0000-0000-0000-000000000001'$$,
  'unbound empty external calendar can be deleted'
);
reset role;

select throws_ok(
  $$insert into public.google_calendar_connections(user_id, status, google_sub, account_email)
    values ('c1000000-0000-0000-0000-000000000002', 'needs_reauth', 'sub-2', 'b@example.test')$$,
  '23514',
  null,
  'needs_reauth cannot miss the bound calendar'
);

select * from finish();
rollback;
