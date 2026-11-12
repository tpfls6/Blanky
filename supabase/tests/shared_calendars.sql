begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
 ('5a000000-0000-0000-0000-00000000000a', 'owner@shared.test', now(), '{"name":"Owner"}'),
 ('5b000000-0000-0000-0000-00000000000b', 'editor@shared.test', now(), '{"name":"Editor"}'),
 ('5c000000-0000-0000-0000-00000000000c', 'viewer@shared.test', now(), '{}'),
 ('5d000000-0000-0000-0000-00000000000d', 'outsider@shared.test', now(), '{}'),
 ('5e000000-0000-0000-0000-00000000000e', 'unconfirmed@shared.test', null, '{}');

create temp table ids(name text primary key, value text);
grant all on ids to authenticated;

set local role authenticated;
-- Owner creates a shared calendar and a schedule in it.
set local request.jwt.claim.sub = '5a000000-0000-0000-0000-00000000000a';
select lives_ok($$insert into public.calendars(id, owner_user_id, type, name, color)
 values ('5f000000-0000-0000-0000-000000000001', auth.uid(), 'shared', 'Team', '#2F855A')$$, 'owner creates shared calendar');
select is(public.calendar_role('5f000000-0000-0000-0000-000000000001'), 'owner', 'creator becomes owner member');
select isnt_empty($$insert into public.calendars(owner_user_id, type, name) values (auth.uid(), 'shared', 'Returning') returning id$$,
 'creator reads back a new shared calendar');
select lives_ok($$insert into public.schedules(id, user_id, calendar_id, title, date, repeat_rule)
 values ('5f100000-0000-0000-0000-000000000001', auth.uid(), '5f000000-0000-0000-0000-000000000001', 'Standup', '2026-11-05', 'weekly')$$,
 'owner adds shared schedule');
select lives_ok($$insert into public.schedules(id, user_id, title, date)
 values ('5f100000-0000-0000-0000-0000000000a1', auth.uid(), 'Owner private', '2026-11-05')$$, 'owner keeps personal schedule');

-- Outsider sees nothing and cannot write.
set local request.jwt.claim.sub = '5d000000-0000-0000-0000-00000000000d';
select is_empty($$select id from public.calendars where id = '5f000000-0000-0000-0000-000000000001'$$, 'outsider cannot read calendar');
select is_empty($$select id from public.schedules where user_id <> auth.uid()$$, 'outsider cannot read shared or personal schedules');
select throws_ok($$insert into public.schedules(user_id, calendar_id, title, date)
 values (auth.uid(), '5f000000-0000-0000-0000-000000000001', 'intrude', '2026-11-05')$$, '42501', null, 'outsider cannot insert');
select is_empty($$update public.schedules set title = 'x' where id = '5f100000-0000-0000-0000-000000000001' returning id$$, 'outsider cannot update');
select throws_ok($$select public.calendar_member_list('5f000000-0000-0000-0000-000000000001')$$, '42501', null, 'outsider cannot list members');
select throws_ok($$select public.invite_calendar_member('5f000000-0000-0000-0000-000000000001', 'x@y.z', 'editor')$$, '42501', null, 'outsider cannot invite');

-- Email invitation.
set local request.jwt.claim.sub = '5a000000-0000-0000-0000-00000000000a';
select lives_ok($$insert into ids select 'emailInvite', (public.invite_calendar_member('5f000000-0000-0000-0000-000000000001', ' Editor@Shared.test ', 'editor')).id::text$$,
 'owner invites by email');
select lives_ok($$select public.invite_calendar_member('5f000000-0000-0000-0000-000000000001', 'editor@shared.test', 'editor')$$, 're-invite refreshes pending invitation');
select is((select count(*) from public.calendar_invitations where kind = 'email' and status = 'pending'), 1::bigint, 'no duplicate pending invitation');
select throws_ok($$select public.invite_calendar_member('5f000000-0000-0000-0000-000000000001', 'not-an-email', 'editor')$$, '22023', null, 'invalid email rejected');
select throws_ok($$select public.invite_calendar_member('5f000000-0000-0000-0000-000000000001', 'owner@shared.test', 'viewer')$$, '23505', null, 'existing member cannot be invited');

set local request.jwt.claim.sub = '5b000000-0000-0000-0000-00000000000b';
select is((select count(*) from public.notifications where type = 'invite_received'), 1::bigint, 'invitee notified once');
select is((select count(*) from public.my_calendar_invitations()), 1::bigint, 'invitee sees pending invitation');
select is_empty($$select id from public.schedules where calendar_id = '5f000000-0000-0000-0000-000000000001'$$, 'pending invitee cannot read schedules');
select lives_ok($$select public.respond_calendar_invitation((select value::uuid from ids where name = 'emailInvite'), true)$$, 'invitee accepts');
select is(public.calendar_role('5f000000-0000-0000-0000-000000000001'), 'editor', 'invitee joined as editor');
select is((select count(*) from public.notifications where type = 'invite_received'), 0::bigint, 'answered invitation notice cleared');
select isnt_empty($$select id from public.schedules where id = '5f100000-0000-0000-0000-000000000001'$$, 'editor reads shared schedule');
select is_empty($$select id from public.schedules where id = '5f100000-0000-0000-0000-0000000000a1'$$, 'editor cannot read owner personal schedule');
select lives_ok($$update public.schedules set title = 'Standup v2' where id = '5f100000-0000-0000-0000-000000000001'$$, 'editor updates shared schedule');
select lives_ok($$update public.schedules set title = 'Standup v3' where id = '5f100000-0000-0000-0000-000000000001'$$, 'editor updates again');
select is((select updated_by_user_id from public.schedules where id = '5f100000-0000-0000-0000-000000000001'),
 '5b000000-0000-0000-0000-00000000000b'::uuid, 'last editor recorded');
select is((select created_by_user_id from public.schedules where id = '5f100000-0000-0000-0000-000000000001'),
 '5a000000-0000-0000-0000-00000000000a'::uuid, 'creator kept');
select throws_ok($$select public.invite_calendar_member('5f000000-0000-0000-0000-000000000001', 'x@y.z', 'editor')$$, '42501', null, 'editor cannot invite');

set local request.jwt.claim.sub = '5a000000-0000-0000-0000-00000000000a';
select is((select count from public.notifications where type = 'schedule_updated' and schedule_id = '5f100000-0000-0000-0000-000000000001'),
 2, 'repeated edits collapse into one unread notification');
select is((select count(*) from public.notifications where type = 'invite_accepted'), 1::bigint, 'owner notified of acceptance');

-- Link invitation, reissue and expiry.
select lives_ok($$insert into ids select 'oldToken', token from public.create_calendar_invite_link('5f000000-0000-0000-0000-000000000001', 'viewer')$$, 'owner creates link');
select lives_ok($$insert into ids select 'token', token from public.create_calendar_invite_link('5f000000-0000-0000-0000-000000000001', 'viewer')$$, 'owner reissues link');
select is((select count(*) from public.calendar_invitations where kind = 'link' and status = 'pending'), 1::bigint, 'reissue revokes the old link');
select ok((select length(value) = 64 from ids where name = 'token'), 'link token is 256-bit hex');
set local request.jwt.claim.sub = '5c000000-0000-0000-0000-00000000000c';
select is((select state from public.invite_link_preview((select value from ids where name = 'oldToken'))), 'revoked', 'old link previews as revoked');
select throws_ok($$select public.accept_calendar_invite_link((select value from ids where name = 'oldToken'))$$, '22023', 'INVITE_REVOKED', 'old link cannot be used');
select throws_ok($$select public.accept_calendar_invite_link('guess')$$, 'P0002', 'INVITE_INVALID', 'random token rejected');
select is((select state from public.invite_link_preview((select value from ids where name = 'token'))), 'pending', 'new link previews');
select lives_ok($$select public.accept_calendar_invite_link((select value from ids where name = 'token'))$$, 'viewer joins by link');
select is(public.calendar_role('5f000000-0000-0000-0000-000000000001'), 'viewer', 'link grants viewer role');
select isnt_empty($$select id from public.schedules where id = '5f100000-0000-0000-0000-000000000001'$$, 'viewer reads shared schedule');
select is_empty($$update public.schedules set title = 'viewer edit' where id = '5f100000-0000-0000-0000-000000000001' returning id$$, 'viewer cannot update');
select is_empty($$delete from public.schedules where id = '5f100000-0000-0000-0000-000000000001' returning id$$, 'viewer cannot delete');
select throws_ok($$insert into public.schedules(user_id, calendar_id, title, date)
 values (auth.uid(), '5f000000-0000-0000-0000-000000000001', 'viewer add', '2026-11-05')$$, '42501', null, 'viewer cannot insert');
select throws_ok($$select public.set_calendar_member_role('5f000000-0000-0000-0000-000000000001', auth.uid(), 'owner')$$, '42501', null, 'viewer cannot promote self');

-- Expired link.
reset role;
update public.calendar_invitations set expires_at = now() - interval '1 minute' where kind = 'link' and status = 'pending';
set local role authenticated;
set local request.jwt.claim.sub = '5d000000-0000-0000-0000-00000000000d';
select throws_ok($$select public.accept_calendar_invite_link((select value from ids where name = 'token'))$$, '22023', 'INVITE_EXPIRED', 'expired link rejected');

-- Removal revokes access at once; last owner is protected; ownership transfers.
set local request.jwt.claim.sub = '5a000000-0000-0000-0000-00000000000a';
select lives_ok($$select public.remove_calendar_member('5f000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-00000000000c')$$, 'owner removes viewer');
select throws_ok($$select public.remove_calendar_member('5f000000-0000-0000-0000-000000000001', auth.uid())$$, '42501', 'LAST_OWNER', 'last owner cannot leave');
select lives_ok($$select public.transfer_calendar_ownership('5f000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-00000000000b')$$, 'owner transfers ownership');
set local request.jwt.claim.sub = '5c000000-0000-0000-0000-00000000000c';
select is_empty($$select id from public.schedules where calendar_id = '5f000000-0000-0000-0000-000000000001'$$, 'removed member loses read access');

-- Demoted author loses AI batch delete on rows they created.
set local request.jwt.claim.sub = '5b000000-0000-0000-0000-00000000000b';
select lives_ok($$select public.set_calendar_member_role('5f000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-00000000000a', 'viewer')$$, 'new owner demotes previous owner');
set local request.jwt.claim.sub = '5a000000-0000-0000-0000-00000000000a';
select throws_ok($$select public.apply_schedule_batch(gen_random_uuid(), array['5f100000-0000-0000-0000-000000000001'::uuid])$$, 'P0001', 'FORBIDDEN', 'demoted author cannot batch delete');

-- Account deletion hands the calendar to the remaining member.
reset role;
delete from auth.users where id = '5b000000-0000-0000-0000-00000000000b';
select is((select owner_user_id from public.calendars where id = '5f000000-0000-0000-0000-000000000001'),
 '5a000000-0000-0000-0000-00000000000a'::uuid, 'account deletion keeps shared calendar with heir');

select * from finish();
rollback;
