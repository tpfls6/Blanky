begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
insert into auth.users(id,email) values
 ('a8000000-0000-0000-0000-000000000001','package-a@example.test'),
 ('b8000000-0000-0000-0000-000000000002','package-b@example.test');
insert into public.themes(id,creator_id,name,visibility,theme_config,theme_type,package_version,manifest,theme_package,package_url)
select 'a8100000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','Package','public','{}','package','1.2.0',m,
 jsonb_build_object('manifest',m,'config','{}'::jsonb,'files','{}'::jsonb,'customCss',''),
 'a8000000-0000-0000-0000-000000000001/a8100000-0000-0000-0000-000000000001/1.2.0-rev/theme.blanky-theme'
from (select '{"formatVersion":1,"id":"package-test","name":"Package","author":"A","description":"","version":"1.2.0","entry":{"theme":"theme.json"},"assets":{},"iconPack":{},"previews":[]}'::jsonb m) src;
insert into public.themes(id,creator_id,name,visibility,theme_config) values
 ('a8100000-0000-0000-0000-000000000002','a8000000-0000-0000-0000-000000000001','Private','private','{}');
insert into public.themes(id,creator_id,name,visibility,pricing_type,price,theme_config) values
 ('a8100000-0000-0000-0000-000000000003','a8000000-0000-0000-0000-000000000001','Paid','public','paid',1500,'{}');
insert into storage.objects(bucket_id,name) values
 ('theme-packages','a8000000-0000-0000-0000-000000000001/a8100000-0000-0000-0000-000000000003/1.0.0-rev/theme.blanky-theme');
insert into storage.objects(bucket_id,name) values
 ('theme-assets','a8000000-0000-0000-0000-000000000001/a8100000-0000-0000-0000-000000000001/1.2.0-rev/assets/test.svg');
select is((select count(*)::integer from public.themes where creator_id is null and theme_type='basic'),4,'four builtin themes remain basic');
select is((select count(*)::integer from storage.buckets where id in ('theme-assets','theme-previews','theme-packages') and not public),3,'three private storage buckets');
select throws_ok($$insert into public.themes(name,theme_config,theme_type) values('Invalid','{}','package')$$,'23514',null,'package shape is required');
select throws_ok($$update public.themes set format_version=3 where name='Package'$$,'23514',null,'unsupported format versions rejected');
set local role authenticated;
set local request.jwt.claim.sub='b8000000-0000-0000-0000-000000000002';
select ok(public.can_read_theme_object('a8000000-0000-0000-0000-000000000001/a8100000-0000-0000-0000-000000000001/1.2.0-rev/assets/test.svg'),'public package preview readable before install');
select ok(not public.can_read_theme_object('a8000000-0000-0000-0000-000000000001/a8100000-0000-0000-0000-000000000002/1.0.0-rev/assets/test.svg'),'private package hidden from nonowner');
select is_empty($select id from storage.objects where bucket_id='theme-packages'$,'paid archives require ownership');
select lives_ok($select public.install_theme('a8100000-0000-0000-0000-000000000001')$$,'existing free install RPC accepts package themes');
select is((select installed_package_version from public.user_themes where theme_id='a8100000-0000-0000-0000-000000000001'),'1.2.0','installed version recorded');
select throws_ok($$insert into storage.objects(bucket_id,name) values('theme-assets','a8000000-0000-0000-0000-000000000001/a8100000-0000-0000-0000-000000000001/forged/assets/test.svg')$$,'42501',null,'another uploader prefix cannot be forged');
select is_empty($$delete from storage.objects where bucket_id='theme-assets' returning id$$,'installer cannot delete creator originals');
set local request.jwt.claim.sub='a8000000-0000-0000-0000-000000000001';
update public.themes set visibility='private' where name='Package';
select is_empty($$update storage.objects set metadata='{}' where bucket_id='theme-assets' returning id$$,'asset paths are immutable');
select is_empty($$delete from storage.objects where bucket_id='theme-assets' returning id$$,'current revision cannot be removed by cleanup');
set local request.jwt.claim.sub='b8000000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.themes where name='Package'),1,'installed package remains readable after unlisting');
select ok(public.can_read_theme_object('a8000000-0000-0000-0000-000000000001/a8100000-0000-0000-0000-000000000001/1.2.0-rev/assets/test.svg'),'installed private assets remain readable');
delete from public.user_themes where theme_id='a8100000-0000-0000-0000-000000000001';
select ok(not public.can_read_theme_object('a8000000-0000-0000-0000-000000000001/a8100000-0000-0000-0000-000000000001/1.2.0-rev/assets/test.svg'),'uninstall revokes private asset access');
reset role;
select is((select count(*)::integer from storage.objects where bucket_id='theme-assets' and name like '%1.2.0-rev/assets/test.svg'),1,'uninstall preserves source object');
select * from finish();
rollback;
