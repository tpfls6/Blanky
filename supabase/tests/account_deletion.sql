begin;
create extension if not exists pgtap with schema extensions;
select plan(45);
-- a: existing member with Google, schedules, history, creator content and files. b: new member. c: other user. d: bystander.
insert into auth.users(id,email) values
 ('ad000000-0000-0000-0000-00000000000a','existing@example.test'),
 ('ad000000-0000-0000-0000-00000000000b','new@example.test'),
 ('ad000000-0000-0000-0000-00000000000c','other@example.test'),
 ('ad000000-0000-0000-0000-00000000000d','bystander@example.test');
insert into public.user_preferences(user_id) values ('ad000000-0000-0000-0000-00000000000a');
insert into public.google_calendar_connections(id,user_id,status,google_sub,account_email,refresh_token,access_token,access_token_expires_at,google_calendar_id,blanky_calendar_id,calendar_summary,calendar_timezone)
select 'ad100000-0000-0000-0000-00000000000a','ad000000-0000-0000-0000-00000000000a','ready','sub','a@example.test','r','a',now(),'primary',id,'Blanky','Asia/Seoul'
from public.calendars where owner_user_id='ad000000-0000-0000-0000-00000000000a' and is_default_personal;
insert into public.schedules(id,user_id,title,date) values
 ('ad200000-0000-0000-0000-00000000000a','ad000000-0000-0000-0000-00000000000a','mine 1','2026-11-01'),
 ('ad200000-0000-0000-0000-0000000000a2','ad000000-0000-0000-0000-00000000000a','mine 2','2026-11-02'),
 ('ad200000-0000-0000-0000-00000000000c','ad000000-0000-0000-0000-00000000000c','other keeps','2026-11-01'),
 ('ad200000-0000-0000-0000-0000000000c2','ad000000-0000-0000-0000-00000000000c','other deletes','2026-11-01');
insert into public.google_calendar_event_links(connection_id,schedule_id,google_event_id,etag,applied_blanky_updated_at,origin)
values ('ad100000-0000-0000-0000-00000000000a','ad200000-0000-0000-0000-00000000000a','evt','etag',now(),'blanky');
insert into public.themes(id,creator_id,name,visibility,theme_config) values
 ('ad300000-0000-0000-0000-0000000000a1','ad000000-0000-0000-0000-00000000000a','Kept','public','{}'),
 ('ad300000-0000-0000-0000-0000000000a2','ad000000-0000-0000-0000-00000000000a','Solo','public','{}'),
 ('ad300000-0000-0000-0000-0000000000c1','ad000000-0000-0000-0000-00000000000c','Other own','private','{}');
insert into public.user_themes(user_id,theme_id) values
 ('ad000000-0000-0000-0000-00000000000a','ad300000-0000-0000-0000-0000000000a2'),
 ('ad000000-0000-0000-0000-00000000000c','ad300000-0000-0000-0000-0000000000a1');
insert into public.user_theme_settings(user_id,active_theme_id) values ('ad000000-0000-0000-0000-00000000000c','ad300000-0000-0000-0000-0000000000a1');
insert into public.template_listings(id,creator_id,name,status) values
 ('ad400000-0000-0000-0000-0000000000a1','ad000000-0000-0000-0000-00000000000a','Kept listing','published'),
 ('ad400000-0000-0000-0000-0000000000a2','ad000000-0000-0000-0000-00000000000a','Solo listing','published');
insert into public.template_versions(id,listing_id,version,snapshot) values
 ('ad500000-0000-0000-0000-0000000000a1','ad400000-0000-0000-0000-0000000000a1',1,'{}'),
 ('ad500000-0000-0000-0000-0000000000a2','ad400000-0000-0000-0000-0000000000a2',1,'{}');
insert into public.template_installs(user_id,listing_id,version_id,page_id,request_id) values
 ('ad000000-0000-0000-0000-00000000000c','ad400000-0000-0000-0000-0000000000a1','ad500000-0000-0000-0000-0000000000a1',gen_random_uuid(),gen_random_uuid()),
 ('ad000000-0000-0000-0000-00000000000a','ad400000-0000-0000-0000-0000000000a2','ad500000-0000-0000-0000-0000000000a2',gen_random_uuid(),gen_random_uuid());
insert into storage.objects(bucket_id,name,owner,owner_id) values
 ('theme-assets','ad000000-0000-0000-0000-00000000000a/ad300000-0000-0000-0000-0000000000a1/r1/bg.png','ad000000-0000-0000-0000-00000000000a','ad000000-0000-0000-0000-00000000000a'),
 ('theme-packages','ad000000-0000-0000-0000-00000000000a/ad300000-0000-0000-0000-0000000000a1/r1/theme.blankytheme','ad000000-0000-0000-0000-00000000000a','ad000000-0000-0000-0000-00000000000a'),
 ('theme-assets','ad000000-0000-0000-0000-00000000000a/ad300000-0000-0000-0000-0000000000a2/r1/bg.png','ad000000-0000-0000-0000-00000000000a','ad000000-0000-0000-0000-00000000000a'),
 ('theme-assets','ad000000-0000-0000-0000-00000000000c/ad300000-0000-0000-0000-0000000000c1/r1/bg.png','ad000000-0000-0000-0000-00000000000c','ad000000-0000-0000-0000-00000000000c');

-- Definer functions: pinned search_path, no client execute.
select ok(p.prosecdef, p.proname||' is security definer') from pg_proc p
 where p.pronamespace='public'::regnamespace and p.proname in ('guard_bound_external_calendar','record_schedule_activity','release_creator_content','account_storage_leftovers') order by p.proname;
select is(p.proconfig, array['search_path=""'], p.proname||' pins an empty search_path') from pg_proc p
 where p.pronamespace='public'::regnamespace and p.proname in ('guard_bound_external_calendar','record_schedule_activity','release_creator_content','account_storage_leftovers') order by p.proname;
select ok(not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'), p.proname||' is not client executable') from pg_proc p
 where p.pronamespace='public'::regnamespace and p.proname in ('guard_bound_external_calendar','record_schedule_activity','release_creator_content','account_storage_leftovers') order by p.proname;
select ok(has_function_privilege('service_role','public.account_storage_leftovers(uuid)','execute'),'service role can list storage leftovers');
select is_empty($$select * from public.account_storage_leftovers('ad000000-0000-0000-0000-00000000000a')$$,'a live account never lists its files for deletion');

-- Guards still protect a live account.
select throws_ok($$delete from public.calendars where owner_user_id='ad000000-0000-0000-0000-00000000000a'$$,'23503',null,'bound calendar of a live owner stays protected');

-- Ordinary client work is unchanged.
set local role authenticated;
set local request.jwt.claim.sub='ad000000-0000-0000-0000-00000000000c';
select lives_ok($$delete from public.schedules where id='ad200000-0000-0000-0000-0000000000c2'$$,'owner deletes a schedule');
select is((select count(*) from public.schedule_changes where schedule_id='ad200000-0000-0000-0000-0000000000c2' and action='deleted'),1::bigint,'schedule delete is still recorded');
select lives_ok($$insert into public.calendars(id,owner_user_id,name) values ('ad600000-0000-0000-0000-00000000000c','ad000000-0000-0000-0000-00000000000c','spare')$$,'owner adds a calendar');
select lives_ok($$delete from public.calendars where id='ad600000-0000-0000-0000-00000000000c'$$,'owner deletes an unbound calendar');
reset role;

-- Existing member: the account deletion that used to fail.
select lives_ok($$delete from auth.users where id='ad000000-0000-0000-0000-00000000000a'$$,'existing member with Google, schedules and creator content is deleted');
select is_empty($$select id from public.calendars where owner_user_id='ad000000-0000-0000-0000-00000000000a'$$,'calendars removed');
select is_empty($$select id from public.schedules where user_id='ad000000-0000-0000-0000-00000000000a'$$,'schedules removed');
select is_empty($$select id from public.schedule_changes where user_id='ad000000-0000-0000-0000-00000000000a'$$,'history removed');
select is_empty($$select id from public.google_calendar_connections where user_id='ad000000-0000-0000-0000-00000000000a'$$,'Google connection removed');
select is_empty($$select 1 from public.google_calendar_event_links where connection_id='ad100000-0000-0000-0000-00000000000a'$$,'Google event links removed');
select is_empty($$select id from public.themes where id='ad300000-0000-0000-0000-0000000000a2'$$,'theme nobody else uses is removed');
select is_empty($$select id from public.template_listings where id='ad400000-0000-0000-0000-0000000000a2'$$,'listing nobody else uses is removed');
select results_eq($$select creator_id, visibility from public.themes where id='ad300000-0000-0000-0000-0000000000a1'$$,
 $$values (null::uuid, 'private'::text)$$,'theme another user installed is kept, private and creatorless');
select results_eq($$select creator_id, status from public.template_listings where id='ad400000-0000-0000-0000-0000000000a1'$$,
 $$values (null::uuid, 'archived'::text)$$,'listing another user installed is kept and archived');
select results_eq($$select bucket_id, name from public.account_storage_leftovers('ad000000-0000-0000-0000-00000000000a')$$,
 $$values ('theme-assets'::text, 'ad000000-0000-0000-0000-00000000000a/ad300000-0000-0000-0000-0000000000a2/r1/bg.png'::text)$$,
 'only files of removed content are left for Storage cleanup');

-- Other user's data is untouched.
select is((select count(*) from public.schedules where id='ad200000-0000-0000-0000-00000000000c'),1::bigint,'other user schedule kept');
select is((select count(*) from public.user_themes where user_id='ad000000-0000-0000-0000-00000000000c'),1::bigint,'other user theme install kept');
select is((select active_theme_id from public.user_theme_settings where user_id='ad000000-0000-0000-0000-00000000000c'),'ad300000-0000-0000-0000-0000000000a1'::uuid,'other user active theme kept');
select is((select count(*) from public.template_installs where user_id='ad000000-0000-0000-0000-00000000000c'),1::bigint,'other user template install kept');
select is((select count(*) from public.themes where creator_id='ad000000-0000-0000-0000-00000000000c'),1::bigint,'other user own theme kept');
select is((select count(*) from public.account_storage_leftovers('ad000000-0000-0000-0000-00000000000c')),0::bigint,'other user files are never listed');

-- Installer keeps access to a kept theme; others cannot adopt it.
set local role authenticated;
set local request.jwt.claim.sub='ad000000-0000-0000-0000-00000000000c';
select is((select count(*) from public.themes where id='ad300000-0000-0000-0000-0000000000a1'),1::bigint,'installer still reads the kept theme');
select ok(public.can_read_theme_object('ad000000-0000-0000-0000-00000000000a/ad300000-0000-0000-0000-0000000000a1/r1/bg.png'),'installer still reads the kept theme files');
select is((select count(*) from storage.objects where bucket_id='theme-packages' and name like 'ad000000-0000-0000-0000-00000000000a/%'),1::bigint,'installer still reads the kept theme package');
set local request.jwt.claim.sub='ad000000-0000-0000-0000-00000000000d';
select is_empty($$select id from public.themes where id='ad300000-0000-0000-0000-0000000000a1'$$,'kept theme left the store');
select is_empty($$select id from storage.objects where name like 'ad000000-0000-0000-0000-00000000000a/%'$$,'bystander cannot read kept theme files');
select throws_ok($$insert into public.user_theme_settings(user_id,active_theme_id) values ('ad000000-0000-0000-0000-00000000000d','ad300000-0000-0000-0000-0000000000a1')$$,
 '42501',null,'a creatorless private theme is not treated as built in');
reset role;

-- New member: only signup rows exist.
select is((select count(*) from public.calendars where owner_user_id='ad000000-0000-0000-0000-00000000000b'),1::bigint,'signup created a personal calendar');
select lives_ok($$delete from auth.users where id='ad000000-0000-0000-0000-00000000000b'$$,'new member is deleted');
select is_empty($$select id from public.calendars where owner_user_id='ad000000-0000-0000-0000-00000000000b'$$,'new member calendar removed');
select * from finish();
rollback;
