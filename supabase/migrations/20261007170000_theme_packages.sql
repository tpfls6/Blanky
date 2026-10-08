-- Additive extension: existing config themes and install_theme RPC remain valid.
alter table public.themes
 add column if not exists theme_type text not null default 'basic' check(theme_type in ('basic','package')),
 add column if not exists format_version integer not null default 1 check(format_version = 1),
 add column if not exists package_version text not null default '1.0.0',
 add column if not exists manifest jsonb,
 add column if not exists custom_css text not null default '' check(octet_length(custom_css)<=102400),
 add column if not exists theme_package jsonb,
 add column if not exists package_url text not null default '',
 add column if not exists preview_images text[] not null default '{}';
alter table public.themes add constraint theme_package_shape check (
 theme_type='basic' or (
 theme_package is not null and jsonb_typeof(theme_package)='object' and
 manifest is not null and jsonb_typeof(manifest)='object' and manifest->>'formatVersion'='1' and
 manifest->>'version'=package_version and jsonb_typeof(theme_package->'files')='object' and
 theme_package->'manifest'=manifest and theme_package->>'customCss'=custom_css and
 octet_length(theme_package::text)<=524288
 ));
alter table public.user_themes add column if not exists installed_package_version text;
create function public.record_installed_theme_version() returns trigger language plpgsql security definer set search_path=public as $$
begin
 select package_version into new.installed_package_version from public.themes where id=new.theme_id;
 return new;
end $$;
create trigger record_installed_theme_version before insert on public.user_themes for each row execute function public.record_installed_theme_version();
update public.user_themes u set installed_package_version=t.package_version from public.themes t where t.id=u.theme_id;
-- Installed themes remain readable after a creator makes a listing private.
create policy themes_installed_read on public.themes for select to authenticated
 using(exists(select 1 from public.user_themes u where u.theme_id=id and u.user_id=auth.uid()));
-- Private buckets: previews before installation are available only if the theme itself is readable.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('theme-assets','theme-assets',false,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml','font/woff2']),
 ('theme-previews','theme-previews',false,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml']),
 ('theme-packages','theme-packages',false,20971520,array['application/octet-stream'])
on conflict(id) do nothing;
create function public.can_read_theme_object(object_name text) returns boolean language sql stable security invoker set search_path=public as $$
 select (split_part(object_name,'/',1)=auth.uid()::text) or exists(
 select 1 from public.themes t where t.id::text=split_part(object_name,'/',2)
 and t.creator_id::text=split_part(object_name,'/',1)
 and (t.visibility='public' or t.creator_id=auth.uid() or exists(select 1 from public.user_themes u where u.theme_id=t.id and u.user_id=auth.uid()))); 
$$;
revoke all on function public.can_read_theme_object(text) from public,anon;
grant execute on function public.can_read_theme_object(text) to authenticated;
create policy theme_object_read on storage.objects for select to authenticated
 using(bucket_id in ('theme-assets','theme-previews','theme-packages') and public.can_read_theme_object(name)
 and (bucket_id<>'theme-packages' or exists(select 1 from public.themes t
 where t.id::text=split_part(name,'/',2) and t.creator_id::text=split_part(name,'/',1)
 and (t.creator_id=auth.uid() or (t.visibility='public' and t.pricing_type='free')
 or exists(select 1 from public.user_themes u where u.theme_id=t.id and u.user_id=auth.uid())))));
create policy theme_object_insert on storage.objects for insert to authenticated
 with check(bucket_id in ('theme-assets','theme-previews','theme-packages')
 and split_part(name,'/',1)=auth.uid()::text
 and name !~ '(^|/)\.\.(/|$)' and name ~ '^[a-zA-Z0-9_./-]+$'
 and (not exists(select 1 from public.themes t where t.id::text=split_part(name,'/',2))
 or exists(select 1 from public.themes t where t.id::text=split_part(name,'/',2) and t.creator_id=auth.uid())));
-- No update policy: published object paths are immutable; each save has a new revision prefix.
-- Rollback can delete only unreferenced objects owned by the uploader. Uninstall never deletes originals.
create policy theme_object_cleanup on storage.objects for delete to authenticated
 using(bucket_id in ('theme-assets','theme-previews','theme-packages') and split_part(name,'/',1)=auth.uid()::text
 and not exists(select 1 from public.themes t where t.id::text=split_part(name,'/',2)
 and split_part(t.package_url,'/',3)=split_part(name,'/',3)));
